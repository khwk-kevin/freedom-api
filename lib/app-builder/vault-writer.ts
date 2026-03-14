/**
 * Freedom World App Builder — Vault Writer
 * Sprint 2.4
 *
 * DETERMINISTIC function (NO AI calls).
 * Maps MerchantAppSpec → markdown/JSON vault files.
 *
 * Output files are written to the merchant's Railway workspace via SSH.
 */

import { MerchantAppSpec, VaultFile } from './types';

// ============================================================
// BRAND DEFAULTS — auto-generated from app category
// ============================================================

export interface DefaultBrand {
  mood: string;
  primaryColor: string;
  uiStyle: string;
  moodKeywords: string[];
}

/**
 * Returns sensible brand defaults based on the app category/type.
 * Used when the user hasn't specified any visual preferences.
 * Visual customization is a post-launch paid feature — we pick
 * a strong, appropriate default and let them refine later.
 */
export function getDefaultBrandForCategory(
  businessType?: string,
  appFormat?: string,
): DefaultBrand {
  const bt = (businessType || '').toLowerCase();
  const fmt = (appFormat || '').toLowerCase();

  // Game
  if (fmt === 'game' || bt.includes('game') || bt.includes('gaming')) {
    return { mood: 'playful', primaryColor: '#7C3AED', uiStyle: 'filled', moodKeywords: ['vibrant', 'energetic', 'bold', 'fun'] };
  }

  // Marketplace / e-commerce
  if (fmt === 'marketplace' || bt.includes('marketplace') || bt.includes('ecommerce') || bt.includes('shop') || bt.includes('store') || bt.includes('retail') || bt.includes('boutique')) {
    return { mood: 'bold', primaryColor: '#0EA5E9', uiStyle: 'outlined', moodKeywords: ['clean', 'trustworthy', 'modern', 'sharp'] };
  }

  // Restaurant / food
  if (bt.includes('restaurant') || bt.includes('cafe') || bt.includes('food') || bt.includes('bakery') || bt.includes('bar') || bt.includes('bistro') || bt.includes('kitchen')) {
    return { mood: 'warm', primaryColor: '#EA580C', uiStyle: 'rounded', moodKeywords: ['warm', 'inviting', 'earthy', 'appetizing'] };
  }

  // Fitness / wellness / health
  if (bt.includes('gym') || bt.includes('fitness') || bt.includes('yoga') || bt.includes('wellness') || bt.includes('health') || bt.includes('spa') || bt.includes('salon') || bt.includes('beauty')) {
    return { mood: 'minimal', primaryColor: '#10B981', uiStyle: 'rounded', moodKeywords: ['clean', 'calm', 'fresh', 'focused'] };
  }

  // Tools / SaaS / productivity
  if (fmt === 'tool' || bt.includes('tool') || bt.includes('saas') || bt.includes('productivity') || bt.includes('analytics') || bt.includes('dashboard')) {
    return { mood: 'minimal', primaryColor: '#2563EB', uiStyle: 'outlined', moodKeywords: ['minimal', 'precise', 'efficient', 'professional'] };
  }

  // Booking / services
  if (fmt === 'booking' || bt.includes('booking') || bt.includes('appointment') || bt.includes('service') || bt.includes('consulting') || bt.includes('agency')) {
    return { mood: 'elegant', primaryColor: '#6366F1', uiStyle: 'rounded', moodKeywords: ['professional', 'trustworthy', 'polished', 'calm'] };
  }

  // Community / content / social
  if (fmt === 'content' || bt.includes('community') || bt.includes('social') || bt.includes('blog') || bt.includes('news') || bt.includes('media')) {
    return { mood: 'bold', primaryColor: '#F59E0B', uiStyle: 'rounded', moodKeywords: ['lively', 'social', 'expressive', 'engaging'] };
  }

  // Portfolio / creative
  if (bt.includes('portfolio') || bt.includes('photography') || bt.includes('design') || bt.includes('art') || bt.includes('creative') || bt.includes('freelance')) {
    return { mood: 'elegant', primaryColor: '#1E293B', uiStyle: 'minimal', moodKeywords: ['elegant', 'refined', 'curated', 'minimal'] };
  }

  // Landing / startup / idea
  if (fmt === 'landing' || bt.includes('startup') || bt.includes('launch') || bt.includes('idea')) {
    return { mood: 'bold', primaryColor: '#10F48B', uiStyle: 'outlined', moodKeywords: ['fresh', 'bold', 'exciting', 'modern'] };
  }

  // Default: clean modern blue — safe for any unknown category
  return { mood: 'minimal', primaryColor: '#3B82F6', uiStyle: 'outlined', moodKeywords: ['clean', 'modern', 'accessible', 'clear'] };
}

// ============================================================
// TYPES
// ============================================================

export interface MoodVariants {
  heroVariant: string;
  productCardVariant: string;
  navVariant: string;
  borderRadius: string;
  shadowStyle: string;
  // Extended variants (not in the core table but used by components.md)
  contactVariant: string;
  galleryVariant: string;
  footerVariant: string;
  ctaVariant: string;
}

export interface FontPair {
  heading: string;
  body: string;
}

// ============================================================
// MOOD → VARIANT MAPPING TABLE
// ============================================================

const MOOD_VARIANTS: Record<string, MoodVariants> = {
  warm: {
    heroVariant: 'soft',
    productCardVariant: 'rounded',
    navVariant: 'bottom-tabs',
    borderRadius: '0.75rem',
    shadowStyle: 'soft',
    contactVariant: 'card',
    galleryVariant: 'grid',
    footerVariant: 'branded',
    ctaVariant: 'banner',
  },
  bold: {
    heroVariant: 'bold',
    productCardVariant: 'sharp',
    navVariant: 'top-bar',
    borderRadius: '0.25rem',
    shadowStyle: 'strong',
    contactVariant: 'split',
    galleryVariant: 'masonry',
    footerVariant: 'detailed',
    ctaVariant: 'banner',
  },
  minimal: {
    heroVariant: 'minimal',
    productCardVariant: 'minimal',
    navVariant: 'top-bar',
    borderRadius: '0rem',
    shadowStyle: 'none',
    contactVariant: 'list',
    galleryVariant: 'grid',
    footerVariant: 'simple',
    ctaVariant: 'card',
  },
  playful: {
    heroVariant: 'bold',
    productCardVariant: 'rounded',
    navVariant: 'bottom-tabs',
    borderRadius: '1rem',
    shadowStyle: 'soft',
    contactVariant: 'card',
    galleryVariant: 'carousel',
    footerVariant: 'branded',
    ctaVariant: 'floating',
  },
  elegant: {
    heroVariant: 'split',
    productCardVariant: 'sharp',
    navVariant: 'sidebar',
    borderRadius: '0.5rem',
    shadowStyle: 'subtle',
    contactVariant: 'split',
    galleryVariant: 'masonry',
    footerVariant: 'simple',
    ctaVariant: 'card',
  },
};

// Fallback for unknown moods
const DEFAULT_MOOD_VARIANTS = MOOD_VARIANTS.warm;

// ============================================================
// UTILITY: COLOUR MANIPULATION
// ============================================================

/**
 * Parse a hex colour string (with or without #) into [r, g, b] 0–255.
 * Returns [0, 0, 0] on invalid input.
 */
function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return [0, 0, 0];
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Lighten a hex colour by blending it towards white.
 * factor 0 = original, factor 1 = white.
 */
export function lightenColor(hex: string, factor: number): string {
  const [r, g, b] = parseHex(hex);
  const f = Math.max(0, Math.min(1, factor));
  return toHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
}

/**
 * Darken a hex colour by blending it towards black.
 * factor 0 = original, factor 1 = black.
 */
export function darkenColor(hex: string, factor: number): string {
  const [r, g, b] = parseHex(hex);
  const f = Math.max(0, Math.min(1, factor));
  return toHex(r * (1 - f), g * (1 - f), b * (1 - f));
}

/**
 * Determine if a hex color is "dark" (luminance < 0.5).
 */
export function isColorDark(hex: string): boolean {
  const [r, g, b] = parseHex(hex);
  // Relative luminance (sRGB)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

// ============================================================
// UTILITY: FONT DETECTION
// ============================================================

/**
 * Returns a font pair appropriate for the given ISO 639-1 language code.
 * Falls back to Plus Jakarta Sans for unknown scripts.
 */
export function detectFontForLanguage(langCode: string): FontPair {
  const lang = (langCode || 'en').toLowerCase().split('-')[0]; // handle 'zh-TW' etc.
  switch (lang) {
    case 'th':
      return { heading: 'Noto Sans Thai', body: 'Noto Sans Thai' };
    case 'ja':
      return { heading: 'Noto Sans JP', body: 'Noto Sans JP' };
    case 'zh':
      return { heading: 'Noto Sans SC', body: 'Noto Sans SC' };
    case 'ko':
      return { heading: 'Noto Sans KR', body: 'Noto Sans KR' };
    case 'ar':
      return { heading: 'Noto Sans Arabic', body: 'Noto Sans Arabic' };
    case 'hi':
      return { heading: 'Noto Sans Devanagari', body: 'Noto Sans Devanagari' };
    case 'vi':
      return { heading: 'Plus Jakarta Sans', body: 'Inter' }; // Latin extended
    case 'en':
    default:
      return { heading: 'Plus Jakarta Sans', body: 'Inter' };
  }
}

// ============================================================
// UTILITY: LABELS (minimal i18n for markdown section headers)
// ============================================================

interface VaultLabels {
  // brand.md
  brandIdentity: string;
  visualMood: string;
  antiPreferences: string;
  colors: string;
  typography: string;
  logosAndPhotos: string;
  brandPersonality: string;
  toneOfVoice: string;
  values: string;
  references: string;
  // business.md
  overview: string;
  type: string;
  location: string;
  hours: string;
  contact: string;
  about: string;
  productsServices: string;
  ownerWants: string;
  keyPriorities: string;
  selectedFeatures: string;
  // audience.md
  targetAudience: string;
  primaryCustomers: string;
  language: string;
  primary: string;
  // decisions
  decisionLog: string;
  decisionVisualMood: string;
  decisionsWhat: string;
  decisionsWhy: string;
  decisionsImplications: string;
  rejected: string;
  // active skill
  activeSkill: string;
  // pending placeholders
  pending: string;
  notSet: string;
  noneSpecified: string;
  noPhotos: string;
  noProducts: string;
  noDescription: string;
  noPriorities: string;
  noAudience: string;
}

const LABELS: Record<string, VaultLabels> = {
  th: {
    brandIdentity: 'อัตลักษณ์แบรนด์',
    visualMood: 'บรรยากาศและสไตล์',
    antiPreferences: 'สิ่งที่ไม่ต้องการ',
    colors: 'สีหลัก',
    typography: 'ฟอนต์',
    logosAndPhotos: 'โลโก้และรูปภาพ',
    brandPersonality: 'บุคลิกของแบรนด์',
    toneOfVoice: 'น้ำเสียง',
    values: 'คุณค่า',
    references: 'อ้างอิง',
    overview: 'ภาพรวม',
    type: 'ประเภท',
    location: 'ที่ตั้ง',
    hours: 'เวลาเปิด-ปิด',
    contact: 'ติดต่อ',
    about: 'เกี่ยวกับ',
    productsServices: 'สินค้า / บริการ',
    ownerWants: 'เจ้าของต้องการ',
    keyPriorities: 'ลำดับความสำคัญ',
    selectedFeatures: 'ฟีเจอร์ที่เลือก',
    targetAudience: 'กลุ่มลูกค้าเป้าหมาย',
    primaryCustomers: 'ลูกค้าหลัก',
    language: 'ภาษา',
    primary: 'หลัก',
    decisionLog: 'บันทึกการตัดสินใจ',
    decisionVisualMood: 'การตัดสินใจ: สไตล์ภาพรวม',
    decisionsWhat: 'สิ่งที่ตัดสินใจ',
    decisionsWhy: 'เหตุผล',
    decisionsImplications: 'ผลกระทบ',
    rejected: 'ตัวเลือกที่ไม่ได้เลือก',
    activeSkill: 'สกิลการสร้างที่ใช้งานอยู่',
    pending: '(รอดำเนินการ)',
    notSet: '(ยังไม่ได้กำหนด)',
    noneSpecified: '(ไม่ได้ระบุ)',
    noPhotos: '(ยังไม่มีรูปภาพ)',
    noProducts: '(ยังไม่มีสินค้า)',
    noDescription: '(ยังไม่มีคำอธิบาย)',
    noPriorities: '(ยังไม่ได้กำหนดลำดับความสำคัญ)',
    noAudience: '(ยังไม่ได้ระบุกลุ่มลูกค้า)',
  },
  ja: {
    brandIdentity: 'ブランドアイデンティティ',
    visualMood: 'ビジュアルムード',
    antiPreferences: '避けたいこと',
    colors: 'カラー',
    typography: 'フォント',
    logosAndPhotos: 'ロゴと写真',
    brandPersonality: 'ブランドパーソナリティ',
    toneOfVoice: 'トーン・オブ・ボイス',
    values: 'バリュー',
    references: '参考',
    overview: '概要',
    type: '業種',
    location: '所在地',
    hours: '営業時間',
    contact: '連絡先',
    about: 'について',
    productsServices: '商品・サービス',
    ownerWants: 'オーナーの要望',
    keyPriorities: '優先事項',
    selectedFeatures: '選択した機能',
    targetAudience: 'ターゲットオーディエンス',
    primaryCustomers: '主な顧客',
    language: '言語',
    primary: 'メイン',
    decisionLog: '決定記録',
    decisionVisualMood: '決定: ビジュアルムード',
    decisionsWhat: '決定内容',
    decisionsWhy: '理由',
    decisionsImplications: '影響',
    rejected: '却下した選択肢',
    activeSkill: 'アクティブビルドスキル',
    pending: '(保留中)',
    notSet: '(未設定)',
    noneSpecified: '(指定なし)',
    noPhotos: '(写真なし)',
    noProducts: '(商品なし)',
    noDescription: '(説明なし)',
    noPriorities: '(優先順位未設定)',
    noAudience: '(ターゲット未定義)',
  },
  en: {
    brandIdentity: 'Brand Identity',
    visualMood: 'Visual Mood',
    antiPreferences: 'Anti-Preferences',
    colors: 'Colors',
    typography: 'Typography',
    logosAndPhotos: 'Logo & Photos',
    brandPersonality: 'Brand Personality',
    toneOfVoice: 'Tone of voice',
    values: 'Values',
    references: 'References',
    overview: 'Overview',
    type: 'Type',
    location: 'Location',
    hours: 'Hours',
    contact: 'Contact',
    about: 'About',
    productsServices: 'Products / Services',
    ownerWants: 'What the owner wants',
    keyPriorities: 'Key priorities',
    selectedFeatures: 'Selected Freedom features',
    targetAudience: 'Target Audience',
    primaryCustomers: 'Primary customers',
    language: 'Language',
    primary: 'Primary',
    decisionLog: 'Decision Log',
    decisionVisualMood: 'Decision: Visual Mood',
    decisionsWhat: 'What',
    decisionsWhy: 'Why',
    decisionsImplications: 'Implications',
    rejected: 'Rejected alternatives',
    activeSkill: 'Active Build Skill',
    pending: '(pending)',
    notSet: '(not set yet — using template defaults)',
    noneSpecified: '(none specified yet)',
    noPhotos: '(no photos yet)',
    noProducts: '(no products listed yet)',
    noDescription: '(no description yet)',
    noPriorities: '(not set yet — will use category defaults)',
    noAudience: '(not defined yet — will use category defaults)',
  },
};

function getLabels(langCode: string): VaultLabels {
  const lang = (langCode || 'en').toLowerCase().split('-')[0];
  return LABELS[lang] ?? LABELS['en'];
}

// ============================================================
// INDIVIDUAL FILE GENERATORS
// ============================================================

/**
 * context/brand.md — Visual identity, mood, anti-preferences.
 * Generated in spec.primaryLanguage.
 */
export function generateBrandMd(spec: Partial<MerchantAppSpec>): string {
  const lang = spec.primaryLanguage || 'en';
  const L = getLabels(lang);
  const fonts = detectFontForLanguage(lang);
  const businessName = spec.businessName || L.pending;
  const timestamp = new Date().toISOString();
  const variants = MOOD_VARIANTS[spec.mood ?? ''] ?? DEFAULT_MOOD_VARIANTS;

  const moodBlock = spec.mood
    ? `**Mood:** ${spec.mood}${spec.moodKeywords?.length ? `\n**Keywords:** ${spec.moodKeywords.join(', ')}` : ''}`
    : `**Mood:** ${L.notSet}`;

  const antiPrefsBlock = spec.antiPreferences?.length
    ? spec.antiPreferences.map((p) => `- ❌ ${p}`).join('\n')
    : L.noneSpecified;

  const primaryColor = spec.primaryColor || '#e85d04';
  const secondaryColor = spec.secondaryColor || lightenColor(primaryColor, 0.85);
  const accentColor = lightenColor(primaryColor, 0.6);

  const photoCount = spec.scrapedData?.photos?.length ?? 0;
  const hasLogo = !!spec.scrapedData?.photos?.length; // Logo inferred from scrape
  const hasBanner = photoCount > 0;
  const photosBlock = photoCount > 0
    ? `- Logo: \`/public/assets/logo.png\`
- Banner: \`/public/assets/banner.jpg\`
- Gallery: ${photoCount} photos in \`/public/assets/gallery/\``
    : `- Logo: ${L.noPhotos}
- Banner: ${L.noPhotos}
- Gallery: ${L.noPhotos}`;

  const websiteRef = spec.scrapedData?.website ? `- Website: ${spec.scrapedData.website}` : '';
  const mapsRef = spec.scrapedData?.googleMapsUrl ? `- Google Maps: ${spec.scrapedData.googleMapsUrl}` : '';
  const refsBlock = [websiteRef, mapsRef].filter(Boolean).join('\n') || L.noneSpecified;

  return `---
type: context
domain: brand
source: onboarding-interview
updated: ${timestamp}
---

# ${L.brandIdentity}: ${businessName}

## ${L.visualMood}
${moodBlock}

→ Mood guides component variant selection in [[design/components.md]]

## ${L.antiPreferences}
${antiPrefsBlock}

## ${L.colors}
- **Primary:** ${primaryColor}
- **Secondary:** ${secondaryColor}
- **Accent:** ${accentColor}

Full token set in [[design/theme.json]]

## ${L.typography}
- **Heading font:** ${fonts.heading}
- **Body font:** ${fonts.body}
- **Language:** ${lang}

## ${L.logosAndPhotos}
${photosBlock}
- Variants selected: Hero → \`${variants.heroVariant}\`, Card → \`${variants.productCardVariant}\`

## ${L.brandPersonality}
- ${L.toneOfVoice}: ${L.notSet}
- ${L.values}: ${L.notSet}

## ${L.references}
${refsBlock}
`;
}

/**
 * context/business.md — Name, products, location, hours, priorities.
 * Generated in spec.primaryLanguage.
 */
export function generateBusinessMd(spec: Partial<MerchantAppSpec>): string {
  const lang = spec.primaryLanguage || 'en';
  const L = getLabels(lang);
  const businessName = spec.businessName || spec.scrapedData?.name || L.pending;
  const timestamp = new Date().toISOString();

  // Location info from scraped data
  const address = spec.scrapedData?.address;
  const phone = spec.scrapedData?.phone;
  const website = spec.scrapedData?.website;
  const rating = spec.scrapedData?.rating;
  const hours = spec.scrapedData?.hours;
  const description = spec.scrapedData?.description;

  // Overview block
  const overviewLines: string[] = [];
  overviewLines.push(`- **${L.type}:** ${spec.businessType || L.pending}`);
  if (address) overviewLines.push(`- **${L.location}:** ${address}`);
  if (hours) {
    const hoursStr = Object.entries(hours)
      .map(([day, h]) => `${day}: ${h}`)
      .join(', ');
    overviewLines.push(`- **${L.hours}:** ${hoursStr}`);
  }
  const contactParts: string[] = [];
  if (phone) contactParts.push(phone);
  if (website) contactParts.push(website);
  if (contactParts.length) overviewLines.push(`- **${L.contact}:** ${contactParts.join(' | ')}`);
  if (rating) overviewLines.push(`- **Rating:** ${rating}/5`);

  // Products block
  let productsBlock: string;
  if (spec.products?.length) {
    productsBlock = spec.products
      .map((p) => {
        const lines: string[] = [`### ${p.name}`];
        if (p.description) lines.push(p.description);
        if (p.price != null) {
          const currency = p.currency || '';
          lines.push(`**Price:** ${currency}${p.price}`);
        }
        if (p.category) lines.push(`**Category:** ${p.category}`);
        if (p.isAvailable === false) lines.push('_(unavailable)_');
        return lines.join('\n');
      })
      .join('\n\n');
  } else if (spec.scrapedData?.categories?.length) {
    productsBlock = spec.scrapedData.categories.map((c) => `- ${c}`).join('\n');
  } else {
    productsBlock = L.noProducts;
  }

  // Priorities block
  const prioritiesBlock = spec.appPriorities?.length
    ? spec.appPriorities.map((p, i) => `${i + 1}. ${p}`).join('\n')
    : L.noPriorities;

  // Features block (Q9)
  const featuresBlock = spec.selectedFeatures?.length
    ? spec.selectedFeatures.map((f) => `- ${f}`).join('\n')
    : '';

  return `---
type: context
domain: business
source: onboarding-interview
updated: ${timestamp}
---

# Business: ${businessName}

## ${L.overview}
${overviewLines.join('\n')}

## ${L.about}
${description || L.noDescription}

## ${L.productsServices}
${productsBlock}

## ${L.ownerWants}
> ${L.notSet}

## ${L.keyPriorities}
${prioritiesBlock}
${featuresBlock ? `\n## ${L.selectedFeatures}\n${featuresBlock}\n` : ''}
→ Priorities inform [[skills/_active.md]]
→ Location data used for [[freedom/api.md]] POI integration
`;
}

/**
 * context/audience.md — Target customers.
 * Generated in spec.primaryLanguage.
 */
export function generateAudienceMd(spec: Partial<MerchantAppSpec>): string {
  const lang = spec.primaryLanguage || 'en';
  const L = getLabels(lang);
  const businessName = spec.businessName || spec.scrapedData?.name || L.pending;
  const timestamp = new Date().toISOString();

  return `---
type: context
domain: audience
source: onboarding-interview
updated: ${timestamp}
---

# ${L.targetAudience}: ${businessName}

## ${L.primaryCustomers}
${spec.audienceDescription || L.noAudience}

## ${L.language}
- ${L.primary}: ${lang}

→ Language affects all copy in the app
→ Audience informs UI decisions in [[design/system.md]]
`;
}

/**
 * design/theme.json — Colors, fonts, border radius, shadows, variant selections.
 * Language-neutral JSON.
 */
export function generateThemeJson(spec: Partial<MerchantAppSpec>): string {
  const primaryColor = spec.primaryColor || '#e85d04';
  const lang = spec.primaryLanguage || 'en';
  const fonts = detectFontForLanguage(lang);
  const mood = spec.mood ?? 'warm';
  const variants = MOOD_VARIANTS[mood] ?? DEFAULT_MOOD_VARIANTS;

  // Determine background from scraped data or mood
  const scrapedBg = spec.scrapedData?.backgroundColor;
  const isDarkMood = ['luxury', 'dark', 'bold', 'edgy', 'moody', 'gaming'].includes(mood);
  const bgColor = scrapedBg || (isDarkMood ? '#0F0F1A' : '#ffffff');
  const isDark = isColorDark(bgColor);
  const fgColor = isDark ? '#f5f5f5' : '#1a1a1a';
  const mutedBg = isDark ? '#1a1a2e' : '#f5f5f5';
  const mutedFg = isDark ? '#a1a1aa' : '#6b7280';
  const borderColor = isDark ? darkenColor(primaryColor, 0.3) : lightenColor(primaryColor, 0.9);

  const theme = {
    version: '1.0',
    mood,
    colors: {
      primary: primaryColor,
      primaryForeground: '#ffffff',
      primaryLight: lightenColor(primaryColor, 0.85),
      primaryDark: darkenColor(primaryColor, 0.2),
      secondary: spec.secondaryColor || lightenColor(primaryColor, 0.9),
      background: bgColor,
      foreground: fgColor,
      muted: mutedBg,
      mutedForeground: mutedFg,
      accent: lightenColor(primaryColor, 0.7),
      accentForeground: fgColor,
      border: borderColor,
    },
    fonts: {
      heading: fonts.heading,
      body: fonts.body,
    },
    borderRadius: variants.borderRadius,
    shadowStyle: variants.shadowStyle,
    variants: {
      hero: variants.heroVariant,
      productCard: variants.productCardVariant,
      navigation: variants.navVariant,
      contact: variants.contactVariant,
      gallery: variants.galleryVariant,
      footer: variants.footerVariant,
      cta: variants.ctaVariant,
    },
    spacing: {
      base: '4px',
      scale: [4, 8, 12, 16, 24, 32, 48, 64, 96],
    },
    language: lang,
  };

  return JSON.stringify(theme, null, 2);
}

/**
 * context/decisions/001-visual-mood.md — Mood choice + reasoning.
 * Generated in spec.primaryLanguage.
 */
export function generateMoodDecisionMd(spec: Partial<MerchantAppSpec>): string {
  const lang = spec.primaryLanguage || 'en';
  const L = getLabels(lang);
  const mood = spec.mood || L.pending;
  const timestamp = new Date().toISOString();
  const variants = MOOD_VARIANTS[spec.mood ?? ''] ?? DEFAULT_MOOD_VARIANTS;

  const reasonBlock = spec.moodKeywords?.length
    ? `Keywords: ${spec.moodKeywords.join(', ')}`
    : `"${mood}"`;

  return `---
type: decision
number: 1
domain: design
source: onboarding-interview
created: ${timestamp}
---

# ${L.decisionVisualMood} → ${mood}

## ${L.decisionsWhat}
${L.visualMood}: **${mood}**

## ${L.decisionsWhy}
${reasonBlock}

## ${L.decisionsImplications}
- Hero variant: \`${variants.heroVariant}\` → [[design/components.md#hero]]
- ProductCard variant: \`${variants.productCardVariant}\` → [[design/components.md#productcard]]
- Navigation variant: \`${variants.navVariant}\`
- Border radius: \`${variants.borderRadius}\`
- Shadow style: \`${variants.shadowStyle}\`

Full token set: [[design/theme.json]]

## ${L.rejected}
${L.noneSpecified}
`;
}

// ============================================================
// CATEGORY MAPPING
// ============================================================

/**
 * Maps a business type string to one of 5 canonical build categories.
 * Returns the category name used for skill file routing.
 */
export function getCategoryFromBusinessType(businessType?: string): string {
  const bt = (businessType || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (['restaurant', 'cafe', 'bakery', 'food_truck', 'foodtruck', 'bar', 'cafeteria', 'diner', 'bistro', 'eatery', 'boba', 'dessert', 'pizza'].includes(bt)) return 'restaurant';
  if (['retail', 'shop', 'ecommerce', 'boutique', 'store', 'market', 'supermarket', 'bookstore', 'florist', 'jewelry', 'fashion'].includes(bt)) return 'retail';
  if (['salon', 'gym', 'studio', 'spa', 'fitness', 'consulting', 'photography_studio', 'barbershop', 'nail_salon', 'yoga', 'pilates', 'clinic', 'dental', 'vet', 'tutor', 'coach', 'cleaning', 'laundry', 'repair', 'mechanic', 'lawyer', 'accountant'].includes(bt)) return 'service';
  if (['photographer', 'designer', 'artist', 'freelancer', 'architect', 'illustrator', 'videographer', 'writer', 'musician', 'filmmaker', 'gallery'].includes(bt)) return 'portfolio';
  // Everything else: game, community, tool, idea, startup, app, etc.
  return 'idea';
}

// ============================================================
// CATEGORY SKILL FILE GENERATORS
// ============================================================

/**
 * Generates a detailed build recipe markdown for a given category.
 * Always English — these are technical instructions for Claude Code.
 */
export function generateCategorySkillMd(spec: Partial<MerchantAppSpec>, category: string): string {
  const businessName = spec.businessName || 'The App';
  const primaryColor = spec.primaryColor || '#e85d04';
  const timestamp = new Date().toISOString();

  switch (category) {
    case 'restaurant':
      return generateRestaurantSkillMd(businessName, primaryColor, timestamp);
    case 'retail':
      return generateRetailSkillMd(businessName, primaryColor, timestamp);
    case 'service':
      return generateServiceSkillMd(businessName, primaryColor, timestamp);
    case 'portfolio':
      return generatePortfolioSkillMd(businessName, primaryColor, timestamp);
    case 'idea':
    default:
      return generateIdeaSkillMd(businessName, primaryColor, timestamp);
  }
}

function generateRestaurantSkillMd(name: string, primaryColor: string, timestamp: string): string {
  return `---
type: build-skill
category: restaurant
version: 1.0
updated: ${timestamp}
---

# Build Recipe: Restaurant / Food & Beverage App

> This recipe applies to: restaurants, cafes, bakeries, food trucks, bars, bistros.
> App name: **${name}**
> Primary color: \`${primaryColor}\`

Read these FIRST before building anything:
- [[context/brand.md]] — colors, mood, fonts
- [[context/business.md]] — real menu items, hours, location
- [[context/audience.md]] — who your customers are
- [[design/theme.json]] — all design tokens

---

## Pages to Build

### 1. Homepage (Hero + Quick Access)
**Goal:** Appetite appeal, immediate navigation to menu and reservation.

**Layout:** Full-viewport hero with signature dish image overlaid with business name and tagline.
Below hero: 3 quick-action cards — "View Menu", "Reserve a Table", "Get Directions".

**Components:**
- Hero: full-bleed image with gradient overlay, centered text, two CTA buttons
- Quick actions: \`<Card>\` × 3 in a horizontal row (scroll on mobile)
- Featured dish spotlight: \`<Carousel>\` (shadcn/ui) — 3–5 hero food photos, auto-play
- Hours + status badge: show "Open Now" / "Closed" based on business hours from \`context/business.md\`

**shadcn/ui:** \`Card\`, \`Badge\`, \`Button\`, \`Carousel\`

**Content strategy:** Lead with best-looking dish photo. Tagline should evoke taste/experience.
Do NOT show prices on the homepage — save for the menu page.

---

### 2. Menu Page (Core Feature)
**Goal:** Browse the full menu by category with prices clearly visible.

**Layout:** Sticky top navigation bar with category \`<Tabs>\` (e.g. Appetizers | Mains | Drinks | Desserts).
Below tabs: scrollable list of menu items. Each item is a horizontal card: photo thumbnail (left) + name, description, price (right).

**Components:**
- Category navigation: \`<Tabs>\` (shadcn/ui) — sticky below the app header on scroll
- Menu item card: \`<Card>\` with thumbnail, name, short description, price badge
- Price: \`<Badge variant="outline">\` — prominent, always visible
- Dietary labels: \`<Badge>\` (vegan 🌿, spicy 🌶, popular ⭐) as icon badges

**shadcn/ui:** \`Tabs\`, \`Card\`, \`Badge\`, \`Separator\`

**UX patterns:**
- Smooth scroll to category when tab is clicked
- "Popular" tag on featured items (top 3)
- Sticky category tabs so user always knows what section they're in
- Empty state: "Menu coming soon" if no items provided

**Mobile:** Tabs become horizontally scrollable. Each card is full-width. Photo thumbnail 80×80px on the left.

---

### 3. Reservation / Order Page
**Goal:** Let customers book a table or place an order (if applicable).

**Layout:** Simple centered form with date/time picker, party size selector, and contact fields.

**Components:**
- \`<Form>\` with \`<Input>\` for name, phone, email
- \`<Select>\` for party size (1–10+)
- Date/time: \`<Calendar>\` + \`<Select>\` for time slots (shadcn/ui)
- \`<Button>\` — primary CTA "Book Table" / "Place Order"
- Confirmation: \`<Alert>\` with booking details on success

**shadcn/ui:** \`Form\`, \`Input\`, \`Select\`, \`Calendar\`, \`Button\`, \`Alert\`

**Content strategy:** Keep the form SHORT — name, phone, date/time, party size only.
Optional: special requests textarea (collapsed behind "Add note" toggle).

---

### 4. Gallery Page
**Goal:** Show the food and ambiance to attract customers.

**Layout:** Masonry photo grid (Pinterest-style, 2 columns on mobile, 3 on desktop).
Optional top filter tabs: "Food" | "Interior" | "Events".

**Components:**
- Masonry grid: CSS columns or a lightweight masonry library
- \`<Dialog>\` (shadcn/ui) — lightbox for full-size image on click
- Filter tabs: \`<Tabs>\` with category filters
- Image count badge in corner

**shadcn/ui:** \`Dialog\`, \`Tabs\`, \`AspectRatio\`

**Mobile:** 2-column masonry. Swipe-to-dismiss on lightbox. Images are full-bleed.

---

### 5. Location & Hours Page
**Goal:** Help customers find us and know when we're open.

**Layout:** Split layout — map embed (left/top) + hours + contact info (right/bottom).

**Components:**
- Google Maps embed (iframe) with business pin
- Hours table: \`<Table>\` — day | hours, highlight today's row
- Contact info: phone (clickable tel: link), address (clickable maps link)
- "Get Directions" CTA button → Google Maps deeplink
- Social links (if available)

**shadcn/ui:** \`Table\`, \`Button\`, \`Separator\`

**Content strategy:** Show "Open Now" / "Closed" status prominently. Phone number must be a tap-to-call link.

---

## Layout Architecture

\`\`\`
/ (homepage)
/menu                 ← primary feature page
/reserve              ← reservation/order form
/gallery              ← food & venue photos
/location             ← map + hours + contact
\`\`\`

**Navigation:**
- Desktop: top navbar with logo left, links right, "Reserve" CTA button highlighted
- Mobile: bottom tab bar with 4 icons: Home | Menu | Reserve | More (using shadcn \`Sheet\` for "More" drawer)

**Header:** Sticky on scroll. On mobile, show business name + "Call Now" icon button on right.

---

## Mobile-Specific Rules

1. **Bottom tab bar** — use \`Sheet\` for overflow items (Gallery, Location, About)
2. **Sticky menu category tabs** — remain visible as user scrolls through menu items
3. **Swipeable food gallery** — \`Carousel\` component, swipe gestures
4. **Call to action floating button** — "Book Table" FAB (floating action button) on menu and gallery pages
5. **Tap-to-call** — phone number is always a \`tel:\` link
6. **Font size** — minimum 16px for all body text to prevent iOS zoom on inputs

---

## UX Patterns

- **Social proof first:** Show rating and review count near the top of homepage
- **Menu is the hero:** Menu should be 1 tap from anywhere in the app
- **Friction-free reservation:** Max 4 form fields visible without scrolling
- **Urgency signals:** "Table available tonight" badge, "Only 2 tables left" warnings (if data available)
- **Food photography:** If no photos are available, use gradient placeholder cards — never broken image icons

---

## Content Strategy

**Emphasize:**
- The signature / most photogenic dish
- Business hours and current open/closed status
- Location and "Get Directions" — many customers are nearby
- Star rating / reviews (if scraped data includes rating)

**De-emphasize / Hide:**
- Pricing on the homepage hero
- Long "About Us" text — move to a collapsible section
- Social media links — relegate to footer
`;
}

function generateRetailSkillMd(name: string, primaryColor: string, timestamp: string): string {
  return `---
type: build-skill
category: retail
version: 1.0
updated: ${timestamp}
---

# Build Recipe: Retail / E-commerce / Shop App

> This recipe applies to: retail stores, shops, boutiques, e-commerce, markets.
> App name: **${name}**
> Primary color: \`${primaryColor}\`

Read these FIRST before building anything:
- [[context/brand.md]] — colors, mood, fonts
- [[context/business.md]] — real products, categories, prices
- [[context/audience.md]] — who your shoppers are
- [[design/theme.json]] — all design tokens

---

## Pages to Build

### 1. Homepage (Storefront + Featured Products)
**Goal:** Showcase the brand and featured/new products, drive browsing.

**Layout:** Full-width hero banner (brand campaign image or seasonal promotion).
Below: "Featured Products" section (horizontal carousel), then category grid.

**Components:**
- Hero: \`<Carousel>\` (shadcn/ui) — rotating promotional banners with CTA buttons
- Featured products: \`<Carousel>\` (shadcn/ui) — scrollable product cards
- Category tiles: grid of 4–6 image tiles with category name overlaid
- Promo banner: \`<Alert>\` style strip for discounts, free shipping threshold

**shadcn/ui:** \`Carousel\`, \`Card\`, \`Badge\`, \`Alert\`

**Content strategy:** Lead with best-selling or seasonal products. Show sale prices prominently.
Category grid helps users navigate without searching.

---

### 2. Product Catalog Page (Core Feature)
**Goal:** Let shoppers browse all products with filtering and sorting.

**Layout:** 2-column product grid (mobile), 3–4 column grid (desktop).
Left sidebar for filters on desktop; bottom sheet drawer on mobile.

**Components:**
- Product card: \`<Card>\` — product image (square aspect ratio), name, price, optional discount badge
- Filter panel: desktop sidebar / mobile \`<Sheet>\` (shadcn/ui) bottom drawer
  - Filter by category, price range, availability
  - Applied filters shown as \`<Badge>\` chips with × dismiss button
- Sort dropdown: \`<Select>\` — "Newest", "Price: Low–High", "Best Selling"
- Results count: "Showing X products"
- Load more: \`<Button>\` at bottom or infinite scroll

**shadcn/ui:** \`Card\`, \`Sheet\`, \`Select\`, \`Badge\`, \`Slider\`, \`Checkbox\`, \`Button\`

**UX patterns:**
- Filters do NOT require a page reload — update results in place
- "Clear all filters" link when filters are active
- Out-of-stock items shown with "Out of Stock" overlay badge (dimmed)

**Mobile:** 2-column grid with small cards. Filter/sort bar is a sticky row at top: "Filter" button (opens Sheet) + "Sort" dropdown. Cards show image, name, price only.

---

### 3. Product Detail Page
**Goal:** Show everything about a single product and drive purchase / inquiry.

**Layout:** Large product image (or image gallery) on left/top.
Product info (name, price, description, variants) on right/below.

**Components:**
- Image gallery: \`<Carousel>\` for multiple product photos with thumbnail strip below
- Price: large, prominent — show original + sale price with \`<Badge variant="destructive">\` for discount %
- Variants: \`<RadioGroup>\` for size/color selection (shadcn/ui)
- Quantity: \`<Input type="number">\` with +/– buttons
- CTA: \`<Button size="lg">\` — "Add to Cart" or "Contact to Buy"
- Description: full text with \`<Accordion>\` for "Specifications", "Shipping Info", "Returns"
- Related products: \`<Carousel>\` at bottom

**shadcn/ui:** \`Carousel\`, \`RadioGroup\`, \`Input\`, \`Button\`, \`Accordion\`, \`Badge\`, \`Tabs\`

**Mobile:** Stack image on top, info below. Sticky bottom bar with price + "Add to Cart" button.

---

### 4. Store / Contact Page
**Goal:** Drive in-store visits and provide multiple contact options.

**Layout:** Map embed prominently at top. Contact info, hours, and parking info below.

**Components:**
- Map embed (Google Maps iframe) with store pin
- Hours: \`<Table>\` — day | hours, today's row highlighted
- Contact: phone (tap-to-call), email, address
- \`<Button>\` — "Get Directions" → Google Maps deeplink

**shadcn/ui:** \`Table\`, \`Button\`, \`Card\`

---

## Layout Architecture

\`\`\`
/ (homepage)
/products             ← catalog with filter/sort
/products/[id]        ← product detail page
/store                ← location + hours + contact
\`\`\`

**Navigation:**
- Desktop: top navbar with logo, category links, search icon, cart icon
- Mobile: top bar with logo + search + cart icons. Bottom tabs: Home | Shop | Cart | More

---

## Mobile-Specific Rules

1. **2-column product grid** — 50% width cards, compact layout
2. **Bottom sheet filters** — never use a sidebar on mobile; use \`Sheet\` sliding up from bottom
3. **Sticky "Add to Cart" bar** — on product detail page, fix price + CTA to bottom of screen
4. **Swipeable product images** — \`Carousel\` with touch swipe support
5. **Large tap targets** — all buttons minimum 44×44px
6. **Search** — full-screen overlay on mobile when search icon tapped

---

## UX Patterns

- **Price transparency:** Show price on every card — never make users tap to find price
- **Clear availability:** "In Stock" / "Only 3 left" / "Out of Stock" visible on cards
- **Progressive disclosure:** Product description truncated with "Read more" toggle
- **Zero dead ends:** Always show related products or "Continue Shopping" CTA
- **Wishlist hint:** Heart icon on product cards (even if wishlist isn't fully built)

---

## Content Strategy

**Emphasize:**
- Product photography — high quality, consistent backgrounds
- Price and availability — always visible
- Sale/discount badges — prominent, red/destructive color
- Category navigation — helps users find what they want fast

**De-emphasize / Hide:**
- Long brand story — move to /about page
- Social feed — only in footer
- Newsletter signup — non-intrusive footer placement only
`;
}

function generateServiceSkillMd(name: string, primaryColor: string, timestamp: string): string {
  return `---
type: build-skill
category: service
version: 1.0
updated: ${timestamp}
---

# Build Recipe: Service Business App

> This recipe applies to: salons, gyms, spas, studios, fitness, consulting, photography studios, clinics, repair shops.
> App name: **${name}**
> Primary color: \`${primaryColor}\`

Read these FIRST before building anything:
- [[context/brand.md]] — colors, mood, fonts
- [[context/business.md]] — real services, pricing, team, location
- [[context/audience.md]] — who your clients are
- [[design/theme.json]] — all design tokens

---

## Pages to Build

### 1. Homepage (Trust + Book Now)
**Goal:** Establish trust immediately and make booking effortless.

**Layout:** Hero with professional imagery (staff at work, happy clients, clean environment).
Below: "What We Do" service highlights (3 cards), social proof (reviews), and a prominent "Book Now" CTA section.

**Components:**
- Hero: \`<Card>\` style with background image, headline, subheadline, "Book Now" + "See Services" buttons
- Service highlights: 3 \`<Card>\` components with icon, service name, one-line description
- Testimonials: \`<Carousel>\` (shadcn/ui) — rotating client quotes with name and rating
- Trust badges: row of \`<Badge>\` or icon + text combos (years in business, clients served, certifications)
- CTA section: full-width banner with phone number and "Book Appointment" button

**shadcn/ui:** \`Card\`, \`Carousel\`, \`Badge\`, \`Button\`, \`Avatar\`

**Content strategy:** Emphasize OUTCOMES for clients, not just service names.
"Glowing skin that lasts" not just "Facial treatment."

---

### 2. Services Page (Core Feature)
**Goal:** Show all services with pricing and push towards booking.

**Layout:** Services grouped by category (if applicable). Each service shown as a card with name, short description, duration, and price. "Book This" button on each card.

**Components:**
- Category sections: \`<Tabs>\` (shadcn/ui) if multiple service categories exist (e.g. Hair | Skin | Nails)
- Service card: \`<Card>\` — service name, description, duration badge, price, "Book" button
- Price: \`<Badge variant="outline">\` — always show price; use "From $X" for tiered services
- Duration: \`<Badge>\` — "60 min", "90 min"
- Pricing tiers: If service has multiple levels, use \`<Tabs>\` within the card (Basic / Premium / Luxury)

**shadcn/ui:** \`Tabs\`, \`Card\`, \`Badge\`, \`Button\`, \`Separator\`

**UX patterns:**
- Most popular service tagged with "⭐ Popular" badge
- "Book" button on every service card — don't make users navigate away to book
- Collapse long descriptions behind "More details" toggle

**Mobile:** Swipeable service cards using \`Carousel\` horizontally, or full-width stacked cards.
Sticky "Book Now" floating button at bottom of screen throughout this page.

---

### 3. Booking / Appointment Page
**Goal:** Simple, frictionless appointment booking.

**Layout:** Step-by-step form (or single form if short). Step 1: Select service. Step 2: Select date/time. Step 3: Contact info.

**Components:**
- Service selector: \`<Select>\` or radio cards
- Date picker: \`<Calendar>\` (shadcn/ui)
- Time slot: \`<RadioGroup>\` of available time buttons
- Contact: \`<Input>\` — name, phone, optional note
- Submit: \`<Button size="lg">\` — "Confirm Booking"
- Confirmation: \`<Alert>\` with booking summary, add-to-calendar link

**shadcn/ui:** \`Select\`, \`Calendar\`, \`RadioGroup\`, \`Input\`, \`Button\`, \`Alert\`, \`Progress\`

**Mobile:** Each step is full-screen. Back button at top. Progress bar shows steps.

---

### 4. Portfolio / Gallery Page
**Goal:** Show the quality of work to build confidence and inspire bookings.

**Layout:** Masonry photo grid (before/after pairs if applicable, or portfolio shots).
Optional filter by service type.

**Components:**
- Masonry grid: 2 columns mobile, 3 desktop
- \`<Dialog>\` (shadcn/ui) — lightbox on image click
- Before/After: side-by-side cards with \`<Slider>\` reveal if before/after photos exist
- Filter tabs: \`<Tabs>\` — "All" | service categories

**shadcn/ui:** \`Dialog\`, \`Tabs\`, \`Slider\`, \`AspectRatio\`

---

### 5. Team Page
**Goal:** Humanize the business and build personal connection.

**Layout:** Grid of team member cards. Each card: professional photo, name, title, specialties, booking link.

**Components:**
- Team card: \`<Card>\` — \`<Avatar>\` (large), name, title, specialty tags as \`<Badge>\`
- Grid: 2 columns mobile, 3–4 desktop
- "Book with [Name]" button on each card → booking page with staff pre-selected

**shadcn/ui:** \`Card\`, \`Avatar\`, \`Badge\`, \`Button\`

---

## Layout Architecture

\`\`\`
/ (homepage)
/services             ← service list with pricing
/book                 ← booking/appointment form
/gallery              ← portfolio / work showcase
/team                 ← staff profiles
/contact              ← location + hours
\`\`\`

**Navigation:**
- Desktop: top navbar with logo left, links, "Book Now" highlighted CTA button right
- Mobile: top bar logo + phone icon. Bottom tabs: Home | Services | Book | Gallery | More

---

## Mobile-Specific Rules

1. **Sticky "Book Now" button** — fixed at bottom of Services page. Use \`<Button>\` with fixed positioning
2. **Swipeable service cards** — on Services page, show first 2 cards with peek of 3rd to indicate scroll
3. **Full-screen calendar** — date picker expands to fill screen on mobile for easy date selection
4. **Tap-to-call** — phone number always a \`tel:\` link in the header
5. **Team photos** — square crop, 2-column grid, minimum 150×150px display size
6. **Progress steps** — booking form shows "Step 1 of 3" to reduce anxiety

---

## UX Patterns

- **"Book Now" is omnipresent** — it appears in the hero, on every service, in the navigation
- **Social proof placement** — show testimonials immediately after the hero, not hidden at the bottom
- **Price transparency** — never "call for pricing" unless truly necessary
- **Staff availability signals** — "Next available: Tuesday 3pm" if possible
- **Confirmation email/SMS mention** — "You'll receive a confirmation text" reduces no-shows

---

## Content Strategy

**Emphasize:**
- Results and transformations (photos of outcomes)
- Credentials, certifications, years of experience
- Convenience — easy booking, flexible hours, location
- Individual staff personalities — people book PEOPLE

**De-emphasize / Hide:**
- Generic "we care about customers" boilerplate
- Long company history on homepage
- Social media feed (footer only)
`;
}

function generatePortfolioSkillMd(name: string, primaryColor: string, timestamp: string): string {
  return `---
type: build-skill
category: portfolio
version: 1.0
updated: ${timestamp}
---

# Build Recipe: Portfolio / Creative Professional App

> This recipe applies to: photographers, designers, artists, freelancers, architects, illustrators, videographers.
> App name: **${name}**
> Primary color: \`${primaryColor}\`

Read these FIRST before building anything:
- [[context/brand.md]] — colors, mood, fonts
- [[context/business.md]] — real projects, services offered, bio
- [[context/audience.md]] — who hires this person
- [[design/theme.json]] — all design tokens

---

## Pages to Build

### 1. Homepage (First Impression)
**Goal:** Immediately communicate skill level and style. Make the work the hero.

**Layout:** Full-viewport hero with best portfolio piece as background (full-bleed image or video loop).
Name + title overlaid with minimal text. Scroll indicator. Below: 6–9 grid preview of portfolio work.

**Components:**
- Hero: full-bleed image/video, centered text (name, one-line specialty), "See My Work" + "Hire Me" CTA buttons
- Portfolio preview grid: responsive masonry or grid of 6–9 best works — clicking opens project
- Micro-bio strip: 2–3 line description + key stats (e.g. "10 years | 200+ projects | 30 countries")
- Client logos: \`<Carousel>\` of past client logos if available

**shadcn/ui:** \`Button\`, \`Card\`, \`Carousel\`, \`Badge\`

**Content strategy:** The work speaks. Minimize text on homepage. Lead with the BEST piece, not the most recent.
Name and specialty in max 10 words: "Wedding & Portrait Photographer — Chiang Mai."

---

### 2. Portfolio / Gallery Page (Core Feature)
**Goal:** Allow deep exploration of the body of work.

**Layout:** Masonry photo grid with category filter tabs above.
Clicking any work opens a full-screen lightbox / project detail view.

**Components:**
- Category filter: \`<Tabs>\` (shadcn/ui) — "All" | project categories (e.g. Wedding | Portrait | Commercial)
- Masonry grid: 2-column mobile, 3 desktop, 4 large desktop
- \`<Dialog>\` (shadcn/ui) — full-screen lightbox with:
  - Large image(s) via \`<Carousel>\`
  - Project title + brief description
  - Client / location / year
  - "Next Project" / "Previous Project" navigation arrows
  - "Inquire About This" CTA button

**shadcn/ui:** \`Tabs\`, \`Dialog\`, \`Carousel\`, \`Button\`, \`Badge\`, \`AspectRatio\`

**UX patterns:**
- Keyboard navigation in lightbox (← → arrow keys)
- Lazy loading for all images (intersection observer)
- Aspect ratio consistent within each row for visual harmony
- "Load more" button or infinite scroll

**Mobile:** Single column, full-width images. Swipe left/right in lightbox. Pinch-to-zoom support.

---

### 3. About / Bio Page
**Goal:** Build personal connection and credibility.

**Layout:** Minimal. Split layout: professional photo (left/top) + bio text + credentials (right/bottom).
Keep it concise — this is a portfolio, not a resume.

**Components:**
- Large professional photo: \`<AspectRatio>\` — portrait orientation
- Bio: 2–3 paragraphs max. First paragraph: who, specialty, philosophy. Second: background. Third: personal.
- Skills/tools: \`<Badge>\` list — "Lightroom", "Figma", "DSLR", etc.
- Awards / press mentions: \`<Card>\` list with logo/icon
- Download CV: \`<Button variant="outline">\` if applicable

**shadcn/ui:** \`AspectRatio\`, \`Badge\`, \`Card\`, \`Button\`, \`Separator\`

**Content strategy:** Write in first person. Sound human, not corporate. Include one surprising personal detail.
"I've photographed 200 weddings and still tear up at every first look."

---

### 4. Contact / Hire Me Page
**Goal:** Make it easy to start a project conversation.

**Layout:** Simple, distraction-free. Large headline "Let's Work Together." Form + contact alternatives below.

**Components:**
- \`<Form>\` — name, email, project type (\`<Select>\`), message (\`<Textarea>\`), budget range (\`<Select>\`)
- \`<Button size="lg">\` — "Send Message"
- Alternative contact: email address (copy-on-click), Instagram/social links
- Response time note: "I respond within 24 hours"
- \`<Alert>\` — success confirmation on submit

**shadcn/ui:** \`Form\`, \`Input\`, \`Textarea\`, \`Select\`, \`Button\`, \`Alert\`

**Mobile:** Full-width form. Each field full-width. Submit button full-width at bottom.

---

## Layout Architecture

\`\`\`
/ (homepage)
/portfolio            ← masonry gallery with filter
/portfolio/[slug]     ← single project detail (optional)
/about                ← bio + credentials
/contact              ← hire me form
\`\`\`

**Navigation:**
- Desktop: minimal top bar — name/logo (left), navigation links (right) — max 4 links
- Mobile: hamburger menu → \`<Sheet>\` drawer from right. Links only, no bottom tabs (too commercial)

**Design principle:** MINIMAL. White space is a feature. Navigation should not compete with the work.
Use \`navVariant: sidebar\` from theme for elegant desktop experience.

---

## Mobile-Specific Rules

1. **Single column, full-bleed images** — let images breathe. No cramped 2-column grids
2. **Full-screen lightbox** — use entire screen for project view, minimal chrome
3. **Swipe navigation** — swipe left/right between projects in lightbox
4. **Minimal navigation** — \`Sheet\` drawer, not bottom tabs (too app-like for creative portfolio)
5. **Large typography** — use headline font generously, don't be afraid of big text
6. **Touch-friendly image interactions** — tap to open, swipe to close lightbox

---

## UX Patterns

- **The work is the UI** — design should disappear and let photos/projects dominate
- **Fast loading** — lazy load images, use Next.js Image optimization
- **Curation over quantity** — show 20 great works, not 200 average ones
- **One CTA** — every page leads toward "Hire Me" or "Get in Touch"
- **No clutter** — no social media widgets, no blog sidebar, no pop-ups

---

## Content Strategy

**Emphasize:**
- Best projects prominently
- Unique specialty / niche (weddings, food photography, brand design, etc.)
- Social proof (notable clients, press, awards) — but subtly
- Personality — this is a person, not a company

**De-emphasize / Hide:**
- Pricing (discuss in inquiry)
- Availability calendar (handle via inquiry)
- Generic "quality work guaranteed" claims
- Long lists of every tool ever used
`;
}

function generateIdeaSkillMd(name: string, primaryColor: string, timestamp: string): string {
  return `---
type: build-skill
category: idea
version: 1.0
updated: ${timestamp}
---

# Build Recipe: Idea / Startup / Product Launch App

> This recipe applies to: startups, SaaS tools, community apps, games, digital products, waitlist landing pages.
> App name: **${name}**
> Primary color: \`${primaryColor}\`

Read these FIRST before building anything:
- [[context/brand.md]] — colors, mood, fonts
- [[context/business.md]] — idea description, features, audience
- [[context/audience.md]] — who this is for, their pain
- [[design/theme.json]] — all design tokens

---

## Pages to Build

### 1. Homepage / Landing Page (Core Feature)
**Goal:** Communicate the value proposition instantly and capture signups.

**Layout:** Bold hero section → Features → How it works → Social proof → Pricing (optional) → FAQ → Final CTA.
This is a classic long-form SaaS landing page pattern. Each section has one clear purpose.

**Components:**
- Hero section:
  - Headline: the ONE thing this product does (max 8 words)
  - Sub-headline: who it's for and the benefit (max 20 words)
  - Email capture \`<Input>\` + \`<Button>\` "Join Waitlist" / "Get Early Access" / "Start Free"
  - Hero image/mockup: product screenshot, illustration, or abstract graphic
  - Social proof micro-element: "Join 500+ people on the waitlist" or "Used by teams at X, Y, Z"
- Feature showcase: 3–6 feature cards in a 3-column grid (icon + title + 2-line description)
- How it works: numbered steps — 3 steps max, each with an illustration
- Testimonials: \`<Carousel>\` — 3–5 quotes from early users / testers
- FAQ: \`<Accordion>\` (shadcn/ui) — 5–8 common questions
- Final CTA: Full-width section, repeat the email capture

**shadcn/ui:** \`Input\`, \`Button\`, \`Card\`, \`Carousel\`, \`Accordion\`, \`Badge\`, \`Separator\`

**Content strategy:** The headline is everything. Test multiple variants. Lead with the OUTCOME not the feature.
"Ship code 10× faster" not "AI-powered IDE plugin."

---

### 2. Features Page (Deep Dive)
**Goal:** Give detail-oriented visitors proof that the product is real and solves their problem.

**Layout:** Alternating sections: screenshot/visual (left) + description (right), then flip.
Each section covers one major feature.

**Components:**
- Alternating layout: image + text, text + image, repeat
- Feature label: \`<Badge>\` — category tag ("Automation", "Analytics", "Collaboration")
- Screenshot/mockup: \`<AspectRatio>\` container with drop shadow
- Bullet benefits: icon + short benefit text (3–4 bullets per feature)
- Feature navigation: sticky left sidebar on desktop with anchor links

**shadcn/ui:** \`Badge\`, \`AspectRatio\`, \`Card\`, \`Separator\`

**Mobile:** Full-width images stacked above text. Single-column layout.

---

### 3. Pricing Page (if applicable)
**Goal:** Remove pricing anxiety and convert free users to paid.

**Layout:** 3-column pricing table (Free | Pro | Enterprise) or 2-column (Free | Pro).
Toggle for monthly/annual billing.

**Components:**
- Billing toggle: \`<Switch>\` (shadcn/ui) — "Monthly" / "Annual (Save 20%)"
- Pricing card: \`<Card>\` — plan name, price, feature list, CTA button
- Most popular: \`<Badge>\` "Most Popular" on recommended plan, highlighted with primary color
- Feature comparison: \`<Table>\` below cards for detailed comparison
- FAQ under table: \`<Accordion>\`

**shadcn/ui:** \`Switch\`, \`Card\`, \`Badge\`, \`Table\`, \`Accordion\`, \`Button\`

**Mobile:** Stacked pricing cards. Show recommended plan first.

---

### 4. Waitlist / Signup Page
**Goal:** Capture emails and build pre-launch momentum.

**Layout:** Minimal centered layout. Large headline, benefit bullets, email form.

**Components:**
- Headline: "Be First to Know" / "Get Early Access"
- Benefit list: 3 bullet points of what they get by joining early
- \`<Form>\` — first name + email only (minimal friction)
- \`<Button size="lg">\` — "Join the Waitlist" / "Get Early Access"
- Social proof counter: "X people already signed up"
- \`<Alert>\` — success message with what happens next ("Check your email for confirmation")
- Share prompt: "Tell a friend" with social share buttons

**shadcn/ui:** \`Form\`, \`Input\`, \`Button\`, \`Alert\`, \`Badge\`

**Mobile:** Full-screen centered card. Keyboard pushes form up (not down). Submit button always visible.

---

## Layout Architecture

\`\`\`
/ (homepage / landing page)
/features             ← detailed feature showcase
/pricing              ← pricing plans (if applicable)
/waitlist             ← signup capture page
/about                ← team / story (if applicable)
\`\`\`

**Navigation:**
- Desktop: top navbar — logo left, navigation links center, "Sign Up" / "Join Waitlist" CTA button right
- Mobile: hamburger → \`<Sheet>\` drawer. Sticky bottom bar with email capture strip

---

## Mobile-Specific Rules

1. **Single-column feature cards** — stack vertically on mobile, full-width
2. **Sticky signup CTA** — "Join Waitlist" button fixed at bottom of screen on homepage
3. **Large hero text** — headline should be 32px+ on mobile (not shrink to 18px)
4. **Swipeable testimonials** — \`Carousel\` with dot indicators
5. **Fast load** — hero section must load in <2s. No autoplay video on mobile
6. **Form optimization** — email keyboard type (\`type="email"\`), large submit button (full width)

---

## UX Patterns

- **Waitlist momentum** — show a signup counter "X people waiting" to trigger FOMO
- **Progressive reveal** — features revealed with subtle animation as user scrolls (Intersection Observer)
- **Objection handling** — FAQ section directly addresses "why would I use this vs X?"
- **Social proof density** — at least 3 forms of social proof: testimonials, user count, logos
- **Scarcity signals** — "Limited beta spots available" if appropriate
- **Zero dead ends** — every page has a CTA leading to signup

---

## Content Strategy

**Emphasize:**
- The ONE core value proposition — what problem does this solve?
- Who this is specifically for — "For teams that ship daily"
- Social proof — early users, beta testers, advisors
- The "aha moment" — make users feel they've already succeeded

**De-emphasize / Hide:**
- Technical implementation details (save for docs)
- Long company/founder story on homepage
- Pricing friction (offer free tier or trial)
- Everything that isn't the core value prop in the hero section
`;
}

/**
 * skills/_active.md — English pointer to active build recipe.
 * Always English (technical instruction for Claude Code).
 */
export function generateActiveSkillMd(spec: Partial<MerchantAppSpec>): string {
  const category = getCategoryFromBusinessType(spec.businessType);
  const timestamp = new Date().toISOString();

  return `---
type: skill-pointer
active: true
category: ${category}
updated: ${timestamp}
---

# Active Build Skill

This app follows the **${category}** build recipe.

→ [[skills/build/${category}.md]]

## Prerequisites (read before building)
1. [[context/brand.md]] — mood, colors, fonts
2. [[context/business.md]] — products, priorities, location
3. [[context/audience.md]] — who to build for
4. [[design/theme.json]] — all design tokens
5. [[context/decisions/_index.md]] — every decision made so far
`;
}

/**
 * context/decisions/_index.md — Index of all decisions made.
 * Generated in spec.primaryLanguage.
 */
export function generateDecisionIndex(spec: Partial<MerchantAppSpec>): string {
  const lang = spec.primaryLanguage || 'en';
  const L = getLabels(lang);
  const businessName = spec.businessName || spec.scrapedData?.name || L.pending;
  const timestamp = new Date().toISOString();

  const decisions: string[] = [];

  if (spec.mood) {
    decisions.push(`- [[001-visual-mood.md]] — ${L.visualMood}: **${spec.mood}**`);
  }

  return `---
type: map-of-content
domain: decisions
updated: ${timestamp}
---

# ${L.decisionLog}: ${businessName}

## ${L.decisionLog}
${decisions.length ? decisions.join('\n') : L.noneSpecified}

---
_${L.notSet}_
`;
}

// ============================================================
// MASTER GENERATOR
// ============================================================

/**
 * generateVaultFiles — master function.
 *
 * Returns all VaultFile entries that should be written/overwritten
 * in the merchant's Railway workspace (relative to /workspace/).
 *
 * Handles incomplete specs gracefully — never throws.
 */
/**
 * CLAUDE.md — THE BUILD SPECIFICATION FOR THIS APP.
 *
 * This is NOT a generic template. It leads with FUNCTIONAL requirements:
 * what screens to build, what users do, what data exists, what launches first.
 * Visual/brand details follow — they are secondary.
 *
 * Claude Code reads this file first. It must contain enough to build
 * the app without any additional context.
 */
export function generateClaudeMd(spec: Partial<MerchantAppSpec>): string {
  const name = spec.businessName || 'Your App';
  const type = spec.businessType || spec.appFormat || spec.category || 'app';
  const lang = spec.primaryLanguage || 'en';
  const fonts = detectFontForLanguage(lang);

  // Resolve brand — user-set values override auto-generated defaults
  const brandDefaults = getDefaultBrandForCategory(spec.businessType, spec.appFormat);
  const primaryColor = spec.primaryColor || brandDefaults.primaryColor;
  const mood = spec.mood || brandDefaults.mood;
  const uiStyle = spec.uiStyle || brandDefaults.uiStyle;
  const brandSource = spec.primaryColor ? 'user-specified' : 'auto-generated for this app type';

  // Full app description
  const descParts: string[] = [];
  if (spec.ideaDescription) descParts.push(spec.ideaDescription);
  if (spec.scrapedData?.description) descParts.push(spec.scrapedData.description);
  const description = descParts.join(' ').trim() || `A ${type} app called ${name}.`;

  // ── Section: Core actions ──────────────────────────────────
  let coreActionsSection = '';
  if (spec.coreActions?.length) {
    coreActionsSection = `
## Core Actions (what users DO)
These are the primary interactions — every screen should support at least one of these:
${spec.coreActions.map((a) => `- ${a}`).join('\n')}

Build UI flows that make each action feel effortless. The most important action is **${spec.coreActions[0]}**.`;
  }

  // ── Section: Key screens ───────────────────────────────────
  let screensSection = '';
  if (spec.keyScreens?.length) {
    screensSection = `
## Screens to Build
Build EXACTLY these screens — in this order (earlier = higher priority):
${spec.keyScreens.map((s, i) => `${i + 1}. **${s}**`).join('\n')}

Each screen must be fully functional, not a placeholder. Use real content from context/business.md.`;
  } else {
    // Fallback: infer screens from business type
    screensSection = `
## Screens to Build
No explicit screen list provided — infer appropriate screens for a **${type}** app.
Use context/business.md and context/audience.md to shape the content of each screen.`;
  }

  // ── Section: MVP scope ─────────────────────────────────────
  let mvpSection = '';
  if (spec.mvpScope) {
    mvpSection = `
## Build This First (MVP)
The user defined the minimum viable launch as:
**${spec.mvpScope}**

Build these features COMPLETELY before touching anything else.
Non-MVP screens can be stubs with "Coming soon" if needed — MVP screens must be 100% functional.`;
  }

  // ── Section: User journey ──────────────────────────────────
  let journeySection = '';
  if (spec.userJourney) {
    journeySection = `
## User Journey (new user's first experience)
${spec.userJourney}

The first screen a new user sees is the most important. Make it immediately clear what the app does and what to do next.`;
    if (spec.firstImpression) {
      journeySection += `\n\n**First impression:** ${spec.firstImpression}`;
    }
  }

  // ── Section: Data model ────────────────────────────────────
  let dataModelSection = '';
  if (spec.dataModel) {
    dataModelSection = `
## Data Model
${spec.dataModel}

Build your components and pages around this data structure. Use realistic mock data that matches this model — never use "Lorem ipsum" or "Sample Item 1".`;
  }

  // ── Section: Monetization ──────────────────────────────────
  let monetizationSection = '';
  if (spec.monetizationModel && spec.monetizationModel !== 'free') {
    const monetizationInstructions: Record<string, string> = {
      'subscriptions': 'Include a pricing/plans screen. Gate premium features behind a paywall UI (show locked state with upgrade prompt). Do NOT implement actual payment processing — use a mock "Subscribe" button that shows a confirmation.',
      'one-time purchase': 'Include a purchase screen with a clear price and "Buy Now" CTA. Show the value proposition clearly before the paywall.',
      'freemium': 'Core features are free and fully functional. Premium features show a locked state with upgrade prompt. Include an upgrade/pricing screen.',
      'ads': 'Reserve ad placement slots in the layout (header banner, between-content slots). Use placeholder ad boxes — do NOT integrate a real ad SDK.',
      'marketplace commission': 'The platform takes a % of each transaction. Show seller fees and buyer prices clearly. Include a transaction/earnings screen if relevant.',
      'tips/donations': 'Include a tipping or donation UI at natural moments (after completing an action, on the creator\'s profile). Keep it unobtrusive.',
    };
    const instruction = monetizationInstructions[spec.monetizationModel] || `Implement UI for: ${spec.monetizationModel}`;
    monetizationSection = `
## Monetization: ${spec.monetizationModel}
${instruction}`;
  }

  // ── Section: Products / items ─────────────────────────────
  let productsSection = '';
  if (spec.products?.length) {
    productsSection = `
## Real Content: Products / Items
Use these EXACT items — not placeholders. Build the catalog/menu/listing UI around them:
${spec.products.map((p) => {
  const parts = [`- **${p.name}**`];
  if (p.description) parts.push(`: ${p.description}`);
  if (p.price != null) parts.push(` — ${p.currency || ''}${p.price}`);
  if (p.category) parts.push(` [${p.category}]`);
  return parts.join('');
}).join('\n')}

Total: ${spec.products.length} items. If there are categories, build a tabbed or filtered view.`;
  }

  // ── Section: Integrations ─────────────────────────────────
  let integrationsSection = '';
  if (spec.integrations?.length) {
    integrationsSection = `
## Integrations Required
${spec.integrations.map((i) => `- ${i}`).join('\n')}

Implement UI stubs for all integrations. Real API calls can be mocked — the UI flow must be complete.`;
  }

  // ── Section: Priority order ────────────────────────────────
  let prioritiesSection = '';
  if (spec.appPriorities?.length) {
    prioritiesSection = `
## Feature Priority
${spec.appPriorities.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Build in this order. The #1 item is the reason this app exists — make it perfect before moving on.`;
  }

  // ── Section: Audience ──────────────────────────────────────
  let audienceSection = '';
  if (spec.audienceDescription) {
    audienceSection = `
## Target Audience
${spec.audienceDescription}

Calibrate every word of copy, every interaction pattern, and every visual decision to this audience.`;
  }

  // ── Section: Features ──────────────────────────────────────
  let featuresSection = '';
  if (spec.selectedFeatures?.length) {
    featuresSection = `
## Required Platform Features
Build ALL of these — they were explicitly requested:
${spec.selectedFeatures.map((f) => `- ✅ ${f}`).join('\n')}`;
  }

  // ── Section: Anti-preferences ─────────────────────────────
  let antiSection = '';
  if (spec.antiPreferences?.length) {
    antiSection = `
## DO NOT
${spec.antiPreferences.map((a) => `- ❌ ${a}`).join('\n')}`;
  }

  // ── Section: Location / scraped data ─────────────────────
  let locationSection = '';
  if (spec.scrapedData?.address) {
    const locationLines = [`- Address: ${spec.scrapedData.address}`];
    if (spec.scrapedData.phone) locationLines.push(`- Phone: ${spec.scrapedData.phone}`);
    if (spec.scrapedData.hours) {
      const hoursStr = Object.entries(spec.scrapedData.hours)
        .map(([d, h]) => `${d}: ${h}`)
        .join(' | ');
      locationLines.push(`- Hours: ${hoursStr}`);
    }
    if (spec.scrapedData.rating) locationLines.push(`- Rating: ${spec.scrapedData.rating}/5`);
    locationSection = `
## Real Location Data (use in contact/location screens)
${locationLines.join('\n')}`;
  }

  // ── Section: Design system ────────────────────────────────
  const bgColor = spec.scrapedData?.backgroundColor
    || (['luxury', 'dark', 'moody', 'gaming'].includes(mood) ? '#0F0F1A' : '#ffffff');
  const bgSource = spec.scrapedData?.backgroundColor
    ? 'from scraped brand website'
    : (['luxury', 'dark', 'moody', 'gaming'].includes(mood) ? 'dark mood' : 'light theme');

  return `# ${name}
> ${description}

---

## 1. What This App Is

**Type:** ${type}
**Name:** ${name}
**Description:** ${description}

This is a real app built for real users. Every screen, interaction, and piece of copy
must reflect what the user actually asked for. Do not build a generic template.

---

## 2. Build These Screens
${screensSection.trim()}

---

## 3. What Users Do
${coreActionsSection.trim() || `No explicit action list — infer appropriate interactions for a ${type} app.`}

---

## 4. Launch Priority (MVP)
${mvpSection.trim() || `No explicit MVP defined — use judgment to build the most essential screens first.\nFor a ${type} app, that typically means: the core feature, a way to navigate, and a way to get started.`}

---

## 5. User Journey
${journeySection.trim() || `No explicit journey captured — design the new user experience for a ${type} app.\nFirst screen should immediately communicate what the app does and what to do next.`}

---

## 6. Data Model
${dataModelSection.trim() || `No explicit data model — infer appropriate entities for a ${type} app.\nUse realistic mock data. No "Lorem ipsum", no "Sample Item 1".`}
${monetizationSection}
${productsSection}
${integrationsSection}
${prioritiesSection}
${audienceSection}
${featuresSection}
${antiSection}
${locationSection}

---

## Design System
> Brand is ${brandSource}. Users can customize colors and style in the app console.

- **Primary color:** ${primaryColor}
- **Mood:** ${mood} (${brandDefaults.moodKeywords.join(', ')})
- **UI style:** ${uiStyle}
- **Heading font:** ${fonts.heading}
- **Body font:** ${fonts.body}
- **Background:** ${bgColor} (${bgSource})
- **Language:** ${lang}

Full token set in \`design/theme.json\`. **Never hardcode hex values** — use theme tokens only.
Background and foreground MUST match theme.json values exactly.

---

## Build Rules
1. **Screens first.** Build every screen in Section 2 before styling anything.
2. **MVP first.** Section 4 defines what must work at launch. Do it first.
3. **Mobile-first.** Every screen must work at 375px width.
4. **Real content only.** Use names, items, and copy from context/business.md. No placeholders.
5. **Real photos** from \`/public/assets/\` if available. Gradient placeholders if not — never broken images.
6. **TypeScript + Next.js App Router.** \`"use client"\` on every component with state or effects.
7. **Tailwind only.** Use theme tokens. No inline styles, no hardcoded colors.
8. **Unique, not generic.** This is a ${type} app — it should look and feel like one, not like a template.

---

## Quality Checklist
Before finishing, verify:
- [ ] All screens from Section 2 are built and navigable
- [ ] MVP features (Section 4) are fully functional
- [ ] Primary color \`${primaryColor}\` appears correctly throughout
- [ ] No placeholder text anywhere in the app
- [ ] Mobile layout correct at 375px
- [ ] TypeScript compiles with zero errors (\`npx tsc --noEmit\`)
- [ ] App feels like a **${type}** app, not a generic starter template
`;
}

export function generateVaultFiles(spec: Partial<MerchantAppSpec>): VaultFile[] {
  const files: VaultFile[] = [];

  // Apply brand defaults when user hasn't specified visual preferences.
  // This gives every app a coherent theme without asking about it in the interview.
  const brandDefaults = getDefaultBrandForCategory(spec.businessType, spec.appFormat);
  const effectiveSpec: Partial<MerchantAppSpec> = {
    ...spec,
    mood: spec.mood ?? brandDefaults.mood,
    primaryColor: spec.primaryColor ?? brandDefaults.primaryColor,
    moodKeywords: spec.moodKeywords?.length ? spec.moodKeywords : brandDefaults.moodKeywords,
    uiStyle: spec.uiStyle ?? brandDefaults.uiStyle,
  };

  // CLAUDE.md — functional build spec for this app
  files.push({ path: 'CLAUDE.md', content: generateClaudeMd(effectiveSpec) });

  // Context files — overwrite on every spec update
  files.push({ path: 'context/brand.md', content: generateBrandMd(effectiveSpec) });
  files.push({ path: 'context/business.md', content: generateBusinessMd(effectiveSpec) });
  files.push({ path: 'context/audience.md', content: generateAudienceMd(effectiveSpec) });

  // Design tokens
  files.push({ path: 'design/theme.json', content: generateThemeJson(effectiveSpec) });

  // Build skill pointer
  files.push({ path: 'skills/_active.md', content: generateActiveSkillMd(effectiveSpec) });

  // Category-specific build recipe
  const category = getCategoryFromBusinessType(effectiveSpec.businessType);
  files.push({
    path: `skills/build/${category}.md`,
    content: generateCategorySkillMd(effectiveSpec, category),
  });

  // Mood decision log — always generated now (we always have a mood via defaults)
  files.push({
    path: 'context/decisions/001-visual-mood.md',
    content: generateMoodDecisionMd(effectiveSpec),
  });
  files.push({
    path: 'context/decisions/_index.md',
    content: generateDecisionIndex(effectiveSpec),
  });

  return files;
}
