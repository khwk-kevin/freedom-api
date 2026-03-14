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

    // ── Step 2: Write vault files ───────────────────────────
    progress('vault_start', 'Writing your app spec...');
    const vaultFiles = generateVaultFiles(spec);
    for (const file of vaultFiles) {
      await writeBuildFile(merchantId, file.path, file.content);
    }
    progress('vault_done', 'App spec saved ✓');

    // ── Step 3: Pass 1 — Structure & Layout ─────────────────
    progress('build_start', 'Building your app with AI...');

    const businessType = spec.businessType || spec.category || 'app';
    const businessName = spec.businessName || 'the app';
    const description = spec.ideaDescription || spec.scrapedData?.description || `a ${businessType} app`;
    const uiStyle = spec.uiStyle || 'outlined';
    const primaryColor = spec.primaryColor || '#10F48B';
    const mood = spec.mood || 'modern';

    // Products summary for the prompt
    const productNames = spec.products?.slice(0, 5).map(p => p.name).join(', ') || '';
    const productHint = productNames ? ` Products/items: ${productNames}.` : '';

    // Audience hint
    const audienceHint = spec.audienceDescription ? ` Target audience: ${spec.audienceDescription}.` : '';

    const buildPrompt =
      `Read CLAUDE.md first — it contains the EXACT requirements for this specific app. ` +
      `This is "${businessName}" — ${description}. ` +
      `Build a UNIQUE ${businessType} app that looks and feels custom-built for this purpose. ` +
      `NOT a generic template — the layout, hero, sections, and interactions should all be specific to a ${businessType}.${productHint}${audienceHint} ` +
      `Design: ${mood} mood, ${uiStyle} style, primary color ${primaryColor}. Use the background color from design/theme.json — do NOT assume dark theme. ` +
      `Use real data from context/business.md. No placeholder text. Mobile-first. ` +
      `After building, run the TypeScript compiler to verify no errors. ` +
      `Focus on page structure, routing, and component hierarchy. Use real data from context/business.md and design tokens from design/theme.json.`;

    const claudeResult = await runClaudeCodeBuild(merchantId, buildPrompt);

    if (!claudeResult.success) {
      progress('build_failed', 'Build had issues, attempting fix...');
      // Try to continue — the static build step will catch real errors
    }
    progress('build_done', 'App built ✓');

    // ── Step 4: Pass 2 — Self-Review ────────────────────────
    progress('review_start', 'Reviewing against your requirements...');

    const checklist = generateSelfReviewChecklist(spec);
    const reviewPrompt =
      `Self-review against CLAUDE.md. Check the following spec-specific requirements:\n${checklist}\n\n` +
      `Also verify: 1) Do all required pages exist? 2) Are ALL products from context/business.md displayed with real names/prices? ` +
      `3) Does the color scheme match design/theme.json? 4) Is the layout unique to this business type or generic? ` +
      `5) Is there a clear CTA on the homepage? 6) Does mobile work at 375px? Fix anything that fails.`;

    const reviewResult = await runClaudeCodeBuild(merchantId, reviewPrompt);

    if (!reviewResult.success) {
      console.warn(`[deploy] Pass 2 (self-review) failed for ${merchantId} — continuing.`);
    }
    progress('review_done', 'Review complete ✓');

    // ── Step 5: Pass 3 — QA & Polish ────────────────────────
    progress('polish_start', 'Final polish...');

    const polishPrompt =
      `Final QA. 1) Remove any placeholder text (Lorem ipsum, Your Business Here). ` +
      `2) Ensure images reference real paths in /public/assets/. ` +
      `3) Check buttons and links have hover states. ` +
      `4) Verify primary CTA is above the fold on mobile. ` +
      `5) Ensure consistent spacing and typography. ` +
      `6) Run TypeScript compiler and fix errors.`;

    const polishResult = await runClaudeCodeBuild(merchantId, polishPrompt);

    if (!polishResult.success) {
      console.warn(`[deploy] Pass 3 (QA & polish) failed for ${merchantId} — continuing.`);
    }
    progress('polish_done', 'Polish complete ✓');

    // ── Step 6: Static export ───────────────────────────────
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

    // ── Step 7: Git push ────────────────────────────────────
    progress('deploy_start', 'Deploying to your domain...');
    await gitPushBuild(merchantId);

    // ── Step 8: Vercel project + domain ─────────────────────
    const slug = await resolveUniqueSlug(businessName);
    const domain = `${slug}.app.freedom.world`;
    const projectName = `fw-app-${slug}`;

    const { projectId: vercelProjectId } = await createVercelProject(slug);
    await assignVercelDomain(vercelProjectId, domain);

    // ── Step 9: Cloudflare DNS ──────────────────────────────
    const { recordId: cloudflareRecordId } = await createMerchantDnsRecord(slug);

    // ── Step 10: Upload static files directly to Vercel ─────
    progress('upload_start', 'Uploading app files to Vercel...');
    const buildFiles = await readBuildOutputFiles(merchantId);
    await deployFilesToVercel(vercelProjectId, projectName, buildFiles);
    progress('upload_done', 'Files uploaded ✓');

    const productionUrl = `https://${domain}`;
    progress('deploy_done', 'Deployed ✓');

    // ── Step 11: Persist ────────────────────────────────────
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
