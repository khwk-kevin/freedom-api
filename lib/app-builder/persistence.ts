/**
 * Freedom World App Builder — Persistence Layer
 * Adapted from Next.js: uses @supabase/supabase-js directly (no SSR helpers).
 */

import { createServiceClient } from '../supabase/server';
import { sshExecCommand } from './railway';
import type { MerchantAppSpec, AppBuilderSession } from './types';

// ============================================================
// MERCHANT APP PERSISTENCE
// ============================================================

export async function saveMerchantApp(
  merchantId: string,
  spec: MerchantAppSpec
): Promise<void> {
  const supabase = createServiceClient();

  const now = new Date().toISOString();

  const { error } = await supabase
    .from('merchant_apps')
    .upsert(
      {
        id: merchantId,
        slug: spec.slug,
        status: spec.status,
        app_type: spec.appType,
        business_name: spec.businessName ?? null,
        primary_language: spec.primaryLanguage,
        region: spec.region,
        freedom_user_id: spec.freedomUserId ?? null,
        freedom_org_id: spec.freedomOrgId ?? null,
        freedom_community_id: spec.freedomCommunityId ?? null,
        railway_project_id: spec.railwayProjectId ?? null,
        railway_service_id: spec.railwayServiceId ?? null,
        github_repo_url: spec.githubRepoUrl ?? null,
        token_balance: spec.tokenBalance,
        token_used: spec.tokenUsed,
        production_url: spec.productionUrl ?? null,
        deployed_at: spec.deployedAt ?? null,
        spec: spec as unknown as Record<string, unknown>,
        updated_at: now,
      },
      {
        onConflict: 'id',
      }
    );

  if (error) {
    // Non-fatal: log but don't crash the pipeline (deploy already succeeded)
    console.error(`[persistence] saveMerchantApp failed for ${merchantId}: ${error.message}`);
    // Only throw if it's not a UUID format issue (which means the app is still deployed, just not saved)
    if (!error.message.includes('uuid')) {
      throw new Error(`saveMerchantApp failed for ${merchantId}: ${error.message}`);
    }
  }
}

export async function loadMerchantApp(
  merchantId: string
): Promise<MerchantAppSpec | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('merchant_apps')
    .select('spec')
    .eq('id', merchantId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`loadMerchantApp failed for ${merchantId}: ${error.message}`);
  }

  if (!data?.spec) {
    return null;
  }

  return data.spec as unknown as MerchantAppSpec;
}

// ============================================================
// SESSION PERSISTENCE
// ============================================================

export async function saveSession(
  sessionId: string,
  data: Partial<AppBuilderSession>
): Promise<void> {
  const supabase = createServiceClient();

  const now = new Date().toISOString();

  const row: Record<string, unknown> = {
    session_id: sessionId,
    last_active_at: now,
  };

  if (data.merchantId !== undefined) row.merchant_id = data.merchantId;
  if (data.phase !== undefined) row.phase = data.phase;
  if (data.funnelStage !== undefined) row.funnel_stage = data.funnelStage;
  if (data.startedAt !== undefined) row.started_at = data.startedAt;

  const { error } = await supabase
    .from('app_builder_sessions')
    .upsert(row, { onConflict: 'session_id' });

  if (error) {
    throw new Error(`saveSession failed for ${sessionId}: ${error.message}`);
  }
}

export async function updateSessionPhase(
  sessionId: string,
  phase: string
): Promise<void> {
  const supabase = createServiceClient();

  const now = new Date().toISOString();

  const { error } = await supabase
    .from('app_builder_sessions')
    .update({ phase, last_active_at: now })
    .eq('session_id', sessionId);

  if (error) {
    throw new Error(
      `updateSessionPhase failed for session ${sessionId}: ${error.message}`
    );
  }
}

// ============================================================
// GIT VAULT COMMIT
// ============================================================

export async function commitVaultToGit(
  projectId: string,
  serviceId: string,
  commitMsg: string
): Promise<void> {
  const safeMsg = commitMsg
    .replace(/["`$\\]/g, '')
    .replace(/'/g, "''")
    .trim()
    .slice(0, 500);

  const cmd = [
    'cd /workspace',
    'git add context/ design/theme.json history/',
    `git commit -m '${safeMsg}'`,
    'git push',
  ].join(' && ');

  const result = await sshExecCommand(projectId, serviceId, cmd);

  if (result.exitCode !== 0) {
    const nothingToCommit =
      result.stdout.includes('nothing to commit') ||
      result.stderr.includes('nothing to commit');

    if (nothingToCommit) return;

    throw new Error(
      `commitVaultToGit failed (exit ${result.exitCode}):\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    );
  }
}
