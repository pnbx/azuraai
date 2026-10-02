/**
 * Model tier policy for Azura.
 *
 * Free (cheap) models are the economical ones — mini/flash/haiku/gemma class.
 * Everything else (flagship/reasoning/image models) is Premium and requires
 * an upgraded account. Unknown slugs default to Premium so expensive
 * inference is never given away by accident.
 *
 * Also defines the free monthly message limit for session (dashboard) chat.
 */

export const FREE_MONTHLY_MESSAGES = 15;

const CHEAP_PATTERNS = [
  /mini/i,
  /flash/i,
  /haiku/i,
  /gemma/i,
  /nano/i,
  /lite/i,
  /small/i,
  /embed/i,
];

/** Is this model slug on the cheap (free-tier allowed) list? */
export function isCheapModel(slug: string): boolean {
  return CHEAP_PATTERNS.some((p) => p.test(slug));
}

/** Label shown in the UI for premium models. */
export const PREMIUM_LABEL = "پریمیوم";
