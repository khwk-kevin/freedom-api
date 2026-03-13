/**
 * Freedom World App Builder — Build Cost + Performance Tracker
 * Adapted: imports use relative paths.
 */

import { createServiceClient } from '../supabase/server';
import type { BuildTrigger } from './types';

export const RAILWAY_COST_PER_SECOND = 0.000008;

export function estimateBuildCostUsd(durationMs: number): number {
  return (durationMs / 1000) * RAILWAY_COST_PER_SECOND;
}

export async function recordBuildTask(
  merchantId: string,
  trigger: BuildTrigger,
  durationMs: number,
  success: boolean,
  error?: string
): Promise<void> {
  const supabase = createServiceClient();

  const completedAt = new Date();
  const startedAt = new Date(completedAt.getTime() - durationMs);

  const { error: dbError } = await supabase.from('build_tasks').insert({
    merchant_id: merchantId,
    trigger,
    status: success ? 'success' : 'failed',
    prompt: trigger,
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    error: error ?? null,
  });

  if (dbError) {
    console.error(
      `[cost-tracker] recordBuildTask failed for merchant ${merchantId}: ${dbError.message}`
    );
  }
}

export async function getMerchantBuildCost(
  merchantId: string
): Promise<{ totalMs: number; estimatedUsd: number; taskCount: number }> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('build_tasks')
    .select('duration_ms')
    .eq('merchant_id', merchantId)
    .not('duration_ms', 'is', null);

  if (error) {
    throw new Error(
      `getMerchantBuildCost failed for merchant ${merchantId}: ${error.message}`
    );
  }

  const rows = data ?? [];
  const totalMs = rows.reduce(
    (sum, row) => sum + ((row.duration_ms as number | null) ?? 0),
    0
  );

  return {
    totalMs,
    estimatedUsd: estimateBuildCostUsd(totalMs),
    taskCount: rows.length,
  };
}
