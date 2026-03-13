/**
 * Freedom World — Cloudflare DNS Client
 * Sprint 2A — Cloudflare DNS Record Management
 *
 * Manages CNAME records for merchant subdomains:
 * {slug}.app.freedom.world → cname.vercel-dns.com
 *
 * Uses Cloudflare REST API v4. Auth: Bearer token.
 * Env vars: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID
 */

// ============================================================
// CONFIGURATION
// ============================================================

const CF_API_URL = 'https://api.cloudflare.com/client/v4';
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN ?? '';
const CF_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID ?? '';

const VERCEL_CNAME_TARGET = 'cname.vercel-dns.com';
const MERCHANT_DOMAIN_SUFFIX = 'app.freedom.world';

// ============================================================
// TYPES
// ============================================================

interface CloudflareError {
  code: number;
  message: string;
}

interface CloudflareResponse<T> {
  success: boolean;
  errors: CloudflareError[];
  messages: string[];
  result: T;
}

interface CloudflareDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  created_on?: string;
  modified_on?: string;
}

// ============================================================
// CORE: Cloudflare REST API helper
// ============================================================

async function cfRequest<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  if (!CF_API_TOKEN) {
    throw new Error('CLOUDFLARE_API_TOKEN environment variable is not set');
  }
  if (!CF_ZONE_ID) {
    throw new Error('CLOUDFLARE_ZONE_ID environment variable is not set');
  }

  const response = await fetch(`${CF_API_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const json = (await response.json()) as CloudflareResponse<T>;

  if (!json.success) {
    const errorMessages = json.errors.map((e) => `[${e.code}] ${e.message}`).join('; ');
    throw new Error(
      `Cloudflare API error ${response.status}: ${errorMessages || response.statusText}`
    );
  }

  return json.result;
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Returns the full CNAME record name for a merchant slug.
 * e.g. "bkm-thai" → "bkm-thai.app.freedom.world"
 */
function merchantDomain(slug: string): string {
  return `${slug}.${MERCHANT_DOMAIN_SUFFIX}`;
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Creates a CNAME record: {slug}.app.freedom.world → cname.vercel-dns.com
 *
 * Idempotent: returns existing record if one already exists for the slug.
 *
 * @param slug  Merchant subdomain slug (e.g. "bkm-thai")
 * @returns { recordId, domain }
 */
export async function createMerchantDnsRecord(
  slug: string
): Promise<{ recordId: string; domain: string }> {
  const domain = merchantDomain(slug);

  // Check for existing record first (idempotency)
  const existing = await findDnsRecord(slug);
  if (existing) {
    console.log(`[cloudflare] DNS record already exists for ${domain} (id: ${existing.id})`);
    return { recordId: existing.id, domain };
  }

  console.log(`[cloudflare] Creating CNAME: ${domain} → ${VERCEL_CNAME_TARGET}`);

  const record = await cfRequest<CloudflareDnsRecord>(
    'POST',
    `/zones/${CF_ZONE_ID}/dns_records`,
    {
      type: 'CNAME',
      name: domain,
      content: VERCEL_CNAME_TARGET,
      proxied: false, // DNS-only (gray cloud) — Vercel handles SSL
      ttl: 1,         // Auto TTL
    }
  );

  console.log(`[cloudflare] Created DNS record ${record.id} for ${domain}`);

  return { recordId: record.id, domain };
}

/**
 * Deletes a CNAME record by its Cloudflare record ID.
 * Used for merchant removal / cleanup.
 *
 * @param recordId  Cloudflare DNS record ID
 */
export async function deleteDnsRecord(recordId: string): Promise<void> {
  console.log(`[cloudflare] Deleting DNS record ${recordId}`);

  await cfRequest<{ id: string }>(
    'DELETE',
    `/zones/${CF_ZONE_ID}/dns_records/${recordId}`
  );

  console.log(`[cloudflare] Deleted DNS record ${recordId}`);
}

/**
 * Lists all CNAME records matching *.app.freedom.world
 * Useful for admin and debugging.
 *
 * @returns Array of DNS record summaries
 */
export async function listMerchantDnsRecords(): Promise<
  Array<{ id: string; name: string; content: string; type: string }>
> {
  const records = await cfRequest<CloudflareDnsRecord[]>(
    'GET',
    `/zones/${CF_ZONE_ID}/dns_records?type=CNAME&name=contains:${MERCHANT_DOMAIN_SUFFIX}`
  );

  return records.map((r) => ({
    id: r.id,
    name: r.name,
    content: r.content,
    type: r.type,
  }));
}

/**
 * Checks whether a DNS record already exists for a merchant slug.
 *
 * @param slug  Merchant subdomain slug (e.g. "bkm-thai")
 * @returns true if a record exists, false otherwise
 */
export async function dnsRecordExists(slug: string): Promise<boolean> {
  const record = await findDnsRecord(slug);
  return record !== null;
}

// ============================================================
// INTERNAL
// ============================================================

/**
 * Finds an existing CNAME record for a slug, or returns null.
 */
async function findDnsRecord(slug: string): Promise<CloudflareDnsRecord | null> {
  const domain = merchantDomain(slug);

  const records = await cfRequest<CloudflareDnsRecord[]>(
    'GET',
    `/zones/${CF_ZONE_ID}/dns_records?type=CNAME&name=${encodeURIComponent(domain)}`
  );

  return records.length > 0 ? records[0] : null;
}
