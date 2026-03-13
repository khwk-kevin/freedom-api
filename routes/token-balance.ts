/**
 * GET /apps/token-balance?merchantId=xxx
 *
 * Returns the merchant's current token budget state.
 * Response: { balance: number, used: number, limit: number }
 */

import { Router, Request, Response } from 'express';
import { createServiceClient } from '../lib/supabase/server';
import { FREE_TIER_TOKENS } from '../lib/app-builder/token-budget';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const merchantId = req.query.merchantId as string | undefined;

  if (!merchantId) {
    return res
      .status(400)
      .json({ error: 'merchantId query parameter is required' });
  }

  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('merchant_apps')
      .select('token_balance, token_used')
      .eq('id', merchantId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Merchant not found — return default free tier allocation
        return res.json({
          balance: FREE_TIER_TOKENS,
          used: 0,
          limit: FREE_TIER_TOKENS,
        });
      }
      throw error;
    }

    const balance = (data?.token_balance as number) ?? FREE_TIER_TOKENS;
    const used = (data?.token_used as number) ?? 0;

    return res.json({ balance, used, limit: FREE_TIER_TOKENS });
  } catch (err) {
    console.error('[token-balance] error:', err);
    return res
      .status(500)
      .json({ error: 'Failed to retrieve token balance' });
  }
});

export default router;
