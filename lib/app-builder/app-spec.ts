/**
 * Freedom App Spec — The structured JSON that drives everything.
 * 
 * The chat interview fills this spec field by field.
 * The app template renders directly from this spec.
 * No field = no rendering. Every pixel is data-driven.
 * 
 * RULE: The app builder CANNOT proceed until all required fields are filled.
 */

// ============================================================
// CORE SPEC SCHEMA
// ============================================================

export interface AppSpec {
  // ── Identity ──────────────────────────────────────────────
  identity: {
    name: string;                    // Business/app name
    tagline: string;                 // One-line description (max 80 chars)
    description: string;             // Full description (2-3 sentences)
    type: BusinessType;              // What kind of business
    category: string;                // Specific category (e.g., "Thai restaurant", "yoga studio")
  };

  // ── Brand ─────────────────────────────────────────────────
  brand: {
    primaryColor: string;            // Hex color (#XXXXXX)
    vibe: AppVibe;                   // Visual mood
    logoUrl?: string;                // Logo image URL (from scrape or upload)
    bannerUrl?: string;              // Banner/cover image URL
    fontStyle: FontStyle;            // Typography mood
    backgroundColor?: string;        // App background color (from scrape)
    secondaryColor?: string;         // Secondary brand color (from scrape)
    fontFamily?: string;             // Font family (from scrape, e.g. "Montserrat")
    uiStyle?: string;                // UI design style: glass | bold | outlined | gradient | neumorphic
  };

  // ── Audience ──────────────────────────────────────────────
  audience: {
    description: string;             // Who uses this app (1-2 sentences)
    ageRange?: string;               // e.g., "25-45"
    location?: string;               // e.g., "Bangkok, Sukhumvit area"
  };

  // ── Products / Services ───────────────────────────────────
  products: ProductItem[];           // Minimum 3 items required

  // ── App Features (what the app DOES) ──────────────────────
  features: {
    heroFeature: string;             // The #1 thing the app must do (user-defined)
    primaryActions: AppAction[];     // Top 3-4 actions users can take (ordering, booking, etc.)
    userFlow: string;                // How a customer uses the app (user-described)
    differentiator: string;          // What sets this app apart from competitors
  };

  // ── Content ───────────────────────────────────────────────
  content: {
    welcomeMessage: string;          // First thing users see in the feed
    quickActions: QuickAction[];     // The 4 action buttons shown on home
    sections: AppSection[];          // What sections appear in the app
  };

  // ── Source data ───────────────────────────────────────────
  source: {
    scrapedUrl?: string;             // URL that was scraped
    scrapedImages?: string[];        // Images pulled from scraping
    location?: {
      latitude: number;
      longitude: number;
      address: string;
    };
  };

  // ── Meta ──────────────────────────────────────────────────
  meta: {
    completeness: number;            // 0-100, calculated from filled fields
    missingFields: string[];         // List of empty required fields
    createdAt: string;               // ISO timestamp
    merchantId: string;
  };
}

// ============================================================
// SUPPORTING TYPES
// ============================================================

export type BusinessType = 
  | 'restaurant' | 'cafe' | 'salon' | 'retail' | 'fitness' 
  | 'pet' | 'photography' | 'service' | 'tech' | 'other';

export type AppVibe = 
  | 'warm' | 'bold' | 'minimal' | 'playful' | 'elegant' 
  | 'modern' | 'cozy' | 'vibrant' | 'classy';

export type FontStyle = 'clean' | 'rounded' | 'serif' | 'bold' | 'minimal';

export interface ProductItem {
  name: string;                      // Product/dish/service name
  price?: string;                    // Price (with or without currency)
  description?: string;              // Short description
  category?: string;                 // e.g., "Mains", "Drinks", "Services"
  imageUrl?: string;                 // Product photo
  badge?: string;                    // e.g., "Best Seller", "New", "Popular"
}

export type AppAction = 
  | 'ordering' | 'booking' | 'gallery' | 'loyalty' | 'community' 
  | 'contact' | 'delivery' | 'messaging' | 'events' | 'subscriptions';

export interface QuickAction {
  icon: string;                      // Emoji
  label: string;                     // Button label
  action: string;                    // What it does
}

export interface AppSection {
  type: 'products' | 'gallery' | 'loyalty' | 'feed' | 'contact' | 'about' | 'events';
  title: string;
  enabled: boolean;
}

// ============================================================
// EMPTY SPEC (starting point)
// ============================================================

export function createEmptySpec(merchantId: string): AppSpec {
  return {
    identity: {
      name: '',
      tagline: '',
      description: '',
      type: 'other',
      category: '',
    },
    brand: {
      primaryColor: '#10F48B',
      vibe: 'modern',
      fontStyle: 'clean',
    },
    audience: {
      description: '',
    },
    products: [],
    features: {
      heroFeature: '',
      primaryActions: [],
      userFlow: '',
      differentiator: '',
    },
    content: {
      welcomeMessage: '',
      quickActions: [],
      sections: [],
    },
    source: {},
    meta: {
      completeness: 0,
      missingFields: [],
      createdAt: new Date().toISOString(),
      merchantId,
    },
  };
}

// ============================================================
// COMPLETENESS CALCULATOR
// ============================================================

export function calculateCompleteness(spec: AppSpec): { completeness: number; missingFields: string[] } {
  const required: { path: string; check: () => boolean }[] = [
    { path: 'identity.name', check: () => !!spec.identity.name },
    { path: 'identity.tagline', check: () => !!spec.identity.tagline },
    { path: 'identity.description', check: () => !!spec.identity.description },
    { path: 'identity.type', check: () => spec.identity.type !== 'other' || !!spec.identity.category },
    { path: 'brand.primaryColor', check: () => !!spec.brand.primaryColor && spec.brand.primaryColor !== '#10F48B' },
    { path: 'brand.vibe', check: () => !!spec.brand.vibe },
    { path: 'audience.description', check: () => !!spec.audience.description },
    { path: 'products (min 3)', check: () => spec.products.length >= 3 },
    { path: 'features.heroFeature', check: () => !!spec.features.heroFeature },
    { path: 'features.primaryActions', check: () => spec.features.primaryActions.length >= 2 },
    { path: 'features.userFlow', check: () => !!spec.features.userFlow },
    { path: 'features.differentiator', check: () => !!spec.features.differentiator },
    { path: 'content.quickActions', check: () => spec.content.quickActions.length >= 3 },
  ];

  const missingFields = required.filter(r => !r.check()).map(r => r.path);
  const completeness = Math.round(((required.length - missingFields.length) / required.length) * 100);

  return { completeness, missingFields };
}

// ============================================================
// SPEC → URL PARAMS (for template app)
// ============================================================

export function specToUrlParams(spec: AppSpec): string {
  const params = new URLSearchParams();
  
  // Pass the full spec as base64-encoded JSON
  const specJson = JSON.stringify(spec);
  params.set('spec', btoa(unescape(encodeURIComponent(specJson))));
  
  return params.toString();
}

// ============================================================
// URL PARAMS → SPEC (for template app to read)
// ============================================================

export function urlParamsToSpec(searchParams: URLSearchParams): AppSpec | null {
  const specParam = searchParams.get('spec');
  if (!specParam) return null;
  
  try {
    const json = decodeURIComponent(escape(atob(specParam)));
    return JSON.parse(json) as AppSpec;
  } catch {
    return null;
  }
}
