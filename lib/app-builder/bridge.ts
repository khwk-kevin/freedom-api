/**
 * Bridge: OnboardingData → MerchantAppSpec
 * 
 * Maps the data collected by the existing onboarding flow (OnboardingContext)
 * into the MerchantAppSpec format expected by the app builder pipeline
 * (vault-writer, build-dispatcher, railway).
 */

import type { MerchantAppSpec } from './types';

interface OnboardingData {
  businessType?: string;
  vibe?: string;
  name?: string;
  products?: string[];
  brandStyle?: string;
  primaryColor?: string;
  logo?: string;
  banner?: string;
  rewards?: { emoji: string; title: string; description: string; type: string }[];
  welcomePost?: string;
  audiencePersona?: string;
  description?: string;
  scrapedImages?: string[];
  scrapedUrl?: string;
  location?: {
    latitude: number;
    longitude: number;
    name: string;
    address: string;
    images?: string[];
  };
}

// Vibe → mood mapping (onboarding uses "vibe", app builder uses "mood")
const VIBE_TO_MOOD: Record<string, string> = {
  'cozy': 'warm',
  'Cozy & Warm': 'warm',
  'bold': 'modern',
  'Bold & Energetic': 'modern',
  'classy': 'elegant',
  'Classy & Elegant': 'elegant',
  'playful': 'playful',
  'Playful & Fun': 'playful',
  'modern': 'clean',
  'Modern & Minimal': 'clean',
};

// Business type → category mapping
const TYPE_TO_CATEGORY: Record<string, string> = {
  'restaurant': 'restaurant-food',
  'cafe': 'restaurant-food',
  'bakery': 'restaurant-food',
  'retail': 'retail-shop',
  'shop': 'retail-shop',
  'salon': 'services',
  'spa': 'services',
  'gym': 'services',
  'clinic': 'services',
  'services': 'services',
};

/**
 * Convert onboarding data into a MerchantAppSpec suitable for the app builder.
 */
export function onboardingToSpec(
  merchantId: string,
  data: OnboardingData
): MerchantAppSpec {
  const now = new Date().toISOString();
  const mood = VIBE_TO_MOOD[data.vibe || ''] || VIBE_TO_MOOD[data.brandStyle || ''] || 'warm';
  const category = TYPE_TO_CATEGORY[data.businessType || ''] || 'restaurant-food';

  // Build product items from string array
  const products = (data.products || []).map((name, i) => ({
    name,
    price: 0,
    category: 'general',
    order: i,
  }));

  // Collect photo URLs
  const photoUrls: string[] = [];
  if (data.logo) photoUrls.push(data.logo);
  if (data.banner) photoUrls.push(data.banner);
  if (data.scrapedImages) photoUrls.push(...data.scrapedImages);
  if (data.location?.images) photoUrls.push(...data.location.images);

  const spec: MerchantAppSpec = {
    id: merchantId,
    slug: slugify(data.name || 'my-app'),
    region: 'ap-southeast-1',
    appType: 'business',
    primaryLanguage: 'th', // Thai-first
    tokenBalance: 10000,
    tokenUsed: 0,
    status: 'building',
    createdAt: now,
    updatedAt: now,

    // Business info
    businessName: data.name,
    businessType: data.businessType,
    category,
    ideaDescription: data.description,
    products,

    // Design
    mood,
    primaryColor: data.primaryColor || '#10F48B',

    // Scraped data
    scrapedData: {
      website: data.scrapedUrl,
      photos: photoUrls,
      name: data.name,
      address: data.location?.address,
      latitude: data.location?.latitude,
      longitude: data.location?.longitude,
    },

    // Audience
    audienceDescription: data.audiencePersona,
  };

  return spec;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'my-app';
}
