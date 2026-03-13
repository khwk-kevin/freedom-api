/**
 * POST /apps/deploy
 *
 * Triggers the production deploy flow for a merchant app ("Go live").
 *
 * Body:     { merchantId: string }
 * Response: { productionUrl: string }
 * Error:    { error: string, buildLogs?: string }
 */

import { Router, Request, Response } from 'express';
import { loadMerchantApp } from '../lib/app-builder/persistence';
import { deployMerchantApp } from '../lib/app-builder/deploy';

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
    console.error('[deploy route] loadMerchantApp error:', err);
    return res.status(500).json({ error: 'Failed to load merchant app' });
  }

  if (!spec) {
    return res
      .status(404)
      .json({ error: `No app found for merchantId: ${merchantId}` });
  }

  if (spec.status === 'deployed') {
    return res.status(409).json({
      error: 'App is already deployed',
      productionUrl: spec.productionUrl,
    });
  }

  let result;
  try {
    result = await deployMerchantApp(merchantId, spec);
  } catch (err) {
    console.error('[deploy route] deployMerchantApp threw:', err);
    return res
      .status(500)
      .json({ error: 'Deploy failed unexpectedly', buildLogs: String(err) });
  }

  if ('error' in result) {
    return res
      .status(422)
      .json({ error: result.error, buildLogs: result.buildLogs });
  }

  return res.json({ productionUrl: result.productionUrl });
});

export default router;
