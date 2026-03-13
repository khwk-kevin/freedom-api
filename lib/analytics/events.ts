/**
 * Freedom World — PostHog Event Name Constants
 */

export const EVENTS = {
  ONBOARDING_STARTED: 'onboarding_started',
  Q1_ANSWERED: 'q1_answered',
  Q2_SCRAPE_SUCCESS: 'q2_scrape_success',
  Q2_SCRAPE_SKIP: 'q2_scrape_skip',
  Q2_SCRAPE_FAILED: 'q2_scrape_failed',
  Q3_MOOD_SELECTED: 'q3_mood_selected',
  Q4_COLOR_SELECTED: 'q4_color_selected',
  FIRST_PREVIEW_SHOWN: 'first_preview_shown',
  SIGNUP_WALL_SHOWN: 'signup_wall_shown',
  SIGNUP_COMPLETED: 'signup_completed',
  SIGNUP_ABANDONED: 'signup_abandoned',
  COMMUNITY_CREATED: 'community_created',
  APP_BUILD_STARTED: 'app_build_started',
  APP_BUILD_COMPLETED: 'app_build_completed',
  APP_BUILD_FAILED: 'app_build_failed',
  APP_DEPLOYED: 'app_deployed',
  DEPLOY_FAILED: 'deploy_failed',
  ITERATION_STARTED: 'iteration_started',
  ITERATION_COMPLETED: 'iteration_completed',
  TOKEN_LIMIT_REACHED: 'token_limit_reached',
  SESSION_ABANDONED: 'session_abandoned',
  AD_HOC_REQUEST: 'ad_hoc_request',
  FEATURES_SELECTED: 'features_selected',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
