/**
 * POST /apps/provision
 *
 * Provisions a GitHub repo + Railway project/service for a merchant.
 *
 * Body:     { merchantId: string, category?: string }
 * Response: { projectId, serviceId, devUrl, repoUrl, cloneUrl }
 */

import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { createMerchantProject, getServiceDevUrl } from '../lib/app-builder/railway';
import { createMerchantRepo, repoExists } from '../lib/app-builder/github';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const { merchantId, category = 'unknown' } = req.body as {
      merchantId?: string;
      category?: string;
    };

    if (!merchantId || typeof merchantId !== 'string') {
      return res.status(400).json({
        error: 'merchantId is required and must be a string',
      });
    }

    const safeId = merchantId.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 50);
    if (safeId !== merchantId) {
      console.warn(`[provision] merchantId sanitized: "${merchantId}" → "${safeId}"`);
    }

    console.log(
      `[provision] Provisioning for merchant: ${safeId} (category: ${category})`
    );

    // ── Step 1: Create GitHub repo ────────────────────────────────────────────

    const alreadyExists = await repoExists(safeId);
    let repoUrl = '';
    let cloneUrl = '';

    if (alreadyExists) {
      console.warn(`[provision] Repo already exists for ${safeId} — skipping GitHub creation`);
      const org = process.env.GITHUB_ORG ?? 'freedom-world';
      const name = `fw-app-${safeId}`;
      repoUrl = `https://github.com/${org}/${name}`;
      cloneUrl = `https://github.com/${org}/${name}.git`;
    } else {
      const repoResult = await createMerchantRepo(safeId, category);
      repoUrl = repoResult.repoUrl;
      cloneUrl = repoResult.cloneUrl;
      console.log(`[provision] GitHub repo created: ${repoUrl}`);
    }

    // ── Step 2: Create Railway project + service ──────────────────────────────

    console.log(`[provision] Creating Railway project for merchant: ${safeId}`);
    const { projectId, serviceId } = await createMerchantProject(safeId);
    console.log(`[provision] Created project=${projectId} service=${serviceId}`);

    // ── Step 3: Get dev URL (best-effort) ─────────────────────────────────────

    let devUrl = '';
    try {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      devUrl = await getServiceDevUrl(serviceId);
    } catch (err) {
      console.warn(
        `[provision] Domain not yet available for service ${serviceId}:`,
        err
      );
    }

    // ── Step 4: Persist to Supabase ──────────────────────────────────────────

    try {
      const supabase = createClient(
        process.env.SUPABASE_URL ?? '',
        process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
      );
      await supabase.from('merchant_apps').upsert(
        {
          slug: safeId,
          status: 'provisioned',
          app_type: category ?? 'business',
          railway_project_id: projectId,
          railway_service_id: serviceId,
          github_repo_url: repoUrl,
          token_balance: 1000,
          token_used: 0,
          region: process.env.RAILWAY_REGION ?? 'asia-southeast1',
        },
        { onConflict: 'slug' }
      );
    } catch (dbErr) {
      console.warn('[provision] DB write failed (non-fatal):', dbErr);
    }

    return res.status(201).json({ projectId, serviceId, devUrl, repoUrl, cloneUrl });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('[provision] Error:', error.message);
    return res.status(500).json({
      error: 'Failed to provision app infrastructure',
      details: error.message,
    });
  }
});

export default router;
