/**
 * GET /apps/build-status?merchantId=xxx
 *
 * Returns the current queue status for a merchant.
 * Response: { isBuilding: boolean, queueDepth: number, lastTaskResult?: BuildResult }
 */

import { Router, Request, Response } from 'express';
import { getQueueStatus } from '../lib/app-builder/build-dispatcher';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const merchantId = req.query.merchantId as string | undefined;

  if (!merchantId) {
    return res.status(400).json({
      success: false,
      error: 'merchantId query param is required',
    });
  }

  const status = getQueueStatus(merchantId);

  return res.json({
    isBuilding: status.isBuilding,
    queueDepth: status.queueDepth,
    currentTask: status.currentTask,
    lastTaskResult: status.lastTaskResult ?? null,
  });
});

export default router;
