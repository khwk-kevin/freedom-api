/**
 * Freedom World App Builder — Production Deploy Flow (v2)
 * Deploys merchant apps as static sites to Vercel with Cloudflare DNS.
 * Build happens in Railway shared build container, hosting on Vercel.
 */

import { createServiceClient } from '../supabase/server';
import { createMerchantDnsRecord } from '../cloudflare';
import { createVercelProject, assignVercelDomain, waitForDeployment } from '../vercel';
import {
  prepareBuildEnvironment,
  writeBuildFile,
  runClaudeCodeBuild,
  runStaticBuild,
  gitPushBuild,
  cleanupBuildEnvironment,
} from '../build-service';
import { generateVaultFiles } from './vault-writer';
import { saveMerchantApp } from './persistence';
import { sanitizeErrorForUser } from './error-handler';
import type { MerchantAppSpec } from './types';

// ============================================================
// SLUG HELPERS
// ============================================================

export function generateSlug(businessName: string): string {
  return businessName
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
}

export async function checkSlugAvailable(slug: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('merchant_apps')
    .select('id')
    .eq('slug', slug)
    .limit(1);

  if (error) {
    throw new Error(`checkSlugAvailable failed for slug "${slug}": ${error.message}`);
  }
  return !data || data.length === 0;
}

async function resolveUniqueSlug(businessName: string): Promise<string> {
  const base = generateSlug(businessName);
  let candidate = base;
  let counter = 2;

  while (!(await checkSlugAvailable(candidate))) {
    const suffix = `-${counter}`;
    candidate = base.slice(0, 50 - suffix.length) + suffix;
    counter++;
  }
  return candidate;
}

// ============================================================
// BUILD WITH AUTO-FIX
// ============================================================

async function runBuildWithAutoFix(
  merchantId: string
): Promise<{ success: true } | { success: false; sanitizedLogs: string }> {
  // First attempt
  const buildResult = await runStaticBuild(merchantId);

  if (buildResult.success) return { success: true };

  console.warn(
    `[deploy] Initial build failed for ${merchantId}. Attempting auto-fix.`
  );

  // Auto-fix: ask Claude Code to fix build errors
  const autoFixPrompt =
    `Build failed with these errors: ${sanitizeErrorForUser(buildResult.logs)}. ` +
    `Fix the TypeScript/build errors so that \`npm run build\` succeeds.`;

  const fixResult = await runClaudeCodeBuild(merchantId, autoFixPrompt);

  if (!fixResult.success) {
    console.error(`[deploy] Auto-fix Claude Code failed for ${merchantId}.`);
    return { success: false, sanitizedLogs: sanitizeErrorForUser(buildResult.logs) };
  }

  // Retry build
  const retryResult = await runStaticBuild(merchantId);

  if (retryResult.success) {
    console.log(`[deploy] Build succeeded after auto-fix for ${merchantId}.`);
    return { success: true };
  }

  return {
    success: false,
    sanitizedLogs: sanitizeErrorForUser(retryResult.logs),
  };
}

// ============================================================
// MAIN DEPLOY FUNCTION
// ============================================================

/**
 * Full production deploy for a merchant app.
 *
 * Pipeline:
 * 1. Prepare build environment (clone repo into shared build container)
 * 2. Write vault files from AppSpec
 * 3. Run Claude Code build (customizes template)
 * 4. Static export (npm run build)
 * 5. Git push to GitHub
 * 6. Vercel: create project + assign domain
 * 7. Cloudflare: create CNAME record
 * 8. Wait for Vercel deployment
 * 9. Persist to Supabase
 * 10. Cleanup build container
 */
export async function deployMerchantApp(
  merchantId: string,
  spec: MerchantAppSpec,
  onProgress?: (step: string, message: string) => void
): Promise<{ productionUrl: string } | { error: string; buildLogs: string }> {
  const progress = onProgress ?? (() => {});
  const githubOrg = process.env.GITHUB_ORG ?? 'khwk-kevin';
  const repoName = `fw-app-${merchantId}`;
  const repoFullName = `${githubOrg}/${repoName}`;
  const cloneUrl = `https://github.com/${repoFullName}.git`;

  try {
    // ── Step 1: Prepare build environment ───────────────────
    progress('build_prepare', 'Preparing build environment...');
    await prepareBuildEnvironment(cloneUrl, merchantId);
    progress('build_ready', 'Build environment ready ✓');

    // ── Step 2: Write vault files ───────────────────────────
    progress('vault_start', 'Writing your app spec...');
    const vaultFiles = generateVaultFiles(spec);
    for (const file of vaultFiles) {
      await writeBuildFile(merchantId, file.path, file.content);
    }
    progress('vault_done', 'App spec saved ✓');

    // ── Step 3: Claude Code build ───────────────────────────
    progress('build_start', 'Building your app with AI...');

    const businessType = spec.businessType || spec.category || 'restaurant-food';
    const uiStyle = spec.uiStyle || 'outlined';

    const buildPrompt =
      `Read CLAUDE.md. You have context files in context/ and design config in design/theme.json. ` +
      `Build a complete ${businessType} app following the ${businessType} build skill in skills/build/. ` +
      `Use the ${uiStyle} design style for all components. ` +
      `Build ALL pages listed in the skill. Use real data from context/business.md. ` +
      `After building, verify there are no TypeScript errors.`;

    const claudeResult = await runClaudeCodeBuild(merchantId, buildPrompt);

    if (!claudeResult.success) {
      progress('build_failed', 'Build had issues, attempting fix...');
      // Try to continue — the static build step will catch real errors
    }
    progress('build_done', 'App built ✓');

    // ── Step 4: Static export ───────────────────────────────
    progress('export_start', 'Creating production build...');
    const buildPassed = await runBuildWithAutoFix(merchantId);

    if (!buildPassed.success) {
      await cleanupBuildEnvironment(merchantId);
      return {
        error: "Build failed. Our team has been notified.",
        buildLogs: buildPassed.sanitizedLogs,
      };
    }
    progress('export_done', 'Production build complete ✓');

    // ── Step 5: Git push ────────────────────────────────────
    progress('deploy_start', 'Deploying to your domain...');
    await gitPushBuild(merchantId);

    // ── Step 6: Vercel project + domain ─────────────────────
    const businessName = spec.businessName ?? merchantId;
    const slug = await resolveUniqueSlug(businessName);
    const domain = `${slug}.app.freedom.world`;

    const { projectId: vercelProjectId } = await createVercelProject(slug, repoFullName);
    await assignVercelDomain(vercelProjectId, domain);

    // ── Step 7: Cloudflare DNS ──────────────────────────────
    const { recordId: cloudflareRecordId } = await createMerchantDnsRecord(slug);

    // ── Step 8: Wait for deployment ─────────────────────────
    await waitForDeployment(vercelProjectId, 120_000);

    const productionUrl = `https://${domain}`;
    progress('deploy_done', 'Deployed ✓');

    // ── Step 9: Persist ─────────────────────────────────────
    spec.status = 'deployed';
    spec.productionUrl = productionUrl;
    spec.slug = slug;
    spec.deployedAt = new Date().toISOString();
    spec.updatedAt = new Date().toISOString();
    spec.vercelProjectId = vercelProjectId;
    spec.cloudflareRecordId = cloudflareRecordId;

    await saveMerchantApp(merchantId, spec);

    // ── Step 10: Cleanup ────────────────────────────────────
    void cleanupBuildEnvironment(merchantId);

    return { productionUrl };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[deploy] Error for merchant ${merchantId}:`, error.message);

    // Cleanup on error too
    void cleanupBuildEnvironment(merchantId);

    return {
      error: 'Deployment failed. Our team has been notified.',
      buildLogs: sanitizeErrorForUser(error.message),
    };
  }
}
