/**
 * Freedom World — Shared Build Container Service
 * Sprint 2B — Build Service Management
 *
 * Manages a single shared Railway container for running Claude Code builds.
 * Merchants don't get their own Railway service — builds happen here,
 * then the result is pushed to GitHub → Vercel auto-deploys.
 *
 * Env vars: BUILD_SERVICE_PROJECT_ID, BUILD_SERVICE_ID
 * Auth: Uses Anthropic OAuth tokens with automatic fallback rotation.
 *   ANTHROPIC_TOKEN_1..4 env vars (sk-ant-oat01-...) tried in order.
 *   Falls back to ANTHROPIC_API_KEY if no numbered tokens are set.
 */

import { sshExecCommand, sshWriteFile } from './app-builder/railway';

// ============================================================
// CONFIGURATION
// ============================================================

const BUILD_PROJECT_ID = process.env.BUILD_SERVICE_PROJECT_ID ?? '';
const BUILD_SERVICE_ID = process.env.BUILD_SERVICE_ID ?? '';

// ============================================================
// ANTHROPIC OAUTH TOKEN ROTATION
// ============================================================

/**
 * Load all available Anthropic tokens in priority order.
 * Env vars: ANTHROPIC_TOKEN_1, ANTHROPIC_TOKEN_2, ANTHROPIC_TOKEN_3, ANTHROPIC_TOKEN_4
 * Fallback: ANTHROPIC_API_KEY
 */
function getAnthropicTokens(): string[] {
  const tokens: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const t = process.env[`ANTHROPIC_TOKEN_${i}`];
    if (t) tokens.push(t);
  }
  // Fallback to single API key
  if (tokens.length === 0 && process.env.ANTHROPIC_API_KEY) {
    tokens.push(process.env.ANTHROPIC_API_KEY);
  }
  return tokens;
}

/** Track which token index to start with (round-robin) */
let nextTokenIndex = 0;

/**
 * Returns the next token to try, cycling through available tokens.
 * On rate limit/auth failure, call advanceToken() then retry.
 */
function getNextToken(): { token: string; index: number } {
  const tokens = getAnthropicTokens();
  if (tokens.length === 0) {
    throw new Error('No Anthropic tokens configured. Set ANTHROPIC_TOKEN_1..4 or ANTHROPIC_API_KEY.');
  }
  const index = nextTokenIndex % tokens.length;
  return { token: tokens[index], index };
}

function advanceToken(): void {
  nextTokenIndex++;
}

/** Check if an error suggests we should try a different token */
function isTokenRotatableError(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return (
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('429') ||
    lower.includes('overloaded') ||
    lower.includes('unauthorized') ||
    lower.includes('401') ||
    lower.includes('invalid_api_key') ||
    lower.includes('authentication') ||
    lower.includes('credit') ||
    lower.includes('quota')
  );
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Returns the shared build container IDs.
 * Throws if not configured.
 */
export function getBuildService(): { projectId: string; serviceId: string } {
  if (!BUILD_PROJECT_ID || !BUILD_SERVICE_ID) {
    throw new Error(
      'BUILD_SERVICE_PROJECT_ID and BUILD_SERVICE_ID environment variables must be set'
    );
  }
  return { projectId: BUILD_PROJECT_ID, serviceId: BUILD_SERVICE_ID };
}

/**
 * Clones a merchant's GitHub repo into the build container.
 * Sets up npm install so it's ready for Claude Code.
 *
 * @param githubCloneUrl  e.g. "https://github.com/khwk-kevin/fw-app-bkm-thai.git"
 * @param merchantId      Used as build directory name
 */
export async function prepareBuildEnvironment(
  githubCloneUrl: string,
  merchantId: string
): Promise<void> {
  const { projectId, serviceId } = getBuildService();
  const buildDir = `/workspace/builds/${merchantId}`;

  // Clean any previous build
  await sshExecCommand(projectId, serviceId, `rm -rf ${buildDir}`);

  // Clone repo
  const githubToken = process.env.GITHUB_TOKEN ?? '';
  const authedUrl = githubCloneUrl.replace(
    'https://github.com/',
    `https://${githubToken}@github.com/`
  );

  const cloneResult = await sshExecCommand(
    projectId,
    serviceId,
    `git clone ${authedUrl} ${buildDir}`
  );

  if (cloneResult.exitCode !== 0) {
    throw new Error(`Failed to clone repo: ${cloneResult.stderr}`);
  }

  // npm install
  const installResult = await sshExecCommand(
    projectId,
    serviceId,
    `cd ${buildDir} && npm install`
  );

  if (installResult.exitCode !== 0) {
    throw new Error(`npm install failed: ${installResult.stderr}`);
  }
}

/**
 * Writes a file into the merchant's build directory.
 */
export async function writeBuildFile(
  merchantId: string,
  filePath: string,
  content: string
): Promise<void> {
  const { projectId, serviceId } = getBuildService();
  const fullPath = `/workspace/builds/${merchantId}/${filePath}`;
  await sshWriteFile(projectId, serviceId, fullPath, content);
}

/**
 * Runs Claude Code inside the build container for a merchant.
 *
 * @param merchantId  Build directory name
 * @param prompt      Claude Code task prompt
 * @returns { success, stdout, stderr, exitCode }
 */
export async function runClaudeCodeBuild(
  merchantId: string,
  prompt: string
): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }> {
  const { projectId, serviceId } = getBuildService();
  const buildDir = `/workspace/builds/${merchantId}`;
  const tokens = getAnthropicTokens();
  const maxAttempts = Math.min(tokens.length, 4); // Try up to 4 different tokens

  const escapedPrompt = prompt.replace(/"/g, '\\"');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { token, index } = getNextToken();
    console.log(`[build-service] Claude Code build attempt ${attempt + 1}/${maxAttempts} (token #${index + 1})`);

    // Inject the OAuth token as env var prefix so Claude Code uses it
    const cmd = `ANTHROPIC_API_KEY=${token} claude -p "${escapedPrompt}" --dangerously-skip-permissions --max-turns 100 --cwd ${buildDir}`;

    const result = await sshExecCommand(projectId, serviceId, cmd);

    if (result.exitCode === 0) {
      return {
        success: true,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: 0,
      };
    }

    // Check if this is a token-related error worth rotating
    if (isTokenRotatableError(result.stderr) && attempt < maxAttempts - 1) {
      console.warn(
        `[build-service] Token #${index + 1} hit rate limit/auth error. Rotating to next token.`
      );
      advanceToken();
      continue;
    }

    // Non-token error (build logic failure) — don't rotate, return as-is
    return {
      success: false,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }

  // All tokens exhausted
  return {
    success: false,
    stdout: '',
    stderr: 'All Anthropic OAuth tokens exhausted (rate limited or auth failed)',
    exitCode: 1,
  };
}

/**
 * Runs `npm run build` (static export) in the merchant's build directory.
 * Returns success/failure + logs.
 */
export async function runStaticBuild(
  merchantId: string
): Promise<{ success: boolean; logs: string }> {
  const { projectId, serviceId } = getBuildService();
  const buildDir = `/workspace/builds/${merchantId}`;

  const result = await sshExecCommand(
    projectId,
    serviceId,
    `cd ${buildDir} && npm run build`
  );

  return {
    success: result.exitCode === 0,
    logs: result.stderr || result.stdout,
  };
}

/**
 * Git add, commit, and push from the build directory.
 */
export async function gitPushBuild(merchantId: string): Promise<void> {
  const { projectId, serviceId } = getBuildService();
  const buildDir = `/workspace/builds/${merchantId}`;

  await sshExecCommand(
    projectId,
    serviceId,
    `cd ${buildDir} && git add -A && git commit -m "build: production $(date)" && git push || true`
  );
}

/**
 * Cleans up the merchant's build directory.
 * Fire-and-forget — errors are logged but not thrown.
 */
export async function cleanupBuildEnvironment(merchantId: string): Promise<void> {
  try {
    const { projectId, serviceId } = getBuildService();
    await sshExecCommand(
      projectId,
      serviceId,
      `rm -rf /workspace/builds/${merchantId}`
    );
  } catch (err) {
    console.warn(`[build-service] Cleanup failed for ${merchantId}:`, err);
  }
}
