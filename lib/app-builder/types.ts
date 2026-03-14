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
  | 'scrape_complete'      // Q2: scraper returned business data
  | 'idea_described'       // Q2: idea path — description + core actions captured
  | 'core_actions_set'     // Q2: what users DO in the app is defined
  | 'monetization_set'     // Q3: monetization model captured
  | 'key_screens_set'      // Q4: key screen list defined
  | 'mvp_scope_set'        // Q7: MVP scope (top 3 things) defined
  | 'products_added'       // Q8: products/services captured
  | 'audience_defined'     // Q9: target audience described
  | 'priorities_set'       // priority order defined
  | 'anti_prefs_set'       // anti-preferences captured
  | 'features_selected'    // Freedom platform features chosen
  | 'mood_selected'        // user explicitly set mood/vibe (optional — usually auto-generated)
  | 'color_changed'        // user explicitly set primary color (optional — usually auto-generated)
  | 'ad_hoc_request';      // iteration: freeform merchant request

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

/** Interview funnel stages — maps 1:1 to PostHog drop-off funnel
 *
 * Phase 1a (pre-signup): q1=app type, q2=core actions, q3=monetization
 * Phase 1b (post-signup): q4=key screens, q5=user journey, q6=data model,
 *                         q7=MVP scope, q8=products, q9=audience,
 *                         q10=anti-prefs, q11=review
 */
export type FunnelStage =
  | 'page_view'
  | 'q1'   // What kind of app?
  | 'q2'   // What do users do? (core actions + source URL)
  | 'q3'   // How does it make money? (monetization)
  | 'preview'
  | 'signup'
  | 'q4'   // Key screens (infer + validate)
  | 'q5'   // First 2 minutes (user journey)
  | 'q6'   // Data model
  | 'q7'   // MVP scope
  | 'q8'   // Products / services (conditional)
  | 'q9'   // Audience
  | 'q10'  // Anti-prefs + design reference
  | 'q11'  // Review + confirm
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
  backgroundColor?: string;        // Dominant background color detected from brand website
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

  userJourney?: string;        // "browse menu → pick items → reserve table → confirm"
  conversionGoal?: string;     // "make a reservation"
  designReference?: string;    // URL for design inspiration
  firstImpression?: string;    // "warm welcome with today's specials"
  interactionStyle?: string;   // "scroll-through catalog" or "swipeable cards"

  // Product functionality (Phase 1b deep-dive)
  monetizationModel?: string;  // "subscriptions" | "one-time purchase" | "freemium" | "ads" | "marketplace commission" | "tips/donations" | "free"
  coreActions?: string[];      // What users DO in the app: ["browse menu", "place order", "track delivery"]
  appFormat?: 'interactive' | 'landing' | 'marketplace' | 'tool' | 'content' | 'booking' | 'game';
  keyScreens?: string[];       // "game board", "checkout", "dashboard", "profile", "search results"
  dataModel?: string;          // "users have profiles, post listings, other users can bid on listings"
  integrations?: string[];     // "stripe payments", "google maps", "email notifications"
  mvpScope?: string;           // What's the minimum viable set to launch

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
