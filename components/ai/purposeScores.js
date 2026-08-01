// components/ai/purposeScores.js
//
// Phase 2 — Smart Recommendations.
//
// Extends (does NOT replace) the Phase 1 scoring engine with:
//   1. Multi-dimension purpose scores (Study / Work / Date / Solo / Friends / Family)
//   2. AI badge generation
//
// All values are deterministic — derived purely from Google Places attributes
// and the traits already inferred by recommendationEngine.js. No LLM.

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const pct = (x) => Math.round(clamp01(x) * 100);

// Rating sub-score: mirrors scoringEngine.scoreRating so purpose scores stay
// consistent with the overall match %. Kept local to avoid cross-imports.
function ratingSignal(cafe) {
  const r = cafe.rating;
  const n = cafe.user_ratings_total || 0;
  if (r == null) return 0.4;
  const confidence = clamp01(n / 200);
  const raw = clamp01((r - 3) / 2);
  return 0.4 + 0.6 * raw * confidence;
}

// Cheap price signal: 1 → cheap, 0 → pricey. Neutral when unknown.
function priceSignal(cafe) {
  const p = cafe.price_level;
  if (p == null) return 0.5;
  return clamp01(1 - p / 4);
}

// Per-purpose formulas. Each returns a value in [0, 1].
// Weights sum to ~1 within each purpose; rating is folded in as a quality floor.
const PURPOSE_FORMULAS = {
  study: (t, cafe) =>
    0.30 * (t.wifi ? 1 : 0) +
    0.25 * (t.charging ? 1 : 0) +
    0.20 * (t.quiet ? 1 : 0) +
    0.10 * (t.indoor ? 1 : 0) +
    0.15 * ratingSignal(cafe),

  work: (t, cafe) =>
    0.30 * (t.wifi ? 1 : 0) +
    0.25 * (t.charging ? 1 : 0) +
    0.15 * (t.quiet ? 1 : 0) +
    0.10 * (t.indoor ? 1 : 0) +
    0.05 * (t.coffee ? 1 : 0) +
    0.15 * ratingSignal(cafe),

  date: (t, cafe) =>
    0.25 * (t.romantic ? 1 : 0) +
    0.20 * (t.aesthetic ? 1 : 0) +
    0.15 * (t.outdoor ? 1 : 0) +
    0.10 * (t.quiet ? 1 : 0) +
    0.05 * (t.cozy ? 1 : 0) +
    0.25 * ratingSignal(cafe),

  solo: (t, cafe) =>
    0.25 * (t.quiet ? 1 : 0) +
    0.20 * (t.cozy ? 1 : 0) +
    0.15 * (t.wifi ? 1 : 0) +
    0.10 * (t.coffee ? 1 : 0) +
    0.10 * (t.aesthetic ? 1 : 0) +
    0.20 * ratingSignal(cafe),

  friends: (t, cafe) =>
    0.25 * (t.lively ? 1 : 0) +
    0.20 * (t.aesthetic ? 1 : 0) +
    0.15 * (t.outdoor ? 1 : 0) +
    0.10 * (t.dessert ? 1 : 0) +
    0.10 * priceSignal(cafe) +
    0.20 * ratingSignal(cafe),

  family: (t, cafe) =>
    0.25 * (t.indoor ? 1 : 0) +
    0.15 * (t.outdoor ? 1 : 0) +
    0.15 * (t.dessert ? 1 : 0) +
    0.10 * (t.cozy ? 1 : 0) +
    0.10 * priceSignal(cafe) +
    0.25 * ratingSignal(cafe),
};

/**
 * Compute all six purpose scores (0–100) for a cafe.
 * Cached on the cafe object under `_purposeScores` to avoid recomputation.
 */
export function computePurposeScores(cafe) {
  if (cafe._purposeScores) return cafe._purposeScores;
  const t = cafe._traits || {};
  const out = {};
  for (const [purpose, fn] of Object.entries(PURPOSE_FORMULAS)) {
    out[purpose] = pct(fn(t, cafe));
  }
  cafe._purposeScores = out;
  return out;
}

/**
 * Compute AI badges from available cafe data.
 * Only emits a badge when the underlying signal is actually present.
 */
export function computeBadges(cafe, purposeScores) {
  if (cafe._badges) return cafe._badges;
  const t = cafe._traits || {};
  const s = purposeScores || computePurposeScores(cafe);
  const badges = [];

  if (s.study   >= 75) badges.push('Student Favorite');
  if (s.work    >= 75) badges.push('Great for Remote Work');
  if (t.quiet)         badges.push('Quiet');
  if (t.outdoor)       badges.push('Outdoor Seating');
  if (t.coffee && (cafe.rating || 0) >= 4.3) badges.push('Coffee Lover');
  if (t.dessert)       badges.push('Dessert Spot');
  if (cafe.price_level != null && cafe.price_level <= 1) badges.push('Budget Friendly');
  if (t.charging)      badges.push('Charging Available');
  if (t.wifi)          badges.push('Wi-Fi');
  if (cafe.opening_hours?.open_now) badges.push('Open Now');

  // "Late Night" — only when Places gives us periods we can inspect.
  const periods = cafe.opening_hours?.periods;
  if (Array.isArray(periods) && periods.some((p) => {
    const t = p?.close?.time;
    if (!t) return false;
    const hh = parseInt(t.slice(0, 2), 10);
    return hh >= 22 || hh <= 3;
  })) {
    badges.push('Late Night');
  }

  if ((cafe.user_ratings_total || 0) >= 500 && (cafe.rating || 0) >= 4.2) {
    badges.push('Popular');
  }

  cafe._badges = badges;
  return badges;
}
