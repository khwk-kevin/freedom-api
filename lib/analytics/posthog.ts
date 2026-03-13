/**
 * Freedom World — Server-side Analytics Stub
 *
 * Replaces the browser-only posthog-js with a server-side console logger.
 * Drop in a PostHog Node.js client here when telemetry is needed.
 */

// ── track ────────────────────────────────────────────────────────────────────

export function track(event: string, properties?: Record<string, unknown>): void {
  // In production, swap this for posthog-node or similar.
  console.log(`[analytics] ${event}`, properties ?? {});
}

// ── identify ─────────────────────────────────────────────────────────────────

export function identify(userId: string, traits?: Record<string, unknown>): void {
  console.log('[analytics] identify', userId, traits ?? {});
}
