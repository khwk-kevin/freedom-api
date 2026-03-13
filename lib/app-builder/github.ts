/**
 * Freedom World App Builder — GitHub Integration
 * Sprint 1.3 — GitHub Template Cloning
 *
 * Creates per-merchant GitHub repos from the app template.
 * Each merchant gets an isolated repo: fw-app-{merchantId}
 *
 * Uses GitHub REST API directly (no octokit dependency).
 * Auth: GITHUB_TOKEN env var with Authorization: Bearer header.
 */

// ============================================================
// CONFIGURATION
// ============================================================

const GITHUB_API_URL = 'https://api.github.com';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? '';
const GITHUB_ORG = process.env.GITHUB_ORG ?? 'freedom-world';
const GITHUB_TEMPLATE_REPO = process.env.GITHUB_TEMPLATE_REPO ?? 'freedom-world/app-template';

// ============================================================
// TYPES
// ============================================================

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  private: boolean;
}

interface GitHubError {
  message: string;
  errors?: Array<{ message: string; resource: string; field: string; code: string }>;
  documentation_url?: string;
}

// ============================================================
// CORE: GitHub REST API helper
// ============================================================

async function githubRequest<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<{ data: T; status: number }> {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN environment variable is not set');
  }

  const response = await fetch(`${GITHUB_API_URL}${path}`, {
    method,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  // Parse response body (may be empty for 204 No Content)
  let data: T | null = null;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    data = (await response.json()) as T;
  }

  if (!response.ok) {
    const errBody = data as unknown as GitHubError;
    const errMessage = errBody?.message ?? `GitHub API error ${response.status}`;
    const extraErrors = errBody?.errors?.map((e) => e.message).join('; ') ?? '';
    throw new Error(
      `GitHub API error ${response.status}: ${errMessage}${extraErrors ? ` — ${extraErrors}` : ''}`
    );
  }

  return { data: data as T, status: response.status };
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Returns the repo name for a merchant: fw-app-{merchantId}
 */
function repoName(merchantId: string): string {
  return `fw-app-${merchantId}`;
}

/**
 * Parses GITHUB_TEMPLATE_REPO into { owner, repo }.
 * e.g. 'freedom-world/app-template' → { owner: 'freedom-world', repo: 'app-template' }
 */
function parseTemplateRepo(): { owner: string; repo: string } {
  const parts = GITHUB_TEMPLATE_REPO.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid GITHUB_TEMPLATE_REPO format: "${GITHUB_TEMPLATE_REPO}". Expected "owner/repo".`
    );
  }
  return { owner: parts[0], repo: parts[1] };
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Creates a new GitHub repo from the template for a merchant.
 *
 * Uses GitHub's "Generate a repository from a template" API:
 * POST /repos/{template_owner}/{template_repo}/generate
 *
 * The new repo is created under GITHUB_ORG with name fw-app-{merchantId}.
 *
 * @param merchantId  Unique merchant identifier
 * @param category    Business category (e.g. 'restaurant-food') — stored as repo description
 * @returns { repoUrl, cloneUrl }
 */
export async function createMerchantRepo(
  merchantId: string,
  category: string
): Promise<{ repoUrl: string; cloneUrl: string }> {
  const { owner: templateOwner, repo: templateRepo } = parseTemplateRepo();
  const name = repoName(merchantId);

  console.log(
    `[github] Creating repo ${GITHUB_ORG}/${name} from template ${templateOwner}/${templateRepo}`
  );

  const { data: repo } = await githubRequest<GitHubRepo>(
    'POST',
    `/repos/${templateOwner}/${templateRepo}/generate`,
    {
      owner: GITHUB_ORG,
      name,
      description: `Freedom World app — merchant: ${merchantId} (${category})`,
      private: true,
      include_all_branches: false, // Only default branch from template
    }
  );

  console.log(`[github] Created repo: ${repo.html_url}`);

  return {
    repoUrl: repo.html_url,
    cloneUrl: repo.clone_url,
  };
}

/**
 * Checks whether a merchant's repo already exists.
 *
 * @param merchantId  Unique merchant identifier
 * @returns true if the repo exists, false otherwise
 */
export async function repoExists(merchantId: string): Promise<boolean> {
  const name = repoName(merchantId);

  try {
    await githubRequest('GET', `/repos/${GITHUB_ORG}/${name}`);
    return true;
  } catch (err: unknown) {
    const error = err as Error;
    // 404 = repo doesn't exist
    if (error.message.includes('404')) {
      return false;
    }
    // Re-throw any other error (auth failure, rate limit, etc.)
    throw err;
  }
}

/**
 * Deletes a merchant's GitHub repo.
 * Used for cleanup / testing.
 *
 * @param merchantId  Unique merchant identifier
 */
export async function deleteRepo(merchantId: string): Promise<void> {
  const name = repoName(merchantId);

  console.log(`[github] Deleting repo ${GITHUB_ORG}/${name}`);

  await githubRequest('DELETE', `/repos/${GITHUB_ORG}/${name}`);

  console.log(`[github] Deleted repo ${GITHUB_ORG}/${name}`);
}
