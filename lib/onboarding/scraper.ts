// Social media / website scraper for brand context extraction
// Scrapes public pages and extracts: colors, images, bio, products, vibe

import Anthropic from '@anthropic-ai/sdk';
import { isGoogleMapsUrl, scrapeGooglePlace } from './google-places-scraper';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ScrapedBrandContext {
  source: 'instagram' | 'facebook' | 'website' | 'google_maps' | 'unknown';
  url: string;
  businessName?: string;
  bio?: string;
  description?: string;
  products?: string[];
  vibe?: string;
  brandColors?: string[];
  backgroundColor?: string;
  fontFamily?: string;
  imageUrls?: string[];
  followerCount?: string;
  category?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  error?: string;
}

// Detect platform from URL
function detectPlatform(url: string): 'instagram' | 'facebook' | 'website' {
  const lower = url.toLowerCase();
  if (lower.includes('instagram.com') || lower.includes('instagr.am')) return 'instagram';
  if (lower.includes('facebook.com') || lower.includes('fb.com') || lower.includes('fb.me')) return 'facebook';
  return 'website';
}

// Normalize URL
function normalizeUrl(input: string): string {
  let url = input.trim();
  // Handle @username for Instagram
  if (url.startsWith('@')) {
    return `https://www.instagram.com/${url.slice(1)}/`;
  }
  // Handle bare usernames (no dots, no spaces, no slashes)
  if (!url.includes('.') && !url.includes('/') && !url.includes(' ')) {
    return `https://www.instagram.com/${url}/`;
  }
  if (!url.startsWith('http')) {
    url = `https://${url}`;
  }
  return url;
}

// Fetch page HTML with browser-like headers
async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    // Limit to 50KB to avoid huge pages
    return html.slice(0, 50000);
  } finally {
    clearTimeout(timeout);
  }
}

// Extract meta tags and structured data from HTML
function extractMeta(html: string): Record<string, string> {
  const meta: Record<string, string> = {};

  // OG tags
  const ogMatches = html.matchAll(/<meta\s+(?:property|name)=["'](og:[^"']+)["']\s+content=["']([^"']*)["']/gi);
  for (const m of ogMatches) meta[m[1]] = m[2];

  // Standard meta
  const metaMatches = html.matchAll(/<meta\s+name=["']([^"']+)["']\s+content=["']([^"']*)["']/gi);
  for (const m of metaMatches) meta[m[1]] = m[2];

  // Reverse order (content before name)
  const revMatches = html.matchAll(/<meta\s+content=["']([^"']*)["']\s+(?:property|name)=["']([^"']+)["']/gi);
  for (const m of revMatches) meta[m[2]] = m[1];

  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) meta['title'] = titleMatch[1].trim();

  // JSON-LD
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch[1]);
      if (ld.name) meta['ld:name'] = ld.name;
      if (ld.description) meta['ld:description'] = ld.description;
      if (ld.image) meta['ld:image'] = typeof ld.image === 'string' ? ld.image : ld.image?.url || '';
    } catch { /* ignore */ }
  }

  return meta;
}

// Extract image URLs from HTML
function extractImages(html: string, baseUrl: string): string[] {
  const images: string[] = [];

  // OG image
  const ogImg = html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i)
    || html.match(/content=["']([^"']+)["']\s+property=["']og:image["']/i);
  if (ogImg) images.push(ogImg[1]);

  // Large images from img tags
  const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*/gi);
  for (const m of imgMatches) {
    const src = m[1];
    // Skip tiny icons, tracking pixels, etc
    if (src.includes('1x1') || src.includes('pixel') || src.includes('blank') || src.includes('.svg')) continue;
    // Check for size hints
    const widthMatch = m[0].match(/width=["']?(\d+)/i);
    if (widthMatch && parseInt(widthMatch[1]) < 100) continue;
    
    let fullUrl = src;
    if (src.startsWith('//')) fullUrl = 'https:' + src;
    else if (src.startsWith('/')) fullUrl = new URL(src, baseUrl).href;
    
    if (!images.includes(fullUrl)) images.push(fullUrl);
  }

  return images.slice(0, 8); // Max 8 images
}

// Use Claude to analyze the scraped content and extract brand context
async function analyzeBrandContext(
  html: string,
  meta: Record<string, string>,
  imageUrls: string[],
  url: string,
  platform: string
): Promise<Partial<ScrapedBrandContext>> {
  // Extract meaningful text: keep headings, links, structured content
  const cleanText = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<(h[1-6])[^>]*>/gi, '\n## ')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim()
    .slice(0, 5000);

  // Extract inline CSS colors
  const cssColors: string[] = [];
  const colorMatches = html.matchAll(/#([0-9a-fA-F]{6})\b/g);
  for (const m of colorMatches) {
    const hex = `#${m[1]}`;
    if (!cssColors.includes(hex) && !['#000000', '#ffffff', '#FFFFFF', '#333333', '#666666', '#999999', '#cccccc'].includes(hex)) {
      cssColors.push(hex);
    }
  }

  // Extract font families from CSS
  const cssFonts: string[] = [];
  const fontMatches = html.matchAll(/font-family\s*:\s*["']?([^;"'}\n]+)/gi);
  for (const m of fontMatches) {
    const font = m[1].split(',')[0].trim().replace(/["']/g, '');
    if (font && !cssFonts.includes(font) && !['inherit', 'initial', 'system-ui', '-apple-system', 'sans-serif', 'serif', 'monospace'].includes(font.toLowerCase())) {
      cssFonts.push(font);
    }
  }

  // Extract background colors
  const bgColors: string[] = [];
  const bgMatches = html.matchAll(/background(?:-color)?\s*:\s*#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/gi);
  for (const m of bgMatches) {
    bgColors.push(`#${m[1]}`);
  }

  const prompt = `You are analyzing a ${platform} page for a local business. Your job is to extract EVERYTHING you can about this brand, even if you need to infer from limited data. Be creative and thorough.

URL: ${url}

META TAGS:
${Object.entries(meta).slice(0, 25).map(([k, v]) => `${k}: ${v}`).join('\n')}

CSS COLORS FOUND: ${cssColors.slice(0, 10).join(', ') || 'none'}
BACKGROUND COLORS FOUND: ${bgColors.slice(0, 5).join(', ') || 'none'}
FONT FAMILIES FOUND: ${cssFonts.slice(0, 5).join(', ') || 'none'}

PAGE CONTENT:
${cleanText}

IMPORTANT INSTRUCTIONS:
- For "bio": Write a compelling 1-sentence tagline. If the page has one, use it. Otherwise, craft one from what you can tell about the business.
- For "description": Write 2-3 sentences about what this business does and what makes it special. BE SPECIFIC — mention their actual offerings, style, or unique qualities.
- For "products": List their main products/services. For restaurants, list cuisine types or signature dishes. For salons, list services. For retail, list product categories. Infer from ANY clue on the page.
- For "vibe": Choose based on the page's tone, imagery, and language.
- For "brandColors": Use the CSS colors found above, or infer from the business type and vibe. First color = primary brand color.
- For "backgroundColor": Use the dominant background color found in CSS, or infer a fitting dark/light bg from the brand's vibe. If the brand is dark/luxury use a dark hex, if minimal/clean use near-white like #F8F7F5. Default dark if unsure.
- For "fontFamily": Use the first meaningful font family found, or leave empty if none found.
- NEVER return null or empty arrays. Always provide your best inference.

Return a JSON object:
{
  "businessName": "exact business name",
  "bio": "compelling one-line tagline",
  "description": "2-3 sentences about what makes this business special",
  "products": ["product1", "product2", "product3"],
  "vibe": "cozy|bold|classy|playful|modern|elegant|rustic|vibrant|minimal",
  "category": "restaurant|cafe|salon|retail|fitness|bar|clinic|other",
  "brandColors": ["#hex1", "#hex2"],
  "backgroundColor": "#hex",
  "fontFamily": "Font Name or empty string"
}

Return ONLY valid JSON.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    console.error('[scraper] Claude analysis failed:', err);
  }

  return {};
}

// Main scrape function
export async function scrapeBrandContext(rawUrl: string): Promise<ScrapedBrandContext> {
  const url = normalizeUrl(rawUrl);
  
  // Check if it's a Google Maps URL or search query
  if (isGoogleMapsUrl(url) || isGoogleMapsUrl(rawUrl)) {
    try {
      const placeData = await scrapeGooglePlace(url);
      if (placeData.error) {
        return { source: 'unknown', url, error: placeData.error };
      }
      return {
        source: 'google_maps',
        url,
        businessName: placeData.businessName,
        bio: placeData.description,
        description: placeData.description,
        products: placeData.products,
        vibe: placeData.vibe,
        imageUrls: placeData.imageUrls || [],
        category: placeData.category,
        followerCount: placeData.rating ? `${placeData.rating}★ (${placeData.reviewCount || ''} reviews)` : undefined,
        address: placeData.address,
        latitude: placeData.latitude,
        longitude: placeData.longitude,
      };
    } catch (err) {
      console.error('[scraper] Google Maps scrape failed:', err);
    }
  }

  const platform = detectPlatform(url);

  try {
    const html = await fetchPage(url);
    const meta = extractMeta(html);
    const imageUrls = extractImages(html, url);

    // Extract background colors and fonts here too (for fallback)
    const localBgColors: string[] = [];
    const bgColorMatches = html.matchAll(/background(?:-color)?\s*:\s*#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/gi);
    for (const m of bgColorMatches) localBgColors.push(`#${m[1]}`);

    const localFonts: string[] = [];
    const fontFamilyMatches = html.matchAll(/font-family\s*:\s*["']?([^;"'}\n]+)/gi);
    for (const m of fontFamilyMatches) {
      const font = m[1].split(',')[0].trim().replace(/["']/g, '');
      if (font && !['inherit', 'initial', 'system-ui', '-apple-system', 'sans-serif', 'serif', 'monospace'].includes(font.toLowerCase())) {
        localFonts.push(font);
      }
    }

    // Use Claude to analyze
    const analysis = await analyzeBrandContext(html, meta, imageUrls, url, platform);

    return {
      source: platform,
      url,
      businessName: analysis.businessName || meta['og:title'] || meta['title'],
      bio: analysis.bio || meta['og:description'] || meta['description'],
      description: analysis.description,
      products: analysis.products,
      vibe: analysis.vibe,
      brandColors: analysis.brandColors,
      backgroundColor: (analysis as Record<string, unknown>).backgroundColor as string | undefined || localBgColors[0],
      fontFamily: (analysis as Record<string, unknown>).fontFamily as string | undefined || localFonts[0],
      imageUrls: imageUrls.slice(0, 5),
      category: analysis.category,
    };
  } catch (err) {
    console.error('[scraper] Failed to scrape:', url, err);
    return {
      source: platform,
      url,
      error: `Couldn't access this page. No worries — we'll build your cover from your answers instead!`,
    };
  }
}
