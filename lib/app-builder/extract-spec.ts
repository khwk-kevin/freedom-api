/**
 * Freedom World App Builder — Tag Extraction + Spec Updater
 * Sprint 2.2
 *
 * Parses AVA's AI responses for [[TAG:value]] patterns and updates MerchantAppSpec.
 * Also handles language detection, business-type → category mapping, and input sanitisation.
 */

import type { BuildTrigger, MerchantAppSpec, ProductItem, ScrapedBusinessData } from './types';

// ============================================================
// EXTENDED RETURN TYPE
// The spec returned from updateSpecFromExtractions carries two
// ephemeral fields that callers must read then strip before
// persisting (they are NOT part of the stored spec schema).
// ============================================================

export interface ExtractedSpec extends MerchantAppSpec {
  /** Triggers that should fire after this extraction round */
  _triggers: BuildTrigger[];
  /** Set when [[STEP:phase1a_complete]] is found — show signup wall */
  _triggerSignupWall?: boolean;
  /** Set when [[STEP:phase1b_complete]] is found — kick off finalize flow */
  _triggerFinalize?: boolean;
}

// ============================================================
// CONSTANTS
// ============================================================

const MAX_INPUT_LENGTH = 4000;

/** Patterns that may be used to inject instructions into the AI pipeline */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions?/gi,
  /system\s*prompt/gi,
  /you\s+are\s+now/gi,
  /\[\[.*?\]\]/g, // strip any embedded tags in merchant input
  /<\/?[a-z][^>]*>/gi, // HTML tags
  /`{3,}/g, // code fence abuse
];

// ============================================================
// LANGUAGE DETECTION
// ============================================================

/**
 * Detect the dominant language from an array of message strings.
 * Returns an ISO 639-1 code. Falls back to 'en' if nothing matched.
 */
export function detectLanguage(messages: string[]): string {
  const combined = messages.join(' ');

  const counts: Record<string, number> = {
    th: 0,
    ja: 0,
    ko: 0,
    zh: 0,
    ar: 0,
    he: 0,
    ru: 0,
    el: 0,
  };

  for (const ch of combined) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x0e00 && cp <= 0x0e7f) counts['th']++;          // Thai
    else if (cp >= 0x3040 && cp <= 0x309f) counts['ja']++;     // Hiragana
    else if (cp >= 0x30a0 && cp <= 0x30ff) counts['ja']++;     // Katakana
    else if (cp >= 0xac00 && cp <= 0xd7af) counts['ko']++;     // Hangul syllables
    else if (cp >= 0x1100 && cp <= 0x11ff) counts['ko']++;     // Hangul Jamo
    else if (cp >= 0x4e00 && cp <= 0x9fff) counts['zh']++;     // CJK Unified
    else if (cp >= 0x3400 && cp <= 0x4dbf) counts['zh']++;     // CJK Extension A
    else if (cp >= 0x0600 && cp <= 0x06ff) counts['ar']++;     // Arabic
    else if (cp >= 0x0590 && cp <= 0x05ff) counts['he']++;     // Hebrew
    else if (cp >= 0x0400 && cp <= 0x04ff) counts['ru']++;     // Cyrillic
    else if (cp >= 0x0370 && cp <= 0x03ff) counts['el']++;     // Greek
  }

  // Japanese heuristic: if text has kanji but no hiragana/katakana, it might
  // be Chinese; require hiragana or katakana to prefer Japanese over Chinese.
  if (counts['ja'] > 0 && counts['zh'] > 0 && counts['zh'] > counts['ja'] * 3) {
    counts['ja'] = 0;
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [lang, count] of Object.entries(counts)) {
    if (count > bestCount) {
      bestCount = count;
      best = lang;
    }
  }

  // Require at least a minimal signal (> 2 characters) before overriding 'en'
  return best && bestCount > 2 ? best : 'en';
}

// ============================================================
// BUSINESS TYPE → CATEGORY MAPPING
// ============================================================

const BUSINESS_TYPE_MAP: Record<string, string> = {
  // Food & drink
  restaurant: 'restaurant-food',
  cafe: 'restaurant-food',
  coffee: 'restaurant-food',
  'coffee shop': 'restaurant-food',
  bar: 'restaurant-food',
  bakery: 'restaurant-food',
  bistro: 'restaurant-food',
  pizzeria: 'restaurant-food',
  'food truck': 'restaurant-food',
  catering: 'restaurant-food',

  // Retail
  retail: 'retail-catalog',
  shop: 'retail-catalog',
  store: 'retail-catalog',
  boutique: 'retail-catalog',
  market: 'retail-catalog',
  pharmacy: 'retail-catalog',
  bookstore: 'retail-catalog',

  // Services / beauty / wellness
  salon: 'services',
  spa: 'services',
  barbershop: 'services',
  'nail salon': 'services',
  gym: 'services',
  fitness: 'services',
  yoga: 'services',
  studio: 'services',
  clinic: 'services',
  dental: 'services',
  vet: 'services',
  laundry: 'services',
  cleaning: 'services',

  // Professional services
  agency: 'professional',
  law: 'professional',
  accounting: 'professional',
  consulting: 'professional',
  freelance: 'professional',

  // Education & community
  school: 'education',
  tutoring: 'education',
  coaching: 'education',
  community: 'community',
  ngo: 'community',
  nonprofit: 'community',
};

/**
 * Map a raw business type string (from AI extraction) to a
 * Freedom app category slug.
 */
export function mapBusinessTypeToCategory(type: string): string {
  const normalised = type.toLowerCase().trim();
  if (BUSINESS_TYPE_MAP[normalised]) {
    return BUSINESS_TYPE_MAP[normalised];
  }
  // Partial match
  for (const [key, category] of Object.entries(BUSINESS_TYPE_MAP)) {
    if (normalised.includes(key) || key.includes(normalised)) {
      return category;
    }
  }
  return 'general';
}

// ============================================================
// INPUT SANITISATION
// ============================================================

/**
 * Strip potential prompt-injection patterns from merchant freeform input
 * and enforce a maximum length.
 */
export function sanitizeMerchantInput(text: string): string {
  let sanitised = text;
  for (const pattern of INJECTION_PATTERNS) {
    sanitised = sanitised.replace(pattern, '');
  }
  // Collapse multiple whitespace runs
  sanitised = sanitised.replace(/\s{3,}/g, '  ').trim();
  // Enforce max length
  if (sanitised.length > MAX_INPUT_LENGTH) {
    sanitised = sanitised.slice(0, MAX_INPUT_LENGTH) + '…';
  }
  return sanitised;
}

// ============================================================
// TAG PARSER
// ============================================================

interface ExtractedTags {
  BUSINESS_TYPE?: string;
  SCRAPE_URL?: string;
  NAME?: string;
  MOOD?: string;
  MOOD_KEYWORDS?: string;
  MOOD_REASON?: string;
  PRIMARY_COLOR?: string;
  PRODUCTS_DETAIL?: string;
  PRIORITIES?: string;
  ANTI_PREFS?: string;
  AUDIENCE?: string;
  LANGUAGE?: string;
  FEATURES?: string;
  STEP?: string[];
  APP_TYPE?: string;
  IDEA_DESCRIPTION?: string;
}

/**
 * Extract the value of [[PRODUCTS_DETAIL:[...]]] using a bracket-depth
 * scanner instead of a regex, because the JSON array value itself contains
 * `]` characters that fool a naïve lazy match.
 *
 * Returns the raw JSON string (e.g. `[{...}]`) or undefined if not found.
 */
function extractProductsDetailValue(aiResponse: string): string | undefined {
  const prefix = '[[PRODUCTS_DETAIL:';
  const start = aiResponse.indexOf(prefix);
  if (start === -1) return undefined;

  const valueStart = start + prefix.length;
  if (aiResponse[valueStart] !== '[') return undefined; // value must be a JSON array

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = valueStart; i < aiResponse.length; i++) {
    const ch = aiResponse[i];

    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }

    if (!inString) {
      if (ch === '[') {
        depth++;
      } else if (ch === ']') {
        depth--;
        if (depth === 0) {
          // JSON array closed — confirm tag closes with ]]
          const after = aiResponse.slice(i + 1, i + 3);
          if (after === ']]') {
            return aiResponse.slice(valueStart, i + 1); // includes the closing ]
          }
          // If there's no ]] immediately after, keep scanning (malformed input)
        }
      }
    }
  }

  return undefined;
}

/**
 * Extract all [[TAG:value]] occurrences from an AI response string.
 * STEP tags can appear multiple times, so they accumulate into an array.
 * Other tags: last-wins if duplicated.
 *
 * PRODUCTS_DETAIL is extracted first with a bracket-depth scanner (because
 * its JSON value contains `]` characters that break a lazy regex match).
 */
function parseTagsFromResponse(aiResponse: string): ExtractedTags {
  const tags: ExtractedTags = {};

  // ── Handle PRODUCTS_DETAIL separately ──────────────────────
  const productsValue = extractProductsDetailValue(aiResponse);
  if (productsValue !== undefined) {
    tags['PRODUCTS_DETAIL'] = productsValue;
  }

  // ── Handle all other tags via regex ────────────────────────
  // Exclude PRODUCTS_DETAIL from the regex pass to avoid confusing it
  const withoutProducts = aiResponse.replace(/\[\[PRODUCTS_DETAIL:[\s\S]*?\]\]\]/g, '');
  const tagPattern = /\[\[([A-Z_]+):([\s\S]*?)\]\]/g;

  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(withoutProducts)) !== null) {
    const [, tagName, rawValue] = match;
    const value = rawValue.trim();

    switch (tagName) {
      case 'STEP':
        if (!tags.STEP) tags.STEP = [];
        tags.STEP.push(value);
        break;
      case 'BUSINESS_TYPE':
      case 'SCRAPE_URL':
      case 'NAME':
      case 'MOOD':
      case 'MOOD_KEYWORDS':
      case 'MOOD_REASON':
      case 'PRIMARY_COLOR':
      case 'PRIORITIES':
      case 'ANTI_PREFS':
      case 'AUDIENCE':
      case 'LANGUAGE':
      case 'FEATURES':
      case 'APP_TYPE':
      case 'IDEA_DESCRIPTION':
        (tags as Record<string, string>)[tagName] = value;
        break;
      default:
        // Unknown tag — ignore
        break;
    }
  }

  return tags;
}

/**
 * Split a comma-separated tag value into a trimmed string array,
 * filtering out empty entries.
 */
function splitComma(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ============================================================
// TRIGGER DETECTION
// ============================================================

function detectTriggers(tags: ExtractedTags, spec: ExtractedSpec): BuildTrigger[] {
  const triggers = new Set<BuildTrigger>(spec._triggers ?? []);

  if (tags.BUSINESS_TYPE && tags.SCRAPE_URL) triggers.add('scrape_complete');
  if (tags.BUSINESS_TYPE && tags.IDEA_DESCRIPTION) triggers.add('idea_described');
  if (tags.MOOD) triggers.add('mood_selected');
  if (tags.PRIMARY_COLOR) triggers.add('color_changed');
  if (tags.PRODUCTS_DETAIL) triggers.add('products_added');
  if (tags.PRIORITIES) triggers.add('priorities_set');
  if (tags.ANTI_PREFS) triggers.add('anti_prefs_set');
  if (tags.AUDIENCE) triggers.add('audience_defined');
  if (tags.FEATURES) triggers.add('features_selected');

  return Array.from(triggers);
}

// ============================================================
// MAIN EXPORTED FUNCTION
// ============================================================

/**
 * Parse all [[TAG:value]] patterns from AVA's AI response and return
 * an updated spec. The returned spec is an `ExtractedSpec` — a superset
 * of `MerchantAppSpec` that adds:
 *   - `_triggers`          — build triggers to dispatch
 *   - `_triggerSignupWall` — show signup wall (from STEP:phase1a_complete)
 *   - `_triggerFinalize`   — kick off finalize (from STEP:phase1b_complete)
 *
 * @param spec        Current spec (will not be mutated)
 * @param aiResponse  Raw text from AVA containing [[TAG:value]] markers
 * @param scrapedData Optional scraped business data to merge into spec
 */
export function updateSpecFromExtractions(
  spec: MerchantAppSpec,
  aiResponse: string,
  scrapedData?: ScrapedBusinessData,
): ExtractedSpec {
  // Deep-clone to avoid mutating the caller's object
  const updated: ExtractedSpec = {
    ...spec,
    _triggers: [],
  };

  // Merge scraped data if provided
  if (scrapedData) {
    updated.scrapedData = { ...scrapedData };
    if (!updated.businessName && scrapedData.name) {
      updated.businessName = scrapedData.name;
    }
  }

  const tags = parseTagsFromResponse(aiResponse);

  // ── BUSINESS_TYPE ──────────────────────────────────────────
  if (tags.BUSINESS_TYPE) {
    updated.businessType = tags.BUSINESS_TYPE.toLowerCase().trim();
    updated.category = mapBusinessTypeToCategory(updated.businessType);
  }

  // ── NAME ──────────────────────────────────────────────────
  if (tags.NAME) {
    updated.businessName = tags.NAME.trim();
  }

  // ── MOOD ──────────────────────────────────────────────────
  if (tags.MOOD) {
    updated.mood = tags.MOOD.trim();
  }

  // ── MOOD_KEYWORDS ─────────────────────────────────────────
  if (tags.MOOD_KEYWORDS) {
    updated.moodKeywords = splitComma(tags.MOOD_KEYWORDS);
  }

  // ── MOOD_REASON — stored in moodKeywords metadata (no dedicated field)
  // We don't have a dedicated field for moodReason in MerchantAppSpec, so we
  // store it as a prefixed entry if ever needed by downstream callers. No-op.

  // ── PRIMARY_COLOR ─────────────────────────────────────────
  if (tags.PRIMARY_COLOR) {
    const color = tags.PRIMARY_COLOR.trim();
    // Validate hex colour format (#RGB or #RRGGBB)
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) {
      updated.primaryColor = color;
    } else {
      // Store anyway — downstream can validate further
      updated.primaryColor = color;
    }
  }

  // ── PRODUCTS_DETAIL ───────────────────────────────────────
  if (tags.PRODUCTS_DETAIL) {
    try {
      const parsed = JSON.parse(tags.PRODUCTS_DETAIL) as ProductItem[];
      if (Array.isArray(parsed)) {
        updated.products = parsed;
      }
    } catch {
      // Malformed JSON — skip rather than crash
      console.warn('[extract-spec] Failed to parse PRODUCTS_DETAIL JSON:', tags.PRODUCTS_DETAIL);
    }
  }

  // ── PRIORITIES ────────────────────────────────────────────
  if (tags.PRIORITIES) {
    updated.appPriorities = splitComma(tags.PRIORITIES);
  }

  // ── ANTI_PREFS ────────────────────────────────────────────
  if (tags.ANTI_PREFS) {
    updated.antiPreferences = splitComma(tags.ANTI_PREFS);
  }

  // ── AUDIENCE ──────────────────────────────────────────────
  if (tags.AUDIENCE) {
    updated.audienceDescription = tags.AUDIENCE.trim();
  }

  // ── LANGUAGE ──────────────────────────────────────────────
  if (tags.LANGUAGE) {
    updated.primaryLanguage = tags.LANGUAGE.trim().toLowerCase();
  }

  // ── FEATURES ──────────────────────────────────────────────
  if (tags.FEATURES) {
    updated.selectedFeatures = splitComma(tags.FEATURES);
  }

  // ── APP_TYPE ──────────────────────────────────────────────
  if (tags.APP_TYPE) {
    const appTypeRaw = tags.APP_TYPE.trim().toLowerCase();
    if (appTypeRaw === 'business' || appTypeRaw === 'idea') {
      updated.appType = appTypeRaw;
    }
  }

  // ── IDEA_DESCRIPTION ──────────────────────────────────────
  if (tags.IDEA_DESCRIPTION) {
    updated.ideaDescription = tags.IDEA_DESCRIPTION.trim();
  }

  // ── STEP tags ─────────────────────────────────────────────
  if (tags.STEP) {
    for (const step of tags.STEP) {
      if (step === 'phase1a_complete') {
        updated._triggerSignupWall = true;
      } else if (step === 'phase1b_complete') {
        updated._triggerFinalize = true;
      }
    }
  }

  // ── SCRAPE_URL — stored on scrapedData.website if present ─
  if (tags.SCRAPE_URL) {
    if (!updated.scrapedData) updated.scrapedData = {};
    updated.scrapedData.website = tags.SCRAPE_URL.trim();
  }

  // ── Trigger detection ─────────────────────────────────────
  updated._triggers = detectTriggers(tags, updated);

  // ── Timestamp ─────────────────────────────────────────────
  updated.updatedAt = new Date().toISOString();

  return updated;
}
