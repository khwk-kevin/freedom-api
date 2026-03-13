/**
 * Freedom World App Builder — Railway API Client
 * Sprint 1.2 — Railway API Client
 *
 * Programmatic Railway project/service management via Railway's GraphQL API.
 * Endpoint: https://backboard.railway.com/graphql/v2
 *
 * SSH exec is the core primitive — all Claude Code build tasks go through it.
 */

import { execFile, exec as execCallback } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const execAsync = promisify(execCallback);

// ============================================================
// CONFIGURATION
// ============================================================

const RAILWAY_API_URL = 'https://backboard.railway.app/graphql/v2';
const RAILWAY_API_TOKEN = process.env.RAILWAY_API_TOKEN ?? process.env.RAILWAY_TEAM_TOKEN ?? '';
const RAILWAY_TEMPLATE_REPO = (process.env.RAILWAY_TEMPLATE_REPO ?? 'khwk-kevin/freedom-app-template').trim();
const RAILWAY_REGION = process.env.RAILWAY_REGION ?? 'ap-southeast-1';

// ============================================================
// TYPES — GraphQL response shapes
// ============================================================

interface RailwayProject {
  id: string;
  name: string;
  description?: string;
}

interface RailwayService {
  id: string;
  name: string;
  projectId: string;
}

interface RailwayServiceInstance {
  id: string;
  serviceId: string;
  environmentId: string;
  startCommand?: string;
  buildCommand?: string;
  healthcheckPath?: string;
}

interface RailwayDeployment {
  id: string;
  status: string;
  url?: string;
  staticUrl?: string;
}

interface RailwayDomain {
  id: string;
  domain: string;
  serviceId: string;
}

interface RailwayCustomDomain {
  id: string;
  domain: string;
  serviceId: string;
  status?: string;
}

interface GraphQLError {
  message: string;
  extensions?: Record<string, unknown>;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

interface ProjectCreateData {
  projectCreate: RailwayProject;
}

interface ServiceCreateData {
  serviceCreate: RailwayService;
}

interface EnvironmentListData {
  project: {
    environments: {
      edges: Array<{ node: { id: string; name: string } }>;
    };
  };
}

interface ServiceWithInstanceData {
  service: {
    id: string;
    name: string;
    serviceInstances: {
      edges: Array<{
        node: RailwayServiceInstance;
      }>;
    };
  };
}

interface ServiceDeploymentsData {
  service: {
    deployments: {
      edges: Array<{
        node: RailwayDeployment;
      }>;
    };
  };
}

interface ServiceDomainsData {
  service: {
    domains: {
      serviceDomains: RailwayDomain[];
      customDomains: RailwayCustomDomain[];
    };
  };
}

interface CustomDomainCreateData {
  customDomainCreate: RailwayCustomDomain;
}

interface ServiceInstanceUpdateData {
  serviceInstanceUpdate: boolean;
}

interface ProjectDeleteData {
  projectDelete: boolean;
}

interface ServiceInstanceRestartData {
  serviceInstanceRedeploy: {
    id: string;
  };
}

// ============================================================
// CORE: GraphQL request helper
// ============================================================

async function railwayGql<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const response = await fetch(RAILWAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RAILWAY_API_TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Railway API HTTP error ${response.status}: ${response.statusText} — ${body}`
    );
  }

  const json = (await response.json()) as GraphQLResponse<T>;

  if (json.errors && json.errors.length > 0) {
    const messages = json.errors.map((e) => e.message).join('; ');
    throw new Error(`Railway GraphQL error: ${messages}`);
  }

  if (!json.data) {
    throw new Error('Railway API returned no data');
  }

  return json.data;
}

// ============================================================
// HELPER: Get environment ID for a project (defaults to "production")
// ============================================================

async function getProductionEnvId(projectId: string): Promise<string> {
  const query = `
    query GetEnvironments($projectId: String!) {
      project(id: $projectId) {
        environments {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    }
  `;

  const data = await railwayGql<EnvironmentListData>(query, { projectId });
  const envs = data.project.environments.edges.map((e) => e.node);

  // Prefer "production", fallback to first env
  const prod = envs.find((e) => e.name === 'production') ?? envs[0];
  if (!prod) {
    throw new Error(`No environments found for project ${projectId}`);
  }

  return prod.id;
}

// ============================================================
// HELPER: Get service instance ID
// ============================================================

async function getServiceInstanceId(
  serviceId: string,
  environmentId: string
): Promise<string> {
  const query = `
    query GetServiceInstance($serviceId: String!) {
      service(id: $serviceId) {
        id
        name
        serviceInstances {
          edges {
            node {
              id
              serviceId
              environmentId
            }
          }
        }
      }
    }
  `;

  const data = await railwayGql<ServiceWithInstanceData>(query, { serviceId });
  const instances = data.service.serviceInstances.edges.map((e) => e.node);
  const instance = instances.find((i) => i.environmentId === environmentId);

  if (!instance) {
    throw new Error(
      `No service instance found for service ${serviceId} in environment ${environmentId}`
    );
  }

  return instance.id;
}

// ============================================================
// PUBLIC API FUNCTIONS
// ============================================================

/**
 * Creates a Railway project + service for a merchant.
 * Connects GitHub repo, sets env vars, starts with `npm run dev`.
 */
export async function createMerchantProject(
  merchantId: string
): Promise<{ projectId: string; serviceId: string }> {
  // Railway project names must be ≤ ~25 chars and globally unique
  const projectName = `fw-${merchantId.slice(0, 8)}`;

  // 1. Create project via Railway GraphQL API (uses RAILWAY_TEAM_TOKEN)
  const createProjectMutation = `
    mutation($input: ProjectCreateInput!) {
      projectCreate(input: $input) { id name }
    }
  `;
  const projectData = await railwayGql<ProjectCreateData>(createProjectMutation, {
    input: {
      name: projectName,
      defaultEnvironmentName: 'production',
    },
  });
  const projectId = projectData.projectCreate.id;

  // 2. Get environment ID
  const environmentId = await getProductionEnvId(projectId);

  // 3. Create service from GitHub repo
  const createServiceMutation = `
    mutation CreateService($projectId: String!, $name: String!, $source: ServiceSourceInput) {
      serviceCreate(
        input: {
          projectId: $projectId
          name: $name
          source: $source
        }
      ) {
        id
        name
        projectId
      }
    }
  `;

  const serviceData = await railwayGql<ServiceCreateData>(createServiceMutation, {
    projectId,
    name: 'builder',
    source: {
      repo: RAILWAY_TEMPLATE_REPO,
    },
  });

  const serviceId = serviceData.serviceCreate.id;

  // 4. Set initial environment variables + start command
  await setServiceEnvVars(serviceId, {
    MERCHANT_ID: merchantId,
    NODE_ENV: 'development',
    PORT: '3000',
  });

  // 5. Update service instance: set start command to npm run dev
  const updateMutation = `
    mutation UpdateServiceInstance(
      $serviceId: String!
      $environmentId: String!
      $input: ServiceInstanceUpdateInput!
    ) {
      serviceInstanceUpdate(
        serviceId: $serviceId
        environmentId: $environmentId
        input: $input
      )
    }
  `;

  await railwayGql<ServiceInstanceUpdateData>(updateMutation, {
    serviceId,
    environmentId,
    input: {
      startCommand: 'npm run dev',
      region: RAILWAY_REGION,
    },
  });

  return { projectId, serviceId };
}

/**
 * Sets/updates environment variables for a service.
 */
export async function setServiceEnvVars(
  serviceId: string,
  vars: Record<string, string>
): Promise<void> {
  // We need projectId and environmentId for this mutation
  const getServiceQuery = `
    query GetService($serviceId: String!) {
      service(id: $serviceId) {
        id
        projectId
        serviceInstances {
          edges {
            node {
              id
              environmentId
            }
          }
        }
      }
    }
  `;

  interface ServiceBasicData {
    service: {
      id: string;
      projectId: string;
      serviceInstances: {
        edges: Array<{ node: { id: string; environmentId: string } }>;
      };
    };
  }

  const serviceData = await railwayGql<ServiceBasicData>(getServiceQuery, {
    serviceId,
  });

  const projectId = serviceData.service.projectId;
  const instances = serviceData.service.serviceInstances.edges;

  if (instances.length === 0) {
    throw new Error(`No service instances found for service ${serviceId}`);
  }

  const environmentId = instances[0].node.environmentId;

  // Build variables array
  // EnvironmentVariables is a JSON scalar — pass as a plain object, not an array
  const upsertMutation = `
    mutation UpsertVariables($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }
  `;

  interface VariableUpsertData {
    variableCollectionUpsert: boolean;
  }

  await railwayGql<VariableUpsertData>(upsertMutation, {
    input: {
      projectId,
      serviceId,
      environmentId,
      variables: vars,
    },
  });
}

/**
 * Returns the public Railway dev URL for a service.
 */
export async function getServiceDevUrl(serviceId: string): Promise<string> {
  const query = `
    query GetServiceDomains($serviceId: String!) {
      service(id: $serviceId) {
        domains {
          serviceDomains {
            id
            domain
          }
          customDomains {
            id
            domain
          }
        }
      }
    }
  `;

  const data = await railwayGql<ServiceDomainsData>(query, { serviceId });
  const domains = data.service.domains;

  // Prefer custom domains, then Railway-generated domains
  const customDomain = domains.customDomains?.[0]?.domain;
  if (customDomain) {
    return `https://${customDomain}`;
  }

  const serviceDomain = domains.serviceDomains?.[0]?.domain;
  if (serviceDomain) {
    return `https://${serviceDomain}`;
  }

  throw new Error(`No domain found for service ${serviceId}`);
}

/**
 * Polls until the service is accessible (HTTP 200), or until timeout.
 * Returns true if ready, false if timed out.
 */
export async function waitForServiceReady(
  serviceId: string,
  timeoutMs: number
): Promise<boolean> {
  const startTime = Date.now();
  const pollIntervalMs = 3000;

  let devUrl: string;
  try {
    devUrl = await getServiceDevUrl(serviceId);
  } catch {
    // Domain may not exist yet; wait a bit and retry
    await sleep(pollIntervalMs);
    try {
      devUrl = await getServiceDevUrl(serviceId);
    } catch {
      return false;
    }
  }

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(devUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok || response.status < 500) {
        return true;
      }
    } catch {
      // Not ready yet — continue polling
    }

    await sleep(pollIntervalMs);
  }

  return false;
}

/**
 * Assigns `{slug}.app.freedom.world` as a custom domain for the service.
 * Returns the full domain URL.
 */
export async function assignCustomDomain(
  serviceId: string,
  slug: string
): Promise<string> {
  const domain = `${slug}.app.freedom.world`;

  // Get projectId and environmentId
  const getServiceQuery = `
    query GetService($serviceId: String!) {
      service(id: $serviceId) {
        id
        projectId
        serviceInstances {
          edges {
            node {
              id
              environmentId
            }
          }
        }
      }
    }
  `;

  interface ServiceBasicData {
    service: {
      id: string;
      projectId: string;
      serviceInstances: {
        edges: Array<{ node: { id: string; environmentId: string } }>;
      };
    };
  }

  const serviceData = await railwayGql<ServiceBasicData>(getServiceQuery, {
    serviceId,
  });

  const projectId = serviceData.service.projectId;
  const environmentId = serviceData.service.serviceInstances.edges[0]?.node.environmentId;

  if (!environmentId) {
    throw new Error(`No environment found for service ${serviceId}`);
  }

  const mutation = `
    mutation CreateCustomDomain($projectId: String!, $serviceId: String!, $environmentId: String!, $domain: String!) {
      customDomainCreate(
        input: {
          projectId: $projectId
          serviceId: $serviceId
          environmentId: $environmentId
          domain: $domain
        }
      ) {
        id
        domain
        serviceId
      }
    }
  `;

  await railwayGql<CustomDomainCreateData>(mutation, {
    projectId,
    serviceId,
    environmentId,
    domain,
  });

  return `https://${domain}`;
}

/**
 * Stops the builder service (sets start command to a no-op).
 */
export async function stopBuilderService(serviceId: string): Promise<void> {
  const getServiceQuery = `
    query GetService($serviceId: String!) {
      service(id: $serviceId) {
        id
        projectId
        serviceInstances {
          edges {
            node {
              id
              environmentId
            }
          }
        }
      }
    }
  `;

  interface ServiceBasicData {
    service: {
      id: string;
      projectId: string;
      serviceInstances: {
        edges: Array<{ node: { id: string; environmentId: string } }>;
      };
    };
  }

  const serviceData = await railwayGql<ServiceBasicData>(getServiceQuery, {
    serviceId,
  });

  const environmentId = serviceData.service.serviceInstances.edges[0]?.node.environmentId;
  if (!environmentId) {
    throw new Error(`No environment found for service ${serviceId}`);
  }

  // Use serviceInstanceUpdate to set a sleep command, effectively stopping the process
  const mutation = `
    mutation UpdateServiceInstance(
      $serviceId: String!
      $environmentId: String!
      $input: ServiceInstanceUpdateInput!
    ) {
      serviceInstanceUpdate(
        serviceId: $serviceId
        environmentId: $environmentId
        input: $input
      )
    }
  `;

  await railwayGql<ServiceInstanceUpdateData>(mutation, {
    serviceId,
    environmentId,
    input: {
      startCommand: 'sleep infinity',
    },
  });
}

/**
 * Restarts the builder service (resets start command to npm run dev).
 */
export async function restartBuilderService(serviceId: string): Promise<void> {
  const getServiceQuery = `
    query GetService($serviceId: String!) {
      service(id: $serviceId) {
        id
        projectId
        serviceInstances {
          edges {
            node {
              id
              environmentId
            }
          }
        }
      }
    }
  `;

  interface ServiceBasicData {
    service: {
      id: string;
      projectId: string;
      serviceInstances: {
        edges: Array<{ node: { id: string; environmentId: string } }>;
      };
    };
  }

  const serviceData = await railwayGql<ServiceBasicData>(getServiceQuery, {
    serviceId,
  });

  const projectId = serviceData.service.projectId;
  const environmentId = serviceData.service.serviceInstances.edges[0]?.node.environmentId;

  if (!environmentId) {
    throw new Error(`No environment found for service ${serviceId}`);
  }

  // Reset start command to dev server
  const updateMutation = `
    mutation UpdateServiceInstance(
      $serviceId: String!
      $environmentId: String!
      $input: ServiceInstanceUpdateInput!
    ) {
      serviceInstanceUpdate(
        serviceId: $serviceId
        environmentId: $environmentId
        input: $input
      )
    }
  `;

  await railwayGql<ServiceInstanceUpdateData>(updateMutation, {
    serviceId,
    environmentId,
    input: {
      startCommand: 'npm run dev',
    },
  });

  // Trigger a redeploy to apply the new start command
  const redeployMutation = `
    mutation ServiceInstanceRedeploy($serviceId: String!, $environmentId: String!) {
      serviceInstanceRedeploy(
        serviceId: $serviceId
        environmentId: $environmentId
      ) {
        id
      }
    }
  `;

  await railwayGql<ServiceInstanceRestartData>(redeployMutation, {
    serviceId,
    environmentId,
    projectId,
  });
}

/**
 * Updates the start command for a service in the production environment.
 * Used during deploy to switch from `npm run dev` to `npm run start`.
 */
export async function updateServiceStartCommand(
  serviceId: string,
  startCommand: string
): Promise<void> {
  const getServiceQuery = `
    query GetService($serviceId: String!) {
      service(id: $serviceId) {
        id
        projectId
        serviceInstances {
          edges {
            node {
              id
              environmentId
            }
          }
        }
      }
    }
  `;

  interface ServiceBasicData {
    service: {
      id: string;
      projectId: string;
      serviceInstances: {
        edges: Array<{ node: { id: string; environmentId: string } }>;
      };
    };
  }

  const serviceData = await railwayGql<ServiceBasicData>(getServiceQuery, {
    serviceId,
  });

  const environmentId = serviceData.service.serviceInstances.edges[0]?.node.environmentId;
  if (!environmentId) {
    throw new Error(`No environment found for service ${serviceId}`);
  }

  const mutation = `
    mutation UpdateServiceInstance(
      $serviceId: String!
      $environmentId: String!
      $input: ServiceInstanceUpdateInput!
    ) {
      serviceInstanceUpdate(
        serviceId: $serviceId
        environmentId: $environmentId
        input: $input
      )
    }
  `;

  await railwayGql<ServiceInstanceUpdateData>(mutation, {
    serviceId,
    environmentId,
    input: { startCommand },
  });
}

/**
 * Deletes a Railway project and all its services.
 */
export async function deleteProject(projectId: string): Promise<void> {
  const mutation = `
    mutation DeleteProject($projectId: String!) {
      projectDelete(id: $projectId)
    }
  `;

  await railwayGql<ProjectDeleteData>(mutation, { projectId });
}

// ============================================================
// SSH FUNCTIONS — Core primitive for Claude Code build tasks
// ============================================================

export interface SshResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Executes a command inside a Railway service container via SSH.
 * Uses `railway ssh` CLI. If Railway CLI is unavailable, falls back
 * to Railway's exec API endpoint.
 *
 * THIS IS THE CORE PRIMITIVE — all Claude Code build tasks go through this.
 */
export async function sshExecCommand(
  projectId: string,
  serviceId: string,
  cmd: string
): Promise<SshResult> {
  // First, check if railway CLI is available
  const railwayCli = await getRailwayCliPath();

  if (railwayCli) {
    return sshExecViaCli(railwayCli, projectId, serviceId, cmd);
  } else {
    // Fallback: Railway exec API
    return sshExecViaApi(projectId, serviceId, cmd);
  }
}

/**
 * Writes a file into a Railway service container via SSH.
 * Uses cat with heredoc syntax to write content.
 */
export async function sshWriteFile(
  projectId: string,
  serviceId: string,
  path: string,
  content: string
): Promise<void> {
  // Ensure parent directory exists
  const dir = path.substring(0, path.lastIndexOf('/'));
  if (dir) {
    await sshExecCommand(projectId, serviceId, `mkdir -p "${dir}"`);
  }

  // Write file content using base64 to avoid shell escaping issues
  const base64Content = Buffer.from(content, 'utf-8').toString('base64');
  const writeCmd = `echo '${base64Content}' | base64 -d > "${path}"`;

  const result = await sshExecCommand(projectId, serviceId, writeCmd);

  if (result.exitCode !== 0) {
    throw new Error(
      `sshWriteFile failed for ${path}: ${result.stderr || result.stdout}`
    );
  }
}

// ============================================================
// SSH IMPLEMENTATION — CLI path
// ============================================================

async function getRailwayCliPath(): Promise<string | null> {
  try {
    const { stdout } = await execAsync('which railway', { timeout: 5000 });
    const path = stdout.trim();
    return path.length > 0 ? path : null;
  } catch {
    return null;
  }
}

async function sshExecViaCli(
  railwayCli: string,
  projectId: string,
  serviceId: string,
  cmd: string
): Promise<SshResult> {
  // Sanitize cmd for shell safety — wrap in sh -c
  // Command format: railway ssh --project {id} --service {id} -- sh -c "cmd"
  const environmentId = process.env.RAILWAY_ENVIRONMENT_ID ?? '';
  const args = [
    'ssh',
    '--project', projectId,
    '--service', serviceId,
    ...(environmentId ? ['--environment', environmentId] : []),
    '--',
    'sh', '-c', cmd,
  ];

  try {
    const { stdout, stderr } = await execFileAsync(railwayCli, args, {
      timeout: 600_000, // 10 minutes for Claude Code tasks
      env: {
        ...process.env,
        RAILWAY_TOKEN: RAILWAY_API_TOKEN,
      },
      maxBuffer: 50 * 1024 * 1024, // 50MB output buffer
    });

    return {
      stdout: stdout ?? '',
      stderr: stderr ?? '',
      exitCode: 0,
    };
  } catch (err: unknown) {
    const error = err as {
      stdout?: string;
      stderr?: string;
      code?: number;
      signal?: string;
      killed?: boolean;
    };

    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? String(err),
      exitCode: error.code ?? 1,
    };
  }
}

// ============================================================
// SSH IMPLEMENTATION — API fallback (Railway WebSocket exec)
// ============================================================

async function sshExecViaApi(
  projectId: string,
  serviceId: string,
  cmd: string
): Promise<SshResult> {
  // Railway doesn't have a direct REST exec API, but we can use their
  // deployments API to get exec access via the "exec" endpoint.
  // Reference: https://docs.railway.com/reference/public-api
  //
  // As a pragmatic fallback, we use Railway's service logs to monitor
  // command execution. We inject a wrapper script that:
  // 1. Runs the command
  // 2. Writes exit code to a known temp file
  //
  // However, the most reliable approach without CLI is to use
  // Railway's WebSocket-based exec which requires a token exchange.
  // For now, we return an error so the caller knows to install the CLI.

  console.warn(
    '[Railway] CLI not found. Please install: npm install -g @railway/cli'
  );

  // Attempt via Railway's HTTP API for simple commands
  // This is a best-effort fallback using Railway's deployment exec
  try {
    const response = await fetch(
      `https://backboard.railway.app/project/${projectId}/environment/production/service/${serviceId}/exec`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RAILWAY_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command: ['sh', '-c', cmd] }),
        signal: AbortSignal.timeout(120_000),
      }
    );

    if (response.ok) {
      const result = await response.json() as { stdout?: string; stderr?: string; exitCode?: number };
      return {
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        exitCode: result.exitCode ?? 0,
      };
    }
  } catch {
    // Fallback failed
  }

  return {
    stdout: '',
    stderr:
      'Railway CLI not installed and API exec fallback unavailable. Install: npm install -g @railway/cli',
    exitCode: 127,
  };
}

// ============================================================
// UTILITY
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
