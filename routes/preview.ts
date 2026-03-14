/**
 * POST /apps/preview
 *
 * Generates a preview URL for the merchant's app WITHOUT triggering a full build.
 * Used during the onboarding interview (pre-signup) to show users what their app
 * will look like — no build container, no Vercel project needed.
 *
 * The preview loads the template with the AppSpec encoded as URL params.
 *
 * Body:     { merchantId: string, onboardingData?: Record<string, unknown> }
 * Response: { previewUrl: string, appSpec: AppSpec }
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { generatePreviewUrl } from '../lib/app-builder/deploy';
import type { MerchantAppSpec } from '../lib/app-builder/types';

const router = Router();

const previewSchema = z.object({
  merchantId: z.string(),
  onboardingData: z.record(z.string(), z.unknown()).optional(),
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = previewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { merchantId, onboardingData } = parsed.data;
  const data = onboardingData || {};

  // Parse products (handle both string and object formats)
  let products: { name: string; price?: number; description?: string; category?: string }[] = [];
  if (Array.isArray(data.products)) {
    products = (data.products as unknown[]).map(p => {
      if (typeof p === 'string') {
        const [name, priceStr] = p.split(':');
        const price = parseFloat(priceStr?.replace(/[^0-9.]/g, '') || '');
        return { name: name?.trim() || '', price: isNaN(price) ? undefined : price };
      }
      if (typeof p === 'object' && p !== null) {
        const obj = p as Record<string, unknown>;
        const price = typeof obj.price === 'number' ? obj.price : parseFloat(String(obj.price || '').replace(/[^0-9.]/g, ''));
        return {
          name: String(obj.name || ''),
          price: isNaN(price) ? undefined : price,
          description: obj.description ? String(obj.description) : undefined,
          category: obj.category ? String(obj.category) : undefined,
        };
      }
      return { name: String(p) };
    }).filter(p => p.name);
  }

  // Build minimal MerchantAppSpec for preview URL generation
  const spec: Partial<MerchantAppSpec> = {
    id: merchantId,
    businessName: String(data.name || 'Your App'),
    businessType: String(data.businessType || 'other'),
    category: String(data.businessType || ''),
    primaryColor: String(data.primaryColor || '#10F48B'),
    mood: String(data.vibe || 'modern'),
    uiStyle: String(data.uiStyle || 'bold'),
    ideaDescription: String(data.description || ''),
    audienceDescription: String(data.audiencePersona || ''),
    coreActions: Array.isArray(data.coreActions) ? data.coreActions.map(String) : [],
    conversionGoal: String(data.heroFeature || ''),
    products: products as MerchantAppSpec['products'],
  };

  const previewUrl = generatePreviewUrl(spec as MerchantAppSpec);

  res.json({
    previewUrl,
    merchantId,
    message: 'Preview ready — sign up to deploy your custom app!',
  });
});

export default router;
