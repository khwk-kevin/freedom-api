/**
 * POST /apps/sync-freedom
 *
 * Creates/syncs a Freedom community after a merchant app is deployed.
 *
 * Body:     { merchantId: string }
 * Response: { orgId: string, communityId: string }
 * Error:    { error: string }
 */

import { Router, Request, Response } from 'express';
import { loadMerchantApp } from '../lib/app-builder/persistence';
import { syncToFreedom } from '../lib/app-builder/freedom-sync';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const { merchantId } = req.body as { merchantId?: string };

  if (!merchantId || typeof merchantId !== 'string') {
    return res.status(400).json({ error: 'merchantId is required' });
  }

  let spec;
  try {
    spec = await loadMerchantApp(merchantId);
  } catch (err) {
    console.error('[sync-freedom] loadMerchantApp error:', err);
    return res.status(500).json({ error: 'Failed to load merchant app' });
  }

  if (!spec) {
    return res
      .status(404)
      .json({ error: `No app found for merchantId: ${merchantId}` });
  }

  try {
    const { orgId, communityId } = await syncToFreedom(spec);
    return res.json({ orgId, communityId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sync-freedom] syncToFreedom error:', err);
    return res.status(500).json({ error: message });
  }
});

export default router;
