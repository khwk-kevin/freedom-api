/**
 * POST /apps/build
 *
 * Enqueues a build task for a merchant.
 * Body:     { merchantId: string, trigger: BuildTrigger, adHocMessage?: string, spec: MerchantAppSpec }
 * Response: { success: boolean, taskId: string }
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { BuildTrigger, MerchantAppSpec } from '../lib/app-builder/types';
import { enqueueBuildTask } from '../lib/app-builder/build-dispatcher';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const body = req.body as {
    merchantId?: string;
    trigger?: BuildTrigger;
    adHocMessage?: string;
    spec?: MerchantAppSpec;
  };

  const { merchantId, trigger, adHocMessage, spec } = body;

  if (!merchantId || typeof merchantId !== 'string') {
    return res
      .status(400)
      .json({ success: false, error: 'merchantId is required' });
  }

  if (!trigger || typeof trigger !== 'string') {
    return res
      .status(400)
      .json({ success: false, error: 'trigger is required' });
  }

  if (!spec) {
    return res.status(400).json({
      success: false,
      error: 'spec is required (MerchantAppSpec)',
    });
  }

  const taskId = randomUUID();

  // Enqueue asynchronously — return 202 immediately
  enqueueBuildTask(merchantId, trigger as BuildTrigger, spec, adHocMessage).catch(
    (err) => {
      console.error(`[BuildDispatcher] Task ${taskId} failed:`, err);
    }
  );

  return res.status(202).json({ success: true, taskId });
});

export default router;
