/**
 * Freedom World App Builder — Token Budget System
 * Adapted: imports use relative paths.
 */

import { createServiceClient } from '../supabase/server';
import type { BuildTrigger } from './types';

export const FREE_TIER_TOKENS = 10_000;

const TOKEN_ESTIMATES: Record<BuildTrigger, number> = {
  // Phase 1a — triggers a substantive build
  scrape_complete: 2000,
  idea_described: 2000,
  core_actions_set: 1500,
  monetization_set: 800,
  // Phase 1b — incremental updates
  key_screens_set: 1500,
  mvp_scope_set: 1000,
  products_added: 1000,
  priorities_set: 800,
  audience_defined: 500,
  anti_prefs_set: 500,
  features_selected: 500,
  // Visual overrides (usually auto-generated, cheap to apply)
  mood_selected: 400,
  color_changed: 200,
  // Iteration
  ad_hoc_request: 800,
};

export function estimateTaskTokens(trigger: BuildTrigger): number {
  return TOKEN_ESTIMATES[trigger] ?? 500;
}

export async function getTokenBalance(merchantId: string): Promise<number> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('merchant_apps')
    .select('token_balance')
    .eq('id', merchantId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return FREE_TIER_TOKENS;
    throw new Error(`getTokenBalance failed for ${merchantId}: ${error.message}`);
  }

  return (data?.token_balance as number) ?? FREE_TIER_TOKENS;
}

export async function isTokenBudgetExhausted(merchantId: string): Promise<boolean> {
  const balance = await getTokenBalance(merchantId);
  return balance <= 0;
}

export async function deductTokens(
  merchantId: string,
  amount: number
): Promise<{ remaining: number; isExhausted: boolean }> {
  const supabase = createServiceClient();

  const { data: rpcData, error: rpcError } = await supabase.rpc('deduct_tokens', {
    p_merchant_id: merchantId,
    p_amount: amount,
  });

  if (!rpcError && rpcData !== null) {
    const remaining = Math.max(0, rpcData as number);
    return { remaining, isExhausted: remaining <= 0 };
  }

  const currentBalance = await getTokenBalance(merchantId);
  const newBalance = Math.max(0, currentBalance - amount);
  const currentUsed = await _getTokenUsed(merchantId);
  const newUsed = Math.max(0, currentUsed) + amount;

  const { error: updateError } = await supabase
    .from('merchant_apps')
    .update({
      token_balance: newBalance,
      token_used: newUsed,
      updated_at: new Date().toISOString(),
    })
    .eq('id', merchantId);

  if (updateError) {
    throw new Error(`deductTokens failed for ${merchantId}: ${updateError.message}`);
  }

  return { remaining: newBalance, isExhausted: newBalance <= 0 };
}

export async function addTokens(merchantId: string, amount: number): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await supabase.rpc('add_tokens', {
    p_merchant_id: merchantId,
    p_amount: amount,
  });

  if (!error) return;

  const currentBalance = await getTokenBalance(merchantId);
  const newBalance = currentBalance + amount;

  const { error: updateError } = await supabase
    .from('merchant_apps')
    .update({ token_balance: newBalance, updated_at: new Date().toISOString() })
    .eq('id', merchantId);

  if (updateError) {
    throw new Error(`addTokens failed for ${merchantId}: ${updateError.message}`);
  }
}

async function _getTokenUsed(merchantId: string): Promise<number> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('merchant_apps')
    .select('token_used')
    .eq('id', merchantId)
    .single();

  if (error || !data) return 0;
  return (data.token_used as number) ?? 0;
}
