/**
 * GET /apps/vm-status?serviceId={serviceId}
 *
 * Checks the current status of a Railway builder service.
 *
 * Query params: serviceId (required)
 * Response: { status: 'starting' | 'ready' | 'error', devUrl?: string }
 */

import { Router, Request, Response } from 'express';
import { getServiceDevUrl, waitForServiceReady } from '../lib/app-builder/railway';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const serviceId = req.query.serviceId as string | undefined;

    if (!serviceId) {
      return res
        .status(400)
        .json({ error: 'serviceId query parameter is required' });
    }

    // Try to get the dev URL
    let devUrl: string;
    try {
      devUrl = await getServiceDevUrl(serviceId);
    } catch {
      return res.json({
        status: 'starting',
        message: 'Service domain not yet available',
      });
    }

    // Check if the service is actually responding (quick probe, 8s timeout)
    const isReady = await waitForServiceReady(serviceId, 8000);

    if (isReady) {
      return res.json({ status: 'ready', devUrl });
    }

    return res.json({
      status: 'starting',
      devUrl,
      message: 'Dev server starting...',
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('[vm-status] Error:', error.message);

    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      return res.json({ status: 'error', message: 'Service timed out' });
    }

    return res
      .status(500)
      .json({ error: 'Failed to check service status', details: error.message });
  }
});

export default router;
