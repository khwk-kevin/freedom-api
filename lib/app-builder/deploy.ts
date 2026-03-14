/**
 * Freedom World App Builder — Production Deploy Flow (v4)
 *
 * Architecture:
 *   Phase 1 (pre-signup):  Generate preview via AppSpec → preview URL with URL params
 *   Phase 2 (post-signup): Full deploy via Claude Code inside sandboxed build container
 *
 * The heavy build only runs AFTER signup. Claude Code reads vault files (CLAUDE.md,
 * context/, design/) and writes the custom page.tsx — merchant data is never directly
 * interpolated into code (prevents prompt injection).
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
import { runFullSdkBuild } from './sdk-builder';
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
// PREVIEW URL GENERATOR (pre-signup — no build needed)
// ============================================================

export function generatePreviewUrl(spec: MerchantAppSpec): string {
  const TEMPLATE_BASE = process.env.PREVIEW_TEMPLATE_URL ?? 'https://freedom-app-builder.vercel.app';

  const previewSpec = {
    identity: {
      name: spec.businessName || 'Your App',
      tagline: (spec.ideaDescription || '').slice(0, 80),
      description: (spec.ideaDescription || '').slice(0, 200),
      type: spec.businessType || 'other',
      category: spec.category || spec.businessType || '',
    },
    brand: {
      primaryColor: spec.primaryColor || '#10F48B',
      vibe: spec.mood || 'modern',
      uiStyle: spec.uiStyle || 'bold',
    },
    products: (spec.products || []).slice(0, 6).map(p => ({
      name: p.name,
      price: p.price != null ? String(p.price) : undefined,
      description: (p.description || '').slice(0, 50),
    })),
    features: {
      heroFeature: spec.coreActions?.[0] || spec.conversionGoal || '',
      primaryActions: (spec.coreActions || []).slice(0, 4),
    },
    audience: {
      description: (spec.audienceDescription || '').slice(0, 100),
    },
  };

  const encoded = encodeURIComponent(JSON.stringify(previewSpec));
  return `${TEMPLATE_BASE}?spec=${encoded}`;
}

// ============================================================
// SELF-REVIEW CHECKLIST GENERATOR
// ============================================================

function generateSelfReviewChecklist(spec: MerchantAppSpec): string {
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

  console.warn(`[deploy] Initial build failed for ${merchantId}. Attempting auto-fix via SDK.`);

  // Auto-fix: ask the SDK to fix build errors
  const { runSdkBuild } = await import('./sdk-builder');
  const autoFixPrompt =
    `The Next.js build (\`npm run build\`) failed with these errors:\n${sanitizeErrorForUser(buildResult.logs)}\n\n` +
    `Fix the TypeScript/build errors so that the build succeeds. Do not change the app logic or design.\n` +
    `Output corrected files using:\n=== FILE: path/to/file ===\n\`\`\`tsx\n... content ...\n\`\`\``;

  const fixResult = await runSdkBuild(merchantId, autoFixPrompt);
  if (!fixResult.success) {
    console.error(`[deploy] Auto-fix SDK failed for ${merchantId}.`);
    return { success: false, sanitizedLogs: sanitizeErrorForUser(buildResult.logs) };
  }

  // Retry build
  const retryResult = await runStaticBuild(merchantId);
  if (retryResult.success) {
    console.log(`[deploy] Build succeeded after auto-fix for ${merchantId}.`);
    return { success: true };
  }

  return { success: false, sanitizedLogs: sanitizeErrorForUser(retryResult.logs) };
}

// ============================================================
// MAIN DEPLOY FUNCTION (post-signup only)
// ============================================================

/**
 * Full production deploy for a merchant app.
 * This should ONLY be called after the user has signed up for Freedom World.
 *
 * Pipeline:
 *  1. Clone template repo into build container
 *  2. Write vault files (CLAUDE.md, context/, design/) from MerchantAppSpec
 *  3. Claude Code Pass 1 — Build the app (reads vault files, writes page.tsx)
 *  4. Claude Code Pass 2 — Self-review against spec
 *  5. Claude Code Pass 3 — QA & polish
 *  6. Static export (npm run build) with auto-fix
 *  7. Git push, Vercel project + domain, Cloudflare DNS
 *  8. Upload static files to Vercel
 *  9. Persist to Supabase
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
    // ── Step 1: Clone template into build container ─────────
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

    // ── Steps 3-5: SDK Build (3-pass: build → review → polish) ──
    const sdkResult = await runFullSdkBuild(
      merchantId,
      {
        businessName: spec.businessName,
        businessType: spec.businessType || spec.category,
        ideaDescription: spec.ideaDescription || spec.scrapedData?.description,
        primaryColor: spec.primaryColor,
        mood: spec.mood,
        uiStyle: spec.uiStyle,
        products: spec.products,
        audienceDescription: spec.audienceDescription,
        conversionGoal: spec.conversionGoal,
        coreActions: spec.coreActions,
        userJourney: spec.userJourney,
      },
      (step, message) => progress(step, message)
    );

    if (!sdkResult.success) {
      await cleanupBuildEnvironment(merchantId);
      return {
        error: 'AI build failed. Our team has been notified.',
        buildLogs: sdkResult.error || 'Build produced no files',
      };
    }

    // ── Step 6: Static export with auto-fix ─────────────────
    progress('export_start', 'Creating production build...');
    const buildPassed = await runBuildWithAutoFix(merchantId);

    if (!buildPassed.success) {
      await cleanupBuildEnvironment(merchantId);
      return {
        error: 'Build failed. Our team has been notified.',
        buildLogs: buildPassed.sanitizedLogs,
      };
    }
    progress('export_done', 'Production build complete ✓');

    // ── Step 7: Git push + Vercel project + Cloudflare ──────
    progress('deploy_start', 'Deploying to your domain...');
    await gitPushBuild(merchantId);

    const businessNameForSlug = spec.businessName || 'app';
    const slug = await resolveUniqueSlug(businessNameForSlug);
    const domain = `${slug}.app.freedom.world`;
    const projectName = `fw-app-${slug}`;

    const { projectId: vercelProjectId } = await createVercelProject(slug);
    await assignVercelDomain(vercelProjectId, domain);

    const { recordId: cloudflareRecordId } = await createMerchantDnsRecord(slug);

    // ── Step 8: Upload static files to Vercel ───────────────
    progress('upload_start', 'Uploading app files...');
    const buildFiles = await readBuildOutputFiles(merchantId);
    await deployFilesToVercel(vercelProjectId, projectName, buildFiles);
    progress('upload_done', 'Files uploaded ✓');

    const productionUrl = `https://${domain}`;
    progress('deploy_done', `Live at ${productionUrl} ✓`);

    // ── Step 9: Persist to Supabase ─────────────────────────
    spec.status = 'deployed';
    spec.productionUrl = productionUrl;
    spec.slug = slug;
    spec.deployedAt = new Date().toISOString();
    spec.updatedAt = new Date().toISOString();
    spec.vercelProjectId = vercelProjectId;
    spec.cloudflareRecordId = cloudflareRecordId;

    try {
      await saveMerchantApp(merchantId, spec);
    } catch (saveErr) {
      console.error(`[deploy] Supabase save failed (non-fatal):`, saveErr);
    }

    // ── Cleanup ─────────────────────────────────────────────
    void cleanupBuildEnvironment(merchantId);

    return { productionUrl };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[deploy] Error for merchant ${merchantId}:`, error.message);
    void cleanupBuildEnvironment(merchantId);

    return {
      error: 'Deployment failed. Our team has been notified.',
      buildLogs: sanitizeErrorForUser(error.message),
    };
  }
}
