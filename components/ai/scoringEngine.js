// components/ai/scoringEngine.js
//
// Deterministic scoring for cafe recommendations.
// Each sub-score is normalized to [0, 1]; the total is a weighted sum,
// also normalized to [0, 1], then rendered as a match percentage.
//
// Weights are configurable per purpose and per call.

export const DEFAULT_WEIGHTS = {
  purposeFit: 0.25,
  budget:     0.15,
  distance:   0.15,
  amenities:  0.15,
  rating:     0.20,
  ambience:   0.10,
};

// Purpose-tuned weight overrides. Missing keys fall back to DEFAULT_WEIGHTS.
export const PURPOSE_WEIGHTS = {
  study:   { purposeFit: 0.30, amenities: 0.25, rating: 0.10, ambience: 0.05, budget: 0.15, distance: 0.15 },
  work:    { purposeFit: 0.30, amenities: 0.25, rating: 0.10, ambience: 0.05, budget: 0.15, distance: 0.15 },
  date:    { purposeFit: 0.15, ambience: 0.30, rating: 0.25, amenities: 0.05, budget: 0.10, distance: 0.15 },
  solo:    { purposeFit: 0.20, amenities: 0.15, rating: 0.20, ambience: 0.15, budget: 0.15, distance: 0.15 },
  friends: { purposeFit: 0.20, rating: 0.25, ambience: 0.15, amenities: 0.10, budget: 0.15, distance: 0.15 },
  coffee:  { purposeFit: 0.15, rating: 0.35, amenities: 0.05, ambience: 0.10, budget: 0.15, distance: 0.20 },
  dessert: { purposeFit: 0.15, rating: 0.35, amenities: 0.05, ambience: 0.10, budget: 0.15, distance: 0.20 },
};

// ---------- helpers ----------

// Haversine distance in km.
export function distanceKm(a, b) {
  if (!a || !b) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Google Places price_level → approx ₹ per person (India-facing).
export function priceLevelToRupees(level) {
  if (level == null) return null;
  return [150, 300, 600, 1200, 2500][level] ?? null;
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// ---------- sub-scores (each in [0, 1]) ----------

function scoreBudget(cafe, prefs) {
  if (prefs.budget == null) return 0.5; // neutral when unspecified
  const est = priceLevelToRupees(cafe.price_level);
  if (est == null) return 0.5;
  if (est <= prefs.budget) return 1;
  // Soft decay past budget: 20% over -> 0.4, 50% over -> 0
  const over = (est - prefs.budget) / prefs.budget;
  return clamp01(1 - over * 2);
}

function scoreDistance(cafe, prefs, userLoc) {
  const d = distanceKm(userLoc, {
    latitude: cafe.geometry?.location?.lat,
    longitude: cafe.geometry?.location?.lng,
  });
  if (d == null) return 0.5;
  const max = prefs.distance ?? 5;
  if (d <= max * 0.2) return 1;              // very close
  if (d >= max) return 0.1;                  // near the edge
  return clamp01(1 - (d - max * 0.2) / (max * 0.8));
}

function scoreRating(cafe) {
  const r = cafe.rating;
  const n = cafe.user_ratings_total || 0;
  if (r == null) return 0.4;
  // Confidence: 200+ reviews = full confidence.
  const confidence = clamp01(n / 200);
  const raw = clamp01((r - 3) / 2); // 3.0 → 0, 5.0 → 1
  return 0.4 + 0.6 * raw * confidence + 0.0;
}

function scoreAmenities(cafe, prefs) {
  const t = cafe._traits || {};
  const wants = [];
  if (prefs.wifi)     wants.push(!!t.wifi);
  if (prefs.charging) wants.push(!!t.charging);
  if (prefs.outdoor === true)  wants.push(!!t.outdoor);
  if (prefs.outdoor === false) wants.push(!t.outdoor || !!t.indoor);
  if (wants.length === 0) return 0.6;
  const hits = wants.filter(Boolean).length;
  return clamp01(hits / wants.length);
}

function scoreAmbience(cafe, prefs) {
  const t = cafe._traits || {};
  if (!prefs.ambience && !prefs.noise) return 0.5;
  let s = 0.5;
  if (prefs.noise === 'low' && t.quiet) s += 0.3;
  if (prefs.noise === 'high' && t.lively) s += 0.3;
  if (prefs.ambience && t[prefs.ambience]) s += 0.3;
  return clamp01(s);
}

function scorePurposeFit(cafe, prefs) {
  const t = cafe._traits || {};
  const p = prefs.purpose;
  if (!p) return 0.5;
  const fits = {
    study:   (t.wifi ? 0.4 : 0) + (t.charging ? 0.3 : 0) + (t.quiet ? 0.3 : 0),
    work:    (t.wifi ? 0.4 : 0) + (t.charging ? 0.3 : 0) + (t.quiet ? 0.2 : 0) + (t.indoor ? 0.1 : 0),
    date:    (t.romantic ? 0.4 : 0) + (t.outdoor ? 0.2 : 0) + (t.aesthetic ? 0.2 : 0) + (t.quiet ? 0.2 : 0),
    solo:    (t.quiet ? 0.4 : 0) + (t.cozy ? 0.3 : 0) + (t.wifi ? 0.3 : 0),
    friends: (t.lively ? 0.4 : 0) + (t.outdoor ? 0.2 : 0) + (t.aesthetic ? 0.2 : 0) + 0.2,
    coffee:  0.5 + (t.coffee ? 0.5 : 0),
    dessert: 0.4 + (t.dessert ? 0.6 : 0),
  };
  return clamp01(fits[p] ?? 0.5);
}

// ---------- public API ----------

/**
 * Score a single cafe against parsed preferences.
 * Returns { total, breakdown, matchPercent } — total in [0, 1].
 */
export function scoreCafe(cafe, prefs, userLoc, weightsOverride) {
  const weights = {
    ...DEFAULT_WEIGHTS,
    ...(PURPOSE_WEIGHTS[prefs.purpose] || {}),
    ...(weightsOverride || {}),
  };

  const breakdown = {
    purposeFit: scorePurposeFit(cafe, prefs),
    budget:     scoreBudget(cafe, prefs),
    distance:   scoreDistance(cafe, prefs, userLoc),
    amenities:  scoreAmenities(cafe, prefs),
    rating:     scoreRating(cafe),
    ambience:   scoreAmbience(cafe, prefs),
  };

  let total = 0;
  let wsum = 0;
  for (const k of Object.keys(breakdown)) {
    const w = weights[k] ?? 0;
    total += breakdown[k] * w;
    wsum  += w;
  }
  total = wsum > 0 ? total / wsum : 0;

  return {
    total,
    breakdown,
    matchPercent: Math.round(total * 100),
  };
}
