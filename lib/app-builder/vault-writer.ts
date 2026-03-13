/**
 * Freedom World App Builder — Vault Writer
 * Sprint 2.1
 *
 * DETERMINISTIC function (NO AI calls).
 * Maps MerchantAppSpec → markdown/JSON vault files.
 *
 * Output files are written to the merchant's Railway workspace via SSH.
 */

import { MerchantAppSpec, VaultFile } from './types';

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

  const theme = {
    version: '1.0',
    mood,
    colors: {
      primary: primaryColor,
      primaryForeground: '#ffffff',
      primaryLight: lightenColor(primaryColor, 0.85),
      primaryDark: darkenColor(primaryColor, 0.2),
      secondary: spec.secondaryColor || lightenColor(primaryColor, 0.9),
      background: '#ffffff',
      foreground: '#1a1a1a',
      muted: '#f5f5f5',
      mutedForeground: '#6b7280',
      accent: lightenColor(primaryColor, 0.7),
      accentForeground: '#1a1a1a',
      border: lightenColor(primaryColor, 0.9),
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

/**
 * skills/_active.md — English pointer to active build recipe.
 * Always English (technical instruction for Claude Code).
 */
export function generateActiveSkillMd(spec: Partial<MerchantAppSpec>): string {
  const category = spec.category || 'restaurant-food';
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
export function generateVaultFiles(spec: Partial<MerchantAppSpec>): VaultFile[] {
  const files: VaultFile[] = [];

  // Always generate context files (overwrite on every spec update)
  files.push({ path: 'context/brand.md', content: generateBrandMd(spec) });
  files.push({ path: 'context/business.md', content: generateBusinessMd(spec) });
  files.push({ path: 'context/audience.md', content: generateAudienceMd(spec) });

  // Always generate theme.json
  files.push({ path: 'design/theme.json', content: generateThemeJson(spec) });

  // Always generate active skill pointer
  files.push({ path: 'skills/_active.md', content: generateActiveSkillMd(spec) });

  // Only generate mood decision files if mood is set
  if (spec.mood) {
    files.push({
      path: 'context/decisions/001-visual-mood.md',
      content: generateMoodDecisionMd(spec),
    });
    files.push({
      path: 'context/decisions/_index.md',
      content: generateDecisionIndex(spec),
    });
  }

  return files;
}
