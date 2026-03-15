/**
 * POST /apps/build-app
 *
 * Full deploy pipeline: provision → generate → build → Vercel deploy.
 * Returns SSE progress events throughout the process.
 *
 * This endpoint should only be called AFTER the user has signed up.
 * For pre-signup previews, use POST /apps/preview instead.
 *
 * Body:     { merchantId: string, spec?: AppSpec, onboardingData?: Record<string, unknown> }
 * Response: text/event-stream SSE
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  type AppSpec,
  calculateCompleteness,
} from '../lib/app-builder/app-spec';
import { createMerchantRepo, repoExists } from '../lib/app-builder/github';
import { deployMerchantApp } from '../lib/app-builder/deploy';
import { startBuild, addStep, getProgress } from '../lib/app-builder/build-progress';
import type { MerchantAppSpec } from '../lib/app-builder/types';

const router = Router();

const buildAppSchema = z.object({
  merchantId: z.string(),
  spec: z.record(z.string(), z.unknown()).optional(),
  onboardingData: z.record(z.string(), z.unknown()).optional(),
});

function sendSSE(res: Response, data: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
    (res as unknown as { flush: () => void }).flush();
  }
}

/**
 * Parse onboarding data into AppSpec.
 * Handles products sent as either strings ("Name:Price") or objects ({name, price}).
 */
function buildAppSpecFromOnboarding(data: Record<string, unknown>, merchantId: string): AppSpec {
  // Parse products — handle both string format ("Pad Thai:฿120") and object format
  let products: { name: string; price?: string; description?: string; category?: string }[] = [];
  if (Array.isArray(data.products)) {
    products = (data.products as unknown[]).map(p => {
      if (typeof p === 'string') {
        const [name, price] = p.split(':');
        return { name: name?.trim() || '', price: price?.trim() || '' };
      }
      if (typeof p === 'object' && p !== null) {
        const obj = p as Record<string, unknown>;
        return {
          name: String(obj.name || ''),
          price: obj.price != null ? String(obj.price) : '',
          description: obj.description ? String(obj.description) : '',
          category: obj.category ? String(obj.category) : '',
        };
      }
      return { name: String(p), price: '' };
    }).filter(p => p.name);
  }

  // Parse coreActions from onboardingData
  const coreActions = Array.isArray(data.coreActions) ? data.coreActions.map(String) : [];

  return {
    identity: {
      name: String(data.name || 'Your App'),
      tagline: String(data.description || '').slice(0, 80),
      description: String(data.description || ''),
      type: String(data.businessType || 'other') as AppSpec['identity']['type'],
      category: String(data.businessType || ''),
    },
    brand: {
      primaryColor: String(data.primaryColor || '#10F48B'),
      vibe: (String(data.vibe || 'modern')) as AppSpec['brand']['vibe'],
      logoUrl: data.logo ? String(data.logo) : undefined,
      bannerUrl: data.banner ? String(data.banner) : undefined,
      fontStyle: 'clean',
      backgroundColor: data.backgroundColor ? String(data.backgroundColor) : undefined,
      fontFamily: data.fontFamily ? String(data.fontFamily) : undefined,
      secondaryColor: Array.isArray(data.brandColors) && (data.brandColors as string[])[1]
        ? String((data.brandColors as string[])[1])
        : undefined,
    },
    audience: {
      description: String(data.audiencePersona || ''),
    },
    products,
    features: {
      heroFeature: String(data.heroFeature || coreActions[0] || ''),
      primaryActions: coreActions as AppSpec['features']['primaryActions'],
      userFlow: String(data.userFlow || ''),
      differentiator: '',
    },
    content: {
      welcomeMessage: `Welcome to ${data.name || 'our app'}! 🎉`,
      quickActions: [
        { icon: '🛒', label: 'Order', action: 'ordering' },
        { icon: '📅', label: 'Book', action: 'booking' },
        { icon: '📍', label: 'Visit', action: 'contact' },
        { icon: '💬', label: 'Chat', action: 'messaging' },
      ],
      sections: [
        { type: 'products', title: 'Featured', enabled: true },
        { type: 'loyalty', title: 'Rewards', enabled: true },
        { type: 'feed', title: 'Updates', enabled: true },
        { type: 'contact', title: 'Contact', enabled: true },
      ],
    },
    source: {
      scrapedUrl: data.scrapedUrl ? String(data.scrapedUrl) : undefined,
      scrapedImages: Array.isArray(data.scrapedImages) ? data.scrapedImages as string[] : undefined,
    },
    meta: {
      completeness: 0,
      missingFields: [],
      createdAt: new Date().toISOString(),
      merchantId,
    },
  };
}

router.post('/', async (req: Request, res: Response) => {
  // Validate
  const parsed = buildAppSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { merchantId, spec: rawSpec, onboardingData } = parsed.data;

  // Build AppSpec from input
  let appSpec: AppSpec;
  if (rawSpec && rawSpec.identity) {
    appSpec = rawSpec as unknown as AppSpec;
  } else {
    appSpec = buildAppSpecFromOnboarding(onboardingData || {}, merchantId);
  }

  // Calculate completeness
  const { completeness, missingFields } = calculateCompleteness(appSpec);
  appSpec.meta.completeness = completeness;
  appSpec.meta.missingFields = missingFields;

  const businessName = appSpec.identity.name || 'Your App';

  const merchantSpec: MerchantAppSpec = {
    ...(appSpec as unknown as Record<string, unknown>),
    id: merchantId,
    slug: '',
    region: 'SEA',
    appType: 'business',
    primaryLanguage: 'en',
    tokenBalance: 0,
    tokenUsed: 0,
    businessName,
    businessType: appSpec.identity.type || appSpec.identity.category || 'other',
    category: appSpec.identity.category || 'other',
    uiStyle: (appSpec.brand as Record<string, unknown>).uiStyle as string || 'outlined',
    coreActions: appSpec.features.primaryActions.length > 0
      ? appSpec.features.primaryActions
      : undefined,
    ideaDescription: appSpec.identity.description,
    audienceDescription: appSpec.audience.description,
    primaryColor: appSpec.brand.primaryColor,
    mood: appSpec.brand.vibe,
    conversionGoal: appSpec.features.heroFeature,
    status: 'building',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as MerchantAppSpec;

  // ── Start build tracking ──────────────────────────────
  startBuild(merchantId);

  // Progress callback — writes to both SSE stream (if alive) and in-memory store
  let sseAlive = true;
  const progress = (step: string, message: string, extra?: Record<string, unknown>) => {
    const data = { event: 'progress', step, message, ...extra };
    addStep(merchantId, data);
    if (sseAlive) {
      try { sendSSE(res, data); } catch { sseAlive = false; }
    }
  };

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Keepalive ping every 10s
  const keepalive = setInterval(() => {
    if (sseAlive) {
      try { res.write(': keepalive\n\n'); } catch { sseAlive = false; }
    }
  }, 10_000);

  // Detect client disconnect
  res.on('close', () => { sseAlive = false; });

  // ── Run build pipeline (async — doesn't block SSE response) ──
  const runBuild = async () => {
    try {
      // Step 1: Provision GitHub repo
      progress('provision_start', 'Setting up your app...');

      const exists = await repoExists(merchantId);
      if (!exists) {
        await createMerchantRepo(merchantId, appSpec.identity.category || 'business');
        await new Promise(resolve => setTimeout(resolve, 8000));
      }

      progress('provision_github', 'Repository created ✓');

      // Steps 2-8: Full deploy pipeline
      const result = await deployMerchantApp(
        merchantId,
        merchantSpec,
        (step, message) => progress(step, message)
      );

      if ('error' in result) {
        const errorData = {
          event: 'error',
          step: 'deploy_failed',
          message: result.error,
          details: result.buildLogs,
        };
        addStep(merchantId, errorData);
        if (sseAlive) { try { sendSSE(res, errorData); } catch { sseAlive = false; } }
      } else {
        const completeData = {
          event: 'complete',
          step: 'done',
          message: `${businessName} is live! 🎉`,
          devUrl: result.productionUrl,
          projectId: merchantId,
          completeness,
        };
        addStep(merchantId, completeData);
        if (sseAlive) { try { sendSSE(res, completeData); } catch { sseAlive = false; } }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[build-app] Pipeline error:', error.message);

      const errorData = {
        event: 'error',
        step: 'pipeline_error',
        message: error.message || 'Something went wrong.',
        details: error.message,
      };
      addStep(merchantId, errorData);
      if (sseAlive) { try { sendSSE(res, errorData); } catch { sseAlive = false; } }
    } finally {
      clearInterval(keepalive);
      if (sseAlive) { try { res.end(); } catch { /* ignore */ } }
    }
  };

  // Fire and forget — don't await
  runBuild();

  // Send initial data immediately so the SSE stream starts flowing
  // (Railway proxy won't buffer if it sees data within the first few seconds)
  sendSSE(res, { event: 'progress', step: 'init', message: 'Build started...' });
});

// ── GET /apps/build-app/progress — Poll build progress ──────
router.get('/progress', (req: Request, res: Response) => {
  const merchantId = req.query.merchantId as string;
  const afterIndex = parseInt(req.query.after as string || '0', 10);

  if (!merchantId) {
    return res.status(400).json({ error: 'merchantId required' });
  }

  const progress = getProgress(merchantId, afterIndex);
  if (!progress) {
    return res.json({ steps: [], isComplete: false, isError: false, totalSteps: 0 });
  }

  return res.json(progress);
});

export default router;
