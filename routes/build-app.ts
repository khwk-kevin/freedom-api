/**
 * POST /apps/build-app
 *
 * Real build pipeline: provision → vault → Claude Code → static export → Vercel deploy.
 * Returns SSE progress events throughout the process.
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
    const data = onboardingData || {};
    appSpec = {
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
      products: Array.isArray(data.products)
        ? (data.products as string[]).map(p => {
            const [name, price] = String(p).split(':');
            return { name: name?.trim() || '', price: price?.trim() || '' };
          }).filter(p => p.name)
        : [],
      features: {
        heroFeature: String(data.heroFeature || ''),
        primaryActions: [],
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

  // Calculate completeness
  const { completeness, missingFields } = calculateCompleteness(appSpec);
  appSpec.meta.completeness = completeness;
  appSpec.meta.missingFields = missingFields;

  const businessName = appSpec.identity.name || 'Your App';

  // Set up SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  try {
    // ── Step 1: Provision GitHub repo ─────────────────────
    sendSSE(res, {
      event: 'progress',
      step: 'provision_start',
      message: 'Setting up your app...',
    });

    const exists = await repoExists(merchantId);
    if (!exists) {
      await createMerchantRepo(merchantId, appSpec.identity.category || 'business');
    }

    sendSSE(res, {
      event: 'progress',
      step: 'provision_github',
      message: 'Repository created ✓',
    });

    // ── Steps 2-9: Deploy (vault → build → export → Vercel → Cloudflare) ──
    const merchantSpec: MerchantAppSpec = {
      // Pass through all spec data for vault writer (lower priority)
      ...(appSpec as unknown as Record<string, unknown>),
      // Required MerchantAppSpec fields — must come after spread so they are not overridden
      id: merchantId,
      slug: '',  // resolved to a unique slug during deploy
      region: 'SEA',
      appType: 'business',
      primaryLanguage: 'en',
      tokenBalance: 0,
      tokenUsed: 0,
      // Core identity/build fields
      businessName,
      businessType: appSpec.identity.type || appSpec.identity.category || 'other',
      category: appSpec.identity.category || 'other',
      uiStyle: (appSpec.brand as Record<string, unknown>).uiStyle as string || 'outlined',
      status: 'building',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as MerchantAppSpec;

    const result = await deployMerchantApp(
      merchantId,
      merchantSpec,
      (step, message) => {
        sendSSE(res, { event: 'progress', step, message });
      }
    );

    if ('error' in result) {
      sendSSE(res, {
        event: 'error',
        step: 'deploy_failed',
        message: result.error,
        details: result.buildLogs,
      });
    } else {
      sendSSE(res, {
        event: 'complete',
        step: 'done',
        message: `${businessName} is live! 🎉`,
        devUrl: result.productionUrl,
        appSpec,
        projectId: merchantId,
        completeness,
      });
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('[build-app] Pipeline error:', error.message);

    sendSSE(res, {
      event: 'error',
      step: 'pipeline_error',
      message: 'Something went wrong. Our team has been notified.',
      details: error.message,
    });
  } finally {
    res.end();
  }
});

export default router;
