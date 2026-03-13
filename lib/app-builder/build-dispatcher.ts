/**
 * Freedom World App Builder — Build Dispatcher
 * Adapted: @/ imports replaced with relative paths; analytics uses local stub.
 */

import { randomUUID } from 'crypto';
import { BuildTrigger, BuildResult, MerchantAppSpec } from './types';
import { generateVaultFiles } from './vault-writer';
import { sshWriteFile, sshExecCommand } from './railway';
import { recordBuildTask, estimateBuildCostUsd } from './cost-tracker';
import { track } from '../analytics/posthog';
import { EVENTS } from '../analytics/events';
import {
  isTokenBudgetExhausted,
  deductTokens,
  estimateTaskTokens,
} from './token-budget';
import { sanitizeErrorForUser, shouldRetry, formatBuildError } from './error-handler';

// ============================================================
// TASK TEMPLATES
// ============================================================

const TASK_TEMPLATES: Record<BuildTrigger, string> = {
  scrape_complete:
    'Read CLAUDE.md. You have new context in context/ and photos in public/assets/. Build the homepage with Hero, product highlights, and contact section.',
  idea_described:
    'Read CLAUDE.md. The user described their app idea in context/business.md. Build a conceptual homepage that captures their vision.',
  mood_selected:
    'Mood and theme updated in design/theme.json and context/brand.md. Re-read them. Update all component variants and visual styles to match the new mood.',
  color_changed:
    'Primary color changed in design/theme.json. Update the CSS theme variables and ensure all pages reflect the new color scheme.',
  products_added:
    'Products/services added to context/business.md. Build a products/services section using ProductCard components.',
  priorities_set:
    'App priorities set in context/business.md. Build the priority pages and update navigation.',
  anti_prefs_set:
    'Anti-preferences updated in context/brand.md. Review all existing pages and remove/adjust anything that conflicts.',
  audience_defined:
    'Target audience defined in context/audience.md. Adjust copy, tone, and messaging across all pages.',
  features_selected:
    'Freedom features selected. Note them in context/business.md for future integration.',
  ad_hoc_request:
    "The merchant requests: '{adHocMsg}'. Read all context files first, then make the requested change.",
};

// ============================================================
// QUEUE STATE
// ============================================================

interface QueuedTask {
  taskId: string;
  merchantId: string;
  trigger: BuildTrigger;
  spec: MerchantAppSpec;
  adHocMsg?: string;
  resolve: (result: BuildResult) => void;
  reject: (err: unknown) => void;
}

interface MerchantQueueState {
  isBuilding: boolean;
  queue: QueuedTask[];
  currentTaskId?: string;
  cancelled: boolean;
  lastTaskResult?: BuildResult;
}

const merchantQueues = new Map<string, MerchantQueueState>();

function getOrCreateQueue(merchantId: string): MerchantQueueState {
  if (!merchantQueues.has(merchantId)) {
    merchantQueues.set(merchantId, {
      isBuilding: false,
      queue: [],
      cancelled: false,
    });
  }
  return merchantQueues.get(merchantId)!;
}

// ============================================================
// CORE DISPATCH
// ============================================================

export async function dispatchBuildTask(
  merchantId: string,
  trigger: BuildTrigger,
  spec: MerchantAppSpec,
  adHocMsg?: string
): Promise<BuildResult> {
  const startTime = Date.now();

  const projectId = spec.railwayProjectId;
  const serviceId = spec.railwayServiceId;

  const exhausted = await isTokenBudgetExhausted(merchantId);
  if (exhausted) {
    return {
      success: false,
      exitCode: -1,
      stdout: '',
      stderr: 'Token budget exhausted',
      durationMs: 0,
      error: 'token_limit',
    };
  }

  if (!projectId || !serviceId) {
    return {
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: '',
      durationMs: Date.now() - startTime,
      error: `merchantId=${merchantId}: railwayProjectId and railwayServiceId must be set on the spec`,
    };
  }

  let vaultFiles: ReturnType<typeof generateVaultFiles>;
  try {
    vaultFiles = generateVaultFiles(spec);
  } catch (err) {
    return {
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: '',
      durationMs: Date.now() - startTime,
      error: `generateVaultFiles failed: ${String(err)}`,
    };
  }

  for (const file of vaultFiles) {
    try {
      await sshWriteFile(projectId, serviceId, `/workspace/${file.path}`, file.content);
    } catch (err) {
      return {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: '',
        durationMs: Date.now() - startTime,
        error: `sshWriteFile failed for ${file.path}: ${String(err)}`,
      };
    }
  }

  let promptTemplate = TASK_TEMPLATES[trigger];
  if (trigger === 'ad_hoc_request') {
    promptTemplate = promptTemplate.replace('{adHocMsg}', adHocMsg ?? '');
  }

  const runClaudeCode = async (prompt: string): Promise<BuildResult> => {
    const escapedPrompt = prompt.replace(/"/g, '\\"');
    const cmd = `claude -p "${escapedPrompt}" --dangerously-skip-permissions --max-turns 100 --cwd /workspace`;

    let sshResult: Awaited<ReturnType<typeof sshExecCommand>>;
    try {
      sshResult = await sshExecCommand(projectId!, serviceId!, cmd);
    } catch (err) {
      return {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: String(err),
        durationMs: Date.now() - startTime,
        error: `sshExecCommand threw: ${String(err)}`,
      };
    }

    return {
      success: sshResult.exitCode === 0,
      exitCode: sshResult.exitCode,
      stdout: sshResult.stdout,
      stderr: sshResult.stderr,
      durationMs: Date.now() - startTime,
      error: sshResult.exitCode !== 0 ? (sshResult.stderr || 'Build task failed') : undefined,
    };
  };

  let buildResult = await runClaudeCode(promptTemplate);

  if (!buildResult.success) {
    const rawStderr = buildResult.stderr ?? buildResult.error ?? '';
    console.warn(
      `[build-dispatcher] Task failed for merchant ${merchantId} (trigger: ${trigger}). ` +
      `Exit code: ${buildResult.exitCode}. Attempting retry.`
    );

    if (shouldRetry(rawStderr)) {
      const retryPrompt =
        `The previous build had an error: ${sanitizeErrorForUser(rawStderr)}. ` +
        `Please fix the issue and try again. ${promptTemplate}`;

      buildResult = await runClaudeCode(retryPrompt);
    }

    if (!buildResult.success) {
      console.error(
        `[build-dispatcher] Retry also failed for merchant ${merchantId} (trigger: ${trigger}).`
      );

      track(EVENTS.APP_BUILD_FAILED, {
        merchantId,
        trigger,
        exitCode: buildResult.exitCode,
        error: sanitizeErrorForUser(buildResult.stderr ?? buildResult.error ?? ''),
        durationMs: Date.now() - startTime,
      });

      return {
        ...buildResult,
        durationMs: Date.now() - startTime,
        error: formatBuildError(trigger, buildResult.stderr ?? ''),
        stderr: sanitizeErrorForUser(buildResult.stderr ?? ''),
      };
    }
  }

  if (buildResult.success) {
    const tokenCost = estimateTaskTokens(trigger);
    try {
      const { remaining, isExhausted } = await deductTokens(merchantId, tokenCost);
      if (isExhausted) {
        track(EVENTS.TOKEN_LIMIT_REACHED, {
          merchantId,
          tokenBalance: remaining,
          tokenUsed: spec.tokenUsed + tokenCost,
          trigger,
        });
      }
    } catch (err) {
      console.error(`[token-budget] deductTokens failed for ${merchantId}:`, err);
    }
  }

  return { ...buildResult, durationMs: Date.now() - startTime };
}

// ============================================================
// QUEUE PROCESSOR
// ============================================================

async function processNext(merchantId: string): Promise<void> {
  const state = merchantQueues.get(merchantId);
  if (!state || state.isBuilding || state.queue.length === 0) return;

  const task = state.queue.shift()!;
  state.isBuilding = true;
  state.currentTaskId = task.taskId;

  try {
    if (state.cancelled) {
      task.resolve({
        success: false,
        exitCode: 0,
        stdout: '',
        stderr: '',
        durationMs: 0,
        error: 'Queue was cancelled before task ran',
      });
      return;
    }

    const result = await dispatchBuildTask(
      task.merchantId,
      task.trigger,
      task.spec,
      task.adHocMsg
    );

    const estimatedCostUsd = estimateBuildCostUsd(result.durationMs);

    void recordBuildTask(
      task.merchantId,
      task.trigger,
      result.durationMs,
      result.success,
      result.error
    );

    track(EVENTS.APP_BUILD_COMPLETED, {
      trigger: task.trigger,
      durationMs: result.durationMs,
      estimatedCostUsd,
      success: result.success,
    });

    state.lastTaskResult = result;
    task.resolve(result);
  } catch (err) {
    console.error(`[build-dispatcher] Unexpected exception for task ${task.taskId}:`, err);

    const errResult: BuildResult = {
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: '',
      durationMs: 0,
      error: formatBuildError(task.trigger, String(err)),
    };

    void recordBuildTask(
      task.merchantId,
      task.trigger,
      errResult.durationMs,
      false,
      errResult.error
    );

    track(EVENTS.APP_BUILD_FAILED, {
      trigger: task.trigger,
      durationMs: errResult.durationMs,
      estimatedCostUsd: 0,
      success: false,
      error: sanitizeErrorForUser(String(err)),
    });

    state.lastTaskResult = errResult;
    task.resolve(errResult);
  } finally {
    state.isBuilding = false;
    state.currentTaskId = undefined;
    void processNext(merchantId);
  }
}

// ============================================================
// PUBLIC API
// ============================================================

export async function enqueueBuildTask(
  merchantId: string,
  trigger: BuildTrigger,
  spec: MerchantAppSpec,
  adHocMsg?: string
): Promise<void> {
  const state = getOrCreateQueue(merchantId);
  state.cancelled = false;

  await new Promise<BuildResult>((resolve, reject) => {
    const task: QueuedTask = {
      taskId: randomUUID(),
      merchantId,
      trigger,
      spec,
      adHocMsg,
      resolve,
      reject,
    };
    state.queue.push(task);
    void processNext(merchantId);
  });
}

export function cancelMerchantQueue(merchantId: string): void {
  const state = merchantQueues.get(merchantId);
  if (!state) return;

  state.cancelled = true;

  while (state.queue.length > 0) {
    const task = state.queue.shift()!;
    task.resolve({
      success: false,
      exitCode: 0,
      stdout: '',
      stderr: '',
      durationMs: 0,
      error: 'Task cancelled by cancelMerchantQueue',
    });
  }
}

export function getQueueStatus(merchantId: string): {
  isBuilding: boolean;
  queueDepth: number;
  currentTask?: string;
  lastTaskResult?: BuildResult;
} {
  const state = merchantQueues.get(merchantId);
  if (!state) {
    return { isBuilding: false, queueDepth: 0 };
  }

  return {
    isBuilding: state.isBuilding,
    queueDepth: state.queue.length,
    currentTask: state.currentTaskId,
    lastTaskResult: state.lastTaskResult,
  };
}
