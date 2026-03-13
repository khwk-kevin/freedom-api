/**
 * Freedom World — Vercel Project Management Client
 * Sprint 2A — Vercel REST API
 *
 * Programmatic project creation, domain assignment, deployment via direct file upload.
 * Used to deploy merchant app static frontends to Vercel.
 *
 * Env vars: VERCEL_TOKEN, VERCEL_TEAM_ID (optional), BUILD_CONTAINER_HOST, EXEC_SECRET
 */

// ============================================================
// CONFIGURATION
// ============================================================

const VERCEL_API_URL = 'https://api.vercel.com';
const VERCEL_TOKEN = process.env.VERCEL_TOKEN ?? '';
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID ?? '';

const BUILD_CONTAINER_HOST = process.env.BUILD_CONTAINER_HOST ?? '';
const EXEC_SECRET = process.env.EXEC_SECRET ?? '';

// ============================================================
// TYPES
// ============================================================

interface VercelError {
  code: string;
  message: string;
}

interface VercelErrorResponse {
  error: VercelError;
}

interface VercelProject {
  id: string;
  name: string;
  link?: {
    type: string;
    repo: string;
    repoId: number;
  };
}

interface VercelDomain {
  name: string;
  apexName: string;
  projectId: string;
  verified: boolean;
}

interface VercelDeployment {
  uid: string;
  state: string;
  url: string | null;
  readyState?: string;
  ready?: number;
  createdAt: number;
}

interface VercelDeploymentCreateResponse {
  id: string;
  url: string;
  readyState: string;
}

interface ExecResponse {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface VercelFile {
  file: string;
  data: string;
}

// ============================================================
// CORE: Vercel REST API helper
// ============================================================

async function vercelRequest<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  if (!VERCEL_TOKEN) {
    throw new Error('VERCEL_TOKEN environment variable is not set');
  }

  // Append teamId if set
  const separator = path.includes('?') ? '&' : '?';
  const teamParam = VERCEL_TEAM_ID ? `${separator}teamId=${VERCEL_TEAM_ID}` : '';
  const url = `${VERCEL_API_URL}${path}${teamParam}`;

  const response = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    let errMessage = `Vercel API error ${response.status}: ${response.statusText}`;
    try {
      const errBody = (await response.json()) as VercelErrorResponse;
      if (errBody.error?.message) {
        errMessage = `Vercel API error ${response.status}: [${errBody.error.code}] ${errBody.error.message}`;
      }
    } catch {
      // ignore parse error
    }
    throw new Error(errMessage);
  }

  // Some endpoints return 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

// ============================================================
// CORE: Build container exec helper
// ============================================================

async function execInBuildContainer(cmd: string): Promise<ExecResponse> {
  if (!BUILD_CONTAINER_HOST) {
    throw new Error('BUILD_CONTAINER_HOST environment variable is not set');
  }
  if (!EXEC_SECRET) {
    throw new Error('EXEC_SECRET environment variable is not set');
  }

  const response = await fetch(`${BUILD_CONTAINER_HOST}/exec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: EXEC_SECRET, cmd }),
  });

  if (!response.ok) {
    throw new Error(`Build container exec failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as ExecResponse;
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Creates a Vercel project (without GitHub linking).
 * Idempotent: if project already exists, returns existing project.
 *
 * @param slug                 Merchant slug (project name: fw-app-{slug})
 * @param githubRepoFullName   Optional — ignored (kept for API compatibility)
 */
export async function createVercelProject(
  slug: string,
  githubRepoFullName?: string
): Promise<{ projectId: string; projectUrl: string }> {
  const projectName = `fw-app-${slug}`;

  // Suppress unused warning — param kept for call-site compatibility
  void githubRepoFullName;

  // Check if project exists first
  try {
    const existing = await vercelRequest<VercelProject>('GET', `/v9/projects/${projectName}`);
    console.log(`[vercel] Project already exists: ${existing.name} (${existing.id})`);
    return { projectId: existing.id, projectUrl: `https://${projectName}.vercel.app` };
  } catch (err) {
    const error = err as Error;
    if (!error.message.includes('404')) {
      throw err; // Re-throw non-404 errors
    }
  }

  console.log(`[vercel] Creating project ${projectName}`);

  const project = await vercelRequest<VercelProject>('POST', '/v10/projects', {
    name: projectName,
    framework: 'nextjs',
  });

  console.log(`[vercel] Created project: ${project.id}`);

  return {
    projectId: project.id,
    projectUrl: `https://${projectName}.vercel.app`,
  };
}

/**
 * Reads all static build output files from the build container.
 * Files are located at /workspace/builds/{merchantId}/out/ (Next.js static export).
 *
 * @param merchantId  Merchant identifier (matches build directory name)
 * @returns Array of {file: relative_path, data: base64_content}
 */
export async function readBuildOutputFiles(merchantId: string): Promise<VercelFile[]> {
  const outDir = `/workspace/builds/${merchantId}/out`;

  console.log(`[vercel] Reading build output files from ${outDir}`);

  // List all files in out/
  const listResult = await execInBuildContainer(`find ${outDir} -type f`);
  if (listResult.exitCode !== 0) {
    throw new Error(`Failed to list build output files: ${listResult.stderr}`);
  }

  const absolutePaths = listResult.stdout
    .trim()
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean);

  if (absolutePaths.length === 0) {
    throw new Error(`No files found in build output directory: ${outDir}`);
  }

  console.log(`[vercel] Found ${absolutePaths.length} files to upload`);

  // Read each file as base64 (sequentially to avoid overwhelming the exec server)
  const files: VercelFile[] = [];

  for (const absolutePath of absolutePaths) {
    const readResult = await execInBuildContainer(`base64 < ${absolutePath}`);
    if (readResult.exitCode !== 0) {
      throw new Error(`Failed to read file ${absolutePath}: ${readResult.stderr}`);
    }

    // Compute relative path from the out/ directory
    const relativePath = absolutePath.replace(`${outDir}/`, '');

    files.push({
      file: relativePath,
      data: readResult.stdout.trim(),
    });
  }

  console.log(`[vercel] Read ${files.length} files for deployment`);

  return files;
}

/**
 * Deploys files directly to a Vercel project using the file upload API.
 *
 * @param projectId   Vercel project ID
 * @param projectName Vercel project name (used as deployment name)
 * @param files       Array of {file: relative_path, data: base64_content}
 * @returns deploymentUrl — the https URL of the live deployment
 */
export async function deployFilesToVercel(
  projectId: string,
  projectName: string,
  files: VercelFile[]
): Promise<{ deploymentUrl: string }> {
  console.log(`[vercel] Deploying ${files.length} files to project ${projectId}`);

  const deployment = await vercelRequest<VercelDeploymentCreateResponse>(
    'POST',
    '/v13/deployments',
    {
      name: projectName,
      files,
      projectId,
      target: 'production',
    }
  );

  const deploymentUrl = `https://${deployment.url}`;
  console.log(`[vercel] Deployment created: ${deploymentUrl} (state: ${deployment.readyState})`);

  return { deploymentUrl };
}

/**
 * Assigns a custom domain to a Vercel project.
 * Idempotent: skips if domain already assigned.
 *
 * @param projectId  Vercel project ID
 * @param domain     e.g. "bkm-thai.app.freedom.world"
 */
export async function assignVercelDomain(
  projectId: string,
  domain: string
): Promise<void> {
  console.log(`[vercel] Assigning domain ${domain} to project ${projectId}`);

  try {
    await vercelRequest<VercelDomain>('POST', `/v10/projects/${projectId}/domains`, {
      name: domain,
    });
    console.log(`[vercel] Domain ${domain} assigned`);
  } catch (err) {
    const error = err as Error;
    // Domain already exists on this project — not an error
    if (error.message.includes('DOMAIN_ALREADY_IN_USE') || error.message.includes('already')) {
      console.log(`[vercel] Domain ${domain} already assigned — skipping`);
      return;
    }
    throw err;
  }
}

/**
 * Gets the latest deployment status for a project.
 */
export async function getDeploymentStatus(
  projectId: string
): Promise<{ status: string; url: string | null; readyAt: string | null }> {
  interface DeploymentListResponse {
    deployments: VercelDeployment[];
  }

  const data = await vercelRequest<DeploymentListResponse>(
    'GET',
    `/v6/deployments?projectId=${projectId}&limit=1`
  );

  if (!data.deployments || data.deployments.length === 0) {
    return { status: 'no_deployments', url: null, readyAt: null };
  }

  const latest = data.deployments[0];

  return {
    status: latest.state || latest.readyState || 'unknown',
    url: latest.url ? `https://${latest.url}` : null,
    readyAt: latest.ready ? new Date(latest.ready).toISOString() : null,
  };
}

/**
 * Deletes a Vercel project. Used for cleanup.
 */
export async function deleteVercelProject(projectId: string): Promise<void> {
  console.log(`[vercel] Deleting project ${projectId}`);
  await vercelRequest<Record<string, never>>('DELETE', `/v9/projects/${projectId}`);
  console.log(`[vercel] Deleted project ${projectId}`);
}

/**
 * Waits for a Vercel deployment to be ready.
 * Polls every 5 seconds, up to maxWaitMs.
 *
 * @returns true if ready, false if timed out
 */
export async function waitForDeployment(
  projectId: string,
  maxWaitMs: number = 120_000
): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 5_000;

  while (Date.now() - startTime < maxWaitMs) {
    const status = await getDeploymentStatus(projectId);

    if (status.status === 'READY') {
      return true;
    }
    if (status.status === 'ERROR' || status.status === 'CANCELED') {
      return false;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return false;
}
