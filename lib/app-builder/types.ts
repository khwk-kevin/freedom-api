/**
 * Freedom World App Builder — Core Types
 * Sprint 1.1 — Data Layer
 *
 * This file is the single source of truth for all app builder data structures.
 * Everything (Railway, Vault Writer, AVA, PostHog) flows through these types.
 */

// ============================================================
// ENUMS & UNIONS
// ============================================================

/** How the app was originated */
export type AppType = 'business' | 'idea';

/** Lifecycle state of the merchant's app */
export type AppStatus =
  | 'interviewing' // AVA interview in progress
  | 'building'     // Claude Code actively building
  | 'deployed'     // Live on {slug}.app.freedom.world
  | 'iterating'    // Post-deploy edits in progress
  | 'suspended';   // Paused / token budget exhausted

/** What triggered a build task */
export type BuildTrigger =
  | 'scrape_complete'    // Q2: scraper returned business data
  | 'idea_described'     // Q2: idea path — description captured
  | 'mood_selected'      // Q3: mood/vibe chosen
  | 'color_changed'      // Q4: primary color set via picker
  | 'products_added'     // Q5: products/services captured
  | 'priorities_set'     // Q6: app priority order defined
  | 'anti_prefs_set'     // Q7: anti-preferences captured
  | 'audience_defined'   // Q8: target audience described
  | 'features_selected'  // Q9: Freedom features chosen
  | 'ad_hoc_request';    // Q10 / iteration: freeform merchant request

/** Build task lifecycle */
export type BuildTaskStatus = 'queued' | 'running' | 'success' | 'failed';

/** Railway VM lifecycle */
export type VMStatus =
  | 'provisioning' // Railway project/service being created
  | 'starting'     // Container starting, dev server booting
  | 'ready'        // Dev server live, HMR active, SSH reachable
  | 'building'     // Claude Code task running
  | 'error'        // Failed state
  | 'stopped';     // Shut down (timeout / suspended)

/** Interview funnel stages — maps 1:1 to PostHog drop-off funnel */
export type FunnelStage =
  | 'page_view'
  | 'q1'
  | 'q2'
  | 'q3'
  | 'q4'
  | 'preview'
  | 'signup'
  | 'q5'
  | 'q6'
  | 'q7'
  | 'q8'
  | 'q9'
  | 'q10'
  | 'deploy'
  | 'return';

/** App builder session phases */
export type SessionPhase =
  | 'hook'         // Phase 1a: Q1–Q4, pre-signup
  | 'depth'        // Phase 1b: Q5–Q10, post-signup
  | 'deploy'       // Phase 2: finalise + deploy
  | 'iteration';   // Phase 3: post-deploy console edits

// ============================================================
// SCRAPED DATA
// ============================================================

/** Data returned from the Google Maps / website scraper */
export interface ScrapedBusinessData {
  name?: string;
  address?: string;
  lat?: number;                    // Latitude (from Google Maps / geocoding)
  lng?: number;                    // Longitude (from Google Maps / geocoding)
  phone?: string;
  website?: string;
  googleMapsUrl?: string;
  rating?: number;
  reviewCount?: number;
  hours?: Record<string, string>; // { "Monday": "09:00–22:00", ... }
  photos?: string[];               // URLs
  categories?: string[];           // Google category tags
  description?: string;
  priceLevel?: 1 | 2 | 3 | 4;    // $ to $$$$
  latitude?: number;               // GPS latitude (from Google Maps)
  longitude?: number;              // GPS longitude (from Google Maps)
  rawHtml?: string;                // Optional: scraped page HTML (for re-processing)
  scrapedAt?: string;              // ISO timestamp
}

// ============================================================
// PRODUCT / CONTENT ITEM
// ============================================================

export interface ProductItem {
  name: string;
  description?: string;
  price?: number;
  currency?: string;
  imageUrl?: string;
  category?: string;
  isAvailable?: boolean;
}

// ============================================================
// MERCHANT APP SPEC — Single source of truth
// ============================================================

export interface MerchantAppSpec {
  id: string;
  slug: string;
  region: string;

  appType: AppType;
  businessType?: string;
  category?: string;
  businessName?: string;
  ideaDescription?: string;

  mood?: string;
  moodKeywords?: string[];
  primaryColor?: string;
  secondaryColor?: string;

  products?: ProductItem[];

  appPriorities?: string[];
  antiPreferences?: string[];

  audienceDescription?: string;

  primaryLanguage: string;

  selectedFeatures?: string[];

  scrapedData?: ScrapedBusinessData;

  railwayProjectId?: string;
  railwayServiceId?: string;
  githubRepoUrl?: string;

  freedomUserId?: string;
  freedomOrgId?: string;
  freedomCommunityId?: string;

  tokenBalance: number;
  tokenUsed: number;

  uiStyle?: string;

  vercelProjectId?: string;
  cloudflareRecordId?: string;
  hostingTier?: 'free' | 'pro';

  status: AppStatus;
  productionUrl?: string;
  deployedAt?: string;

  createdAt: string;
  updatedAt: string;
}

// ============================================================
// BUILD TASK
// ============================================================

export interface BuildTask {
  id: string;
  merchantId: string;
  trigger: BuildTrigger;
  status: BuildTaskStatus;
  prompt: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
  createdAt: string;
}

// ============================================================
// VAULT FILE
// ============================================================

export interface VaultFile {
  path: string;
  content: string;
}

// ============================================================
// BUILD RESULT
// ============================================================

export interface BuildResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  error?: string;
}

// ============================================================
// APP BUILDER SESSION
// ============================================================

export interface AppBuilderSession {
  sessionId: string;
  merchantId: string;
  phase: SessionPhase;
  startedAt: string;
  lastActiveAt: string;
  funnelStage: FunnelStage;
}

// ============================================================
// VM STATE
// ============================================================

export interface VMState {
  merchantId: string;
  status: VMStatus;
  railwayProjectId?: string;
  railwayServiceId?: string;
  devServerUrl?: string;
  sshConnectionString?: string;
  provisionedAt?: string;
  lastBuildAt?: string;
  timeoutAt?: string;
}
