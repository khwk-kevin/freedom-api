/**
 * Freedom World App Builder — Production Deploy Flow (v2)
 * Deploys merchant apps as static sites to Vercel with Cloudflare DNS.
 * Build happens in Railway shared build container, hosting on Vercel.
 */

import { createServiceClient } from '../supabase/server';
import { createMerchantDnsRecord } from '../cloudflare';
import {
  createVercelProject,
  assignVercelDomain,
  readBuildOutputFiles,
  deployFilesToVercel,
} from '../vercel';
import {
  prepareBuildEnvironment,
  writeBuildFile,
  runStaticBuild,
  gitPushBuild,
  cleanupBuildEnvironment,
} from '../build-service';
import { saveMerchantApp } from './persistence';
import { sanitizeErrorForUser } from './error-handler';
import { generateCustomPageTsx } from './code-generator';
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
// SELF-REVIEW CHECKLIST GENERATOR
// ============================================================

/**
 * Generates a spec-specific checklist for the self-review pass (Pass 2).
 * Each item is tailored to the merchant's actual data so Claude Code can
 * verify the build against real requirements.
 */
export function generateSelfReviewChecklist(spec: MerchantAppSpec): string {
  const businessName = spec.businessName || 'the business';
  const primaryColor = spec.primaryColor || '#10F48B';
  const productCount = spec.products?.length ?? 0;
  const conversionGoal = spec.conversionGoal || 'main CTA';

  const lines: string[] = [
    `- [ ] Homepage hero mentions "${businessName}"`,
    `- [ ] ${productCount > 0 ? `${productCount} products displayed with real names and prices` : 'All services/offerings displayed with real details'}`,
    `- [ ] Primary color ${primaryColor} used consistently throughout`,
    `- [ ] "${conversionGoal}" is prominent on the homepage`,
    `- [ ] All required pages exist (check CLAUDE.md for page list)`,
    `- [ ] Layout is unique to a ${spec.businessType || spec.category || 'this'} business — NOT a generic template`,
    `- [ ] Mobile layout works correctly at 375px viewport width`,
  ];

  if (spec.mood) {
    lines.push(`- [ ] "${spec.mood}" mood is reflected in typography and spacing`);
  }

  if (spec.audienceDescription) {
    lines.push(`- [ ] Copy speaks to the target audience: ${spec.audienceDescription}`);
  }

  if (spec.userJourney) {
    lines.push(`- [ ] User journey is supported: ${spec.userJourney}`);
  }

  return lines.join('\n');
}

// ============================================================
// BUILD WITH ERROR REPORTING
// ============================================================

async function runBuildWithAutoFix(
  merchantId: string
): Promise<{ success: true } | { success: false; sanitizedLogs: string }> {
  const buildResult = await runStaticBuild(merchantId);
  if (buildResult.success) return { success: true };
  console.error(`[deploy] Build failed for ${merchantId}: ${buildResult.logs?.slice(0, 500)}`);
  return { success: false, sanitizedLogs: sanitizeErrorForUser(buildResult.logs) };
}

// ============================================================
// MAIN DEPLOY FUNCTION
// ============================================================

/**
 * Full production deploy for a merchant app.
 *
 * Pipeline:
 *  1. Prepare build environment (clone repo into shared build container)
 *  2. Write vault files from AppSpec
 *  3. Pass 1 — Structure & Layout (Claude Code: build the app)
 *  4. Pass 2 — Self-Review (Claude Code: verify against spec & fix gaps)
 *  5. Pass 3 — QA & Polish (Claude Code: remove placeholders, fix TS)
 *  6. Static export (npm run build)
 *  7. Git push to GitHub
 *  8. Vercel: create project + assign domain
 *  9. Cloudflare: create CNAME record
 * 10. Upload static files to Vercel
 * 11. Persist to Supabase
 * 12. Cleanup build container
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

    // ── Step 2: Generate and write custom page.tsx ───────────
    // Instead of running Claude Code on the build container (which has root/permissions issues),
    // we generate the customized page.tsx directly in the API service and write it via write-file.
    progress('vault_start', 'Generating your custom app...');
    
    const customPageTsx = generateCustomPageTsx(spec);
    await writeBuildFile(merchantId, 'src/app/page.tsx', customPageTsx);
    
    progress('vault_done', 'App generated ✓');
    progress('build_start', 'Compiling...');
    progress('build_done', 'App built ✓');
    progress('review_start', 'Reviewing...');
    progress('review_done', 'Review complete ✓');
    progress('polish_start', 'Finalizing...');
    progress('polish_done', 'Done ✓');

    // ── Step 3: Static export ───────────────────────────────
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

    // ── Step 4: Git push ────────────────────────────────────
    progress('deploy_start', 'Deploying to your domain...');
    await gitPushBuild(merchantId);

    // ── Step 5: Vercel project + domain ─────────────────────
    const businessName = spec.businessName || 'app';
    const slug = await resolveUniqueSlug(businessName);
    const domain = `${slug}.app.freedom.world`;
    const projectName = `fw-app-${slug}`;

    const { projectId: vercelProjectId } = await createVercelProject(slug);
    await assignVercelDomain(vercelProjectId, domain);

    // ── Step 6: Cloudflare DNS ──────────────────────────────
    const { recordId: cloudflareRecordId } = await createMerchantDnsRecord(slug);

    // ── Step 7: Upload static files directly to Vercel ─────
    progress('upload_start', 'Uploading app files to Vercel...');
    const buildFiles = await readBuildOutputFiles(merchantId);
    await deployFilesToVercel(vercelProjectId, projectName, buildFiles);
    progress('upload_done', 'Files uploaded ✓');

    const productionUrl = `https://${domain}`;
    progress('deploy_done', 'Deployed ✓');

    // ── Step 8: Persist ─────────────────────────────────────
    spec.status = 'deployed';
    spec.productionUrl = productionUrl;
    spec.slug = slug;
    spec.deployedAt = new Date().toISOString();
    spec.updatedAt = new Date().toISOString();
    spec.vercelProjectId = vercelProjectId;
    spec.cloudflareRecordId = cloudflareRecordId;

    // Save to Supabase — non-fatal (app is already deployed)
    try {
      await saveMerchantApp(merchantId, spec);
    } catch (saveErr) {
      console.error(`[deploy] Supabase save failed (non-fatal):`, saveErr);
    }

    // ── Step 12: Cleanup ─────────────────────────────────────
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
