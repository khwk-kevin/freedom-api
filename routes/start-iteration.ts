/**
 * POST /apps/start-iteration
 *
 * Wakes the merchant's Railway builder service and returns the dev URL
 * for the iframe + current token balance.
 *
 * Body:     { merchantId: string }
 * Response: { devUrl: string, tokenBalance: number }
 * Error:    { error: string }
 */

import { Router, Request, Response } from 'express';
import { startIterationSession } from '../lib/app-builder/iteration';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const { merchantId } = req.body as { merchantId?: string };

  if (!merchantId || typeof merchantId !== 'string') {
    return res.status(400).json({ error: 'merchantId is required' });
  }

  try {
    const { devUrl, spec } = await startIterationSession(merchantId);

    return res.json({
      devUrl,
      tokenBalance: spec.tokenBalance,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[POST /apps/start-iteration]', message);

    if (message.includes('No app found')) {
      return res.status(404).json({ error: message });
    }

    return res
      .status(500)
      .json({ error: `Failed to start iteration session: ${message}` });
  }
});

export default router;
