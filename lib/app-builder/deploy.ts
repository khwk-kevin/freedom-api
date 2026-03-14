/**
 * Freedom World App Builder — Production Deploy Flow (v3)
 *
 * Architecture:
 *   Phase 1 (pre-signup):  Generate preview via AppSpec → preview URL with URL params
 *   Phase 2 (post-signup): Full deploy — generate page.tsx → build → Vercel + Cloudflare
 *
 * The heavy build (clone → generate → compile → upload) only runs AFTER signup.
 * Pre-signup users see a live preview powered by the template's URL-param parsing.
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
import { generateCustomLayoutTsx } from './layout-generator';
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

/**
 * Generates a preview URL that loads the template with the merchant's AppSpec
 * encoded as URL params. No build container, no Vercel project needed.
 *
 * Used during the interview before signup to show users what their app looks like.
 */
export function generatePreviewUrl(spec: MerchantAppSpec): string {
  const TEMPLATE_BASE = process.env.PREVIEW_TEMPLATE_URL ?? 'https://freedom-app-builder.vercel.app';

  // Build a minimal spec for URL params (keep it under URL length limits)
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
// BUILD ERROR HANDLER
// ============================================================

async function runBuildWithRetry(
  merchantId: string
): Promise<{ success: true } | { success: false; sanitizedLogs: string }> {
  const buildResult = await runStaticBuild(merchantId);
  if (buildResult.success) return { success: true };
  console.error(`[deploy] Build failed for ${merchantId}: ${buildResult.logs?.slice(0, 500)}`);
  return { success: false, sanitizedLogs: sanitizeErrorForUser(buildResult.logs) };
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
 *  2. Generate custom page.tsx + layout.tsx from MerchantAppSpec
 *  3. Write files to build container
 *  4. Run npm run build (static export)
 *  5. Upload static files to Vercel
 *  6. Create Cloudflare CNAME
 *  7. Persist to Supabase
 *  8. Cleanup
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

    // ── Step 2: Generate custom page.tsx + layout.tsx ────────
    progress('generate_start', 'Generating your custom app...');

    const customPageTsx = generateCustomPageTsx(spec);
    const customLayoutTsx = generateCustomLayoutTsx(spec);

    // Write both files to build container
    await writeBuildFile(merchantId, 'src/app/page.tsx', customPageTsx);
    await writeBuildFile(merchantId, 'src/app/layout.tsx', customLayoutTsx);

    progress('generate_done', 'App generated ✓');

    // ── Step 3: Static export (npm run build) ───────────────
    progress('compile_start', 'Compiling your app...');
    const buildPassed = await runBuildWithRetry(merchantId);

    if (!buildPassed.success) {
      await cleanupBuildEnvironment(merchantId);
      return {
        error: 'Build failed. Our team has been notified.',
        buildLogs: buildPassed.sanitizedLogs,
      };
    }
    progress('compile_done', 'Compiled ✓');

    // ── Step 4: Git push (for version control) ──────────────
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

    // ── Step 7: Upload static files to Vercel ───────────────
    progress('upload_start', 'Uploading app files...');
    const buildFiles = await readBuildOutputFiles(merchantId);
    await deployFilesToVercel(vercelProjectId, projectName, buildFiles);
    progress('upload_done', 'Files uploaded ✓');

    const productionUrl = `https://${domain}`;
    progress('deploy_done', `Live at ${productionUrl} ✓`);

    // ── Step 8: Persist to Supabase ─────────────────────────
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
