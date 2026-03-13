/**
 * Freedom World App Builder — Scraper Adapter
 * Adapted: @/ imports replaced with relative paths.
 */

import { MerchantAppSpec, ScrapedBusinessData } from './types';
import { scrapeBrandContext } from '../onboarding/scraper';
import { scrapeGooglePlace, isGoogleMapsUrl } from '../onboarding/google-places-scraper';
import { sshExecCommand } from './railway';

// ============================================================
// INTERNAL TYPES
// ============================================================

interface EnrichedScrapedData extends ScrapedBusinessData {
  latitude?: number;
  longitude?: number;
  logoUrl?: string;
  bannerUrl?: string;
}

// ============================================================
// HELPERS
// ============================================================

function parseHours(
  raw: string | Record<string, string>
): Record<string, string> | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'object') return raw;

  const result: Record<string, string> = {};
  const lines = raw.split(/[,\n]/);
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const day = line.slice(0, colonIdx).trim();
      const hours = line.slice(colonIdx + 1).trim();
      if (day && hours) result[day] = hours;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function mapPriceLevel(priceLevel?: string): 1 | 2 | 3 | 4 | undefined {
  if (!priceLevel) return undefined;
  const map: Record<string, 1 | 2 | 3 | 4> = {
    free: 1,
    budget: 1,
    'mid-range': 2,
    upscale: 3,
    'fine-dining': 4,
  };
  return map[priceLevel.toLowerCase()];
}

// ============================================================
// MAIN: scrapeToSpec
// ============================================================

export async function scrapeToSpec(
  url: string,
  spec: MerchantAppSpec
): Promise<MerchantAppSpec> {
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    console.warn('[scraper-adapter] scrapeToSpec called with empty URL');
    return spec;
  }

  const trimmedUrl = url.trim();

  try {
    if (isGoogleMapsUrl(trimmedUrl)) {
      console.log('[scraper-adapter] Google Maps URL detected, using Places scraper');

      const placeData = await scrapeGooglePlace(trimmedUrl);

      if (placeData.error && !placeData.businessName) {
        console.warn('[scraper-adapter] Google Maps scrape failed:', placeData.error);
        return spec;
      }

      const photos = (placeData.imageUrls ?? []).slice(0, 10);

      const enriched: EnrichedScrapedData = {
        name: placeData.businessName,
        address: placeData.address,
        phone: placeData.phone,
        website: placeData.website,
        googleMapsUrl: placeData.url,
        rating: placeData.rating ? parseFloat(placeData.rating) : undefined,
        reviewCount: placeData.reviewCount
          ? parseInt(placeData.reviewCount, 10)
          : undefined,
        hours: placeData.hours
          ? parseHours(placeData.hours as unknown as string)
          : undefined,
        photos,
        categories: placeData.products ?? [],
        description: placeData.description,
        priceLevel: mapPriceLevel(placeData.priceLevel),
        scrapedAt: new Date().toISOString(),
        latitude: placeData.latitude,
        longitude: placeData.longitude,
        logoUrl: photos[0],
        bannerUrl: photos[1] ?? photos[0],
      };

      return {
        ...spec,
        businessName: placeData.businessName ?? spec.businessName,
        scrapedData: enriched as ScrapedBusinessData,
      };
    }

    console.log('[scraper-adapter] Generic URL, using scrapeBrandContext');

    const brandData = await scrapeBrandContext(trimmedUrl);

    if (brandData.error && !brandData.businessName) {
      console.warn('[scraper-adapter] Generic scrape failed:', brandData.error);
      return spec;
    }

    const photos = (brandData.imageUrls ?? []).slice(0, 10);

    const enriched: EnrichedScrapedData = {
      name: brandData.businessName,
      address: brandData.address,
      photos,
      categories: brandData.products ?? [],
      description: brandData.bio ?? brandData.description,
      scrapedAt: new Date().toISOString(),
      latitude: brandData.latitude,
      longitude: brandData.longitude,
      logoUrl: photos[0],
      bannerUrl: photos[1] ?? photos[0],
    };

    return {
      ...spec,
      businessName: brandData.businessName ?? spec.businessName,
      scrapedData: enriched as ScrapedBusinessData,
    };
  } catch (err) {
    console.error('[scraper-adapter] scrapeToSpec unexpected error:', err);
    return spec;
  }
}

// ============================================================
// MAIN: downloadAssetsToService
// ============================================================

export async function downloadAssetsToService(
  projectId: string,
  serviceId: string,
  photos: string[],
  logoUrl?: string,
  bannerUrl?: string
): Promise<string[]> {
  if (!projectId || !serviceId) {
    console.warn('[scraper-adapter] downloadAssetsToService: missing projectId or serviceId');
    return [];
  }

  const mkdirResult = await sshExecCommand(
    projectId,
    serviceId,
    'mkdir -p /workspace/public/assets/gallery'
  );

  if (mkdirResult.exitCode !== 0) {
    console.error(
      '[scraper-adapter] Failed to create gallery directory:',
      mkdirResult.stderr
    );
    return [];
  }

  const downloadedPaths: string[] = [];
  const limitedPhotos = photos.slice(0, 10);

  for (let i = 0; i < limitedPhotos.length; i++) {
    const photoUrl = limitedPhotos[i];
    const targetPath = `/workspace/public/assets/gallery/photo-${i + 1}.jpg`;
    const relativePath = `/public/assets/gallery/photo-${i + 1}.jpg`;

    const result = await sshExecCommand(
      projectId,
      serviceId,
      `curl -sL --max-time 30 --create-dirs -o "${targetPath}" "${photoUrl}"`
    );

    if (result.exitCode === 0) {
      downloadedPaths.push(relativePath);
    } else {
      console.warn(
        `[scraper-adapter] Failed to download photo ${i + 1}:`,
        result.stderr || result.stdout
      );
    }
  }

  const effectiveLogo = logoUrl ?? photos[0];
  if (effectiveLogo) {
    await sshExecCommand(
      projectId,
      serviceId,
      `curl -sL --max-time 30 --create-dirs -o "/workspace/public/assets/logo.png" "${effectiveLogo}"`
    );
  }

  const effectiveBanner = bannerUrl ?? photos[1] ?? photos[0];
  if (effectiveBanner) {
    await sshExecCommand(
      projectId,
      serviceId,
      `curl -sL --max-time 30 --create-dirs -o "/workspace/public/assets/banner.jpg" "${effectiveBanner}"`
    );
  }

  return downloadedPaths;
}
