/**
 * POST /apps/scrape
 *
 * Scrapes a URL and returns the scraped fields mapped to a partial MerchantAppSpec.
 * Does NOT persist anything — caller is responsible for merging with existing spec.
 *
 * Body:     { url: string, merchantId: string }
 * Response: { spec: Partial<MerchantAppSpec> }
 * Errors:   { error: string }
 */

import { Router, Request, Response } from 'express';
import { scrapeToSpec } from '../lib/app-builder/scraper-adapter';
import { MerchantAppSpec } from '../lib/app-builder/types';

const router = Router();

function createStubSpec(merchantId: string): MerchantAppSpec {
  return {
    id: merchantId,
    slug: '',
    region: process.env.RAILWAY_REGION ?? 'ap-southeast-1',
    appType: 'business',
    primaryLanguage: 'en',
    tokenBalance: 0,
    tokenUsed: 0,
    status: 'interviewing',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function extractScrapedFields(spec: MerchantAppSpec): Partial<MerchantAppSpec> {
  const scraped: Partial<MerchantAppSpec> = {};
  if (spec.businessName !== undefined) scraped.businessName = spec.businessName;
  if (spec.scrapedData !== undefined) scraped.scrapedData = spec.scrapedData;
  if (spec.businessType !== undefined) scraped.businessType = spec.businessType;
  if (spec.category !== undefined) scraped.category = spec.category;
  return scraped;
}

router.post('/', async (req: Request, res: Response) => {
  const { url, merchantId } = req.body as { url?: string; merchantId?: string };

  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    return res.status(400).json({ error: 'url is required' });
  }

  if (!merchantId || typeof merchantId !== 'string') {
    return res.status(400).json({ error: 'merchantId is required' });
  }

  if (url.length > 500) {
    return res.status(400).json({ error: 'URL too long (max 500 characters)' });
  }

  try {
    console.log(
      `[apps/scrape] Scraping for merchant=${merchantId} url=${url.slice(0, 80)}`
    );

    const stubSpec = createStubSpec(merchantId);
    const updatedSpec = await scrapeToSpec(url.trim(), stubSpec);
    const scrapedFields = extractScrapedFields(updatedSpec);

    console.log(
      `[apps/scrape] Done. businessName=${scrapedFields.businessName ?? '(none)'} ` +
        `photos=${scrapedFields.scrapedData?.photos?.length ?? 0}`
    );

    return res.status(200).json({ spec: scrapedFields });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('[apps/scrape] Error:', error.message);
    return res.status(500).json({ error: 'Scrape failed', details: error.message });
  }
});

export default router;
