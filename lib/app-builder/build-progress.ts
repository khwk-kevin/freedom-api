/**
 * In-memory build progress tracker.
 * Stores build steps for each merchantId so the frontend can poll.
 * Progress expires after 30 minutes.
 */

export interface BuildStep {
  event: string;
  step: string;
  message: string;
  devUrl?: string;
  appSpec?: unknown;
  projectId?: string;
  completeness?: number;
  error?: string;
  details?: string;
  timestamp: number;
}

export interface BuildProgress {
  merchantId: string;
  steps: BuildStep[];
  isComplete: boolean;
  isError: boolean;
  startedAt: number;
  completedAt?: number;
}

const builds = new Map<string, BuildProgress>();

// Cleanup old builds every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, build] of builds) {
    if (now - build.startedAt > 30 * 60 * 1000) {
      builds.delete(key);
    }
  }
}, 10 * 60 * 1000);

export function startBuild(merchantId: string): void {
  builds.set(merchantId, {
    merchantId,
    steps: [],
    isComplete: false,
    isError: false,
    startedAt: Date.now(),
  });
}

export function addStep(merchantId: string, step: Omit<BuildStep, 'timestamp'>): void {
  const build = builds.get(merchantId);
  if (!build) return;

  const fullStep: BuildStep = { ...step, timestamp: Date.now() };
  build.steps.push(fullStep);

  if (step.event === 'complete' || step.step === 'done') {
    build.isComplete = true;
    build.completedAt = Date.now();
  }
  if (step.event === 'error' || step.step === 'error' || step.step === 'pipeline_error') {
    build.isError = true;
    build.isComplete = true;
    build.completedAt = Date.now();
  }
}

export function getProgress(merchantId: string, afterIndex = 0): {
  steps: BuildStep[];
  isComplete: boolean;
  isError: boolean;
  totalSteps: number;
} | null {
  const build = builds.get(merchantId);
  if (!build) return null;

  return {
    steps: build.steps.slice(afterIndex),
    isComplete: build.isComplete,
    isError: build.isError,
    totalSteps: build.steps.length,
  };
}
