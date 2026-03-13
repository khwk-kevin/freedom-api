/**
 * Freedom World App Builder — Error Handler
 * Sprint 7.3 — Error Handling + Graceful Failures
 *
 * Utilities for sanitizing errors, deciding retry strategy, and formatting
 * user-facing messages per build trigger type.
 */

import type { BuildTrigger } from './types';

// ============================================================
// SANITIZE ERROR FOR USER
// ============================================================

/**
 * Strips raw internal error details (file paths, stack traces, Node internals)
 * and returns a safe, friendly string suitable for displaying to end-users.
 *
 * Rules:
 * - Remove absolute file paths (e.g. /workspace/src/..., /home/user/...)
 * - Remove stack trace lines (at ..., Error: ...)
 * - Remove ANSI escape codes
 * - Remove hex addresses and memory dump fragments
 * - Collapse multiple blank lines
 * - If nothing meaningful remains, return a generic fallback
 */
export function sanitizeErrorForUser(error: string): string {
  if (!error) return 'An unexpected error occurred. Please try again.';

  let cleaned = error
    // Strip ANSI escape codes
    .replace(/\x1B\[[0-9;]*[mGKHF]/g, '')
    // Strip absolute file paths (Unix-style)
    .replace(/\/[a-zA-Z0-9_\-.\/]+\.(ts|tsx|js|jsx|json|mjs|cjs):[0-9]+:[0-9]+/g, '')
    .replace(/\/[a-zA-Z0-9_\-.\/]+\.(ts|tsx|js|jsx|json|mjs|cjs)/g, '')
    // Strip Windows file paths
    .replace(/[A-Za-z]:\\[^\s]*/g, '')
    // Strip stack trace lines (at X.Y (file:line) or at async X)
    .replace(/^\s+at\s+.+$/gm, '')
    // Strip "Error:" prefix lines from stack dumps
    .replace(/^Error:\s*/gm, '')
    // Strip Node.js internal paths like (node:internal/...)
    .replace(/\(node:[^)]+\)/g, '')
    // Strip hex memory addresses
    .replace(/0x[0-9a-fA-F]+/g, '')
    // Strip generic internal module references
    .replace(/\bnode_modules\/[^\s,)]+/g, '')
    // Collapse excess whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // If too short or empty after stripping, use generic fallback
  if (!cleaned || cleaned.length < 10) {
    return 'Something went wrong on our end. Please try again.';
  }

  // Truncate very long messages
  if (cleaned.length > 300) {
    cleaned = cleaned.slice(0, 300) + '…';
  }

  return cleaned;
}

// ============================================================
// SHOULD RETRY
// ============================================================

/**
 * Returns true if the error is transient and a retry is likely to succeed.
 * Returns false for permanent/semantic errors where retrying the same task
 * won't help (e.g. a syntax error that already failed once).
 *
 * Transient: timeout, connection reset, OOM, SSH disconnect, rate limit
 * Permanent: TypeScript errors, syntax errors, module not found (after 1 retry)
 */
export function shouldRetry(error: string): boolean {
  if (!error) return false;

  const lower = error.toLowerCase();

  // Transient patterns — network, memory, process issues
  const transientPatterns = [
    'timeout',
    'timed out',
    'connection reset',
    'connection refused',
    'econnreset',
    'econnrefused',
    'enotfound',
    'oom',
    'out of memory',
    'killed',
    'sigkill',
    'sigterm',
    'ssh',
    'socket hang up',
    'network error',
    'rate limit',
    'too many requests',
    '503',
    'service unavailable',
    'temporarily unavailable',
    'epipe',
    'broken pipe',
  ];

  // Permanent patterns — code/type errors that won't self-heal
  const permanentPatterns = [
    'syntax error',
    'unexpected token',
    'cannot find module',
    'type error',
    'typeerror',
    'is not a function',
    'is not defined',
    'does not exist',
    'property does not exist',
    'argument of type',
    'expected',
    'unterminated',
    'parse error',
  ];

  // If it looks permanent, don't retry
  for (const pattern of permanentPatterns) {
    if (lower.includes(pattern)) return false;
  }

  // If it looks transient, retry
  for (const pattern of transientPatterns) {
    if (lower.includes(pattern)) return true;
  }

  // Default: retry once on unknown errors (the retry prompt asks Claude to fix)
  return true;
}

// ============================================================
// FORMAT BUILD ERROR (user-facing, per trigger)
// ============================================================

/**
 * Returns a user-friendly message for a build failure, tailored to the
 * trigger type so the message feels contextually relevant.
 *
 * These messages are shown in the chat — they should be conversational
 * and reassuring, not technical.
 */
export function formatBuildError(trigger: BuildTrigger, _error: string): string {
  switch (trigger) {
    case 'scrape_complete':
      return "I had some trouble setting up your initial app — let me try a different approach. Your info is saved.";

    case 'idea_described':
      return "I had trouble sketching out the initial layout. Let me give it another shot.";

    case 'mood_selected':
      return "I had a little trouble updating the visual style — I'll retry in a moment.";

    case 'color_changed':
      return "There was a small issue applying the color change. It'll be reflected shortly.";

    case 'products_added':
      return "I had trouble updating the products section — let me try again.";

    case 'priorities_set':
      return "There was an issue rebuilding the navigation. I'm on it.";

    case 'anti_prefs_set':
      return "I had some trouble applying your preferences — give me a moment to fix it.";

    case 'audience_defined':
      return "I had trouble adjusting the copy for your audience. Let me retry.";

    case 'features_selected':
      return "There was an issue noting your selected features. I'll get that sorted.";

    case 'ad_hoc_request':
      return "I had trouble making that change — let me try again with a fresh approach.";

    default:
      return "Something didn't go as planned. I'm retrying automatically.";
  }
}
