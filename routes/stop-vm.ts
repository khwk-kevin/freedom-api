/**
 * POST /apps/stop-vm
 *
 * Commits vault changes to Git, stops the Railway builder service,
 * and marks the merchant's spec as 'deployed'.
 *
 * Body:     { merchantId: string }
 * Response: { success: true }
 * Error:    { error: string }
 */

import { Router, Request, Response } from 'express';
import { endIterationSession } from '../lib/app-builder/iteration';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const { merchantId } = req.body as { merchantId?: string };

  if (!merchantId || typeof merchantId !== 'string') {
    return res.status(400).json({ error: 'merchantId is required' });
  }

  try {
    await endIterationSession(merchantId);
    return res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[POST /apps/stop-vm]', message);

    if (message.includes('No app found')) {
      return res.status(404).json({ error: message });
    }

    return res.status(500).json({ error: `Failed to stop VM: ${message}` });
  }
});

export default router;
