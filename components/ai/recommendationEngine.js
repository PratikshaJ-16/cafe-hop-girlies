// components/ai/recommendationEngine.js
//
// Orchestrates the pipeline:
//   Candidate Retrieval → Trait Enrichment → Hard Filtering → Scoring → Ranking
//
// Candidate retrieval is NOT done here — the caller passes in the cafes array
// that MapScreen already fetched from Google Places nearbysearch. This avoids
// duplicating Google Maps logic and extra API calls.

import { scoreCafe, distanceKm, priceLevelToRupees } from './scoringEngine';
import { computePurposeScores, computeBadges } from './purposeScores';

// Keyword vocabulary used to infer traits from cafe names/vicinity and (if
// provided) any attached review text. Kept intentionally small and readable.
const TRAIT_KEYWORDS = {
  wifi:      ['wifi', 'wi-fi', 'internet'],
  charging:  ['charging', 'outlet', 'plug', 'power'],
  outdoor:   ['rooftop', 'terrace', 'outdoor', 'garden', 'alfresco', 'open air', 'patio'],
  indoor:    ['indoor', 'air conditioned', 'ac '],
  quiet:     ['quiet', 'peaceful', 'calm', 'silent', 'study'],
  lively:    ['lively', 'buzzing', 'vibrant', 'loud', 'party'],
  romantic:  ['romantic', 'candle', 'intimate', 'date'],
  cozy:      ['cozy', 'cosy', 'warm', 'comfy', 'snug'],
  aesthetic: ['aesthetic', 'instagram', 'pretty', 'cute', 'insta'],
  coffee:    ['coffee', 'espresso', 'latte', 'cappuccino', 'brew', 'roaster'],
  dessert:   ['dessert', 'cake', 'pastry', 'bakery', 'sweet', 'patisserie'],
};

function inferTraits(cafe) {
  const hay = [
    cafe.name || '',
    cafe.vicinity || '',
    ...(cafe.types || []),
    ...((cafe._reviewTexts || []).slice(0, 20)),
  ]
    .join(' ')
    .toLowerCase();

  const traits = {};
  for (const [trait, words] of Object.entries(TRAIT_KEYWORDS)) {
    traits[trait] = words.some((w) => hay.includes(w));
  }
  // Weak defaults so scoring isn't overly punishing on sparse Places data:
  if (!traits.coffee && (cafe.types || []).includes('cafe')) traits.coffee = true;
  if (!traits.indoor && traits.outdoor === false) traits.indoor = true;
  return traits;
}

/** Hard filters — a cafe that fails one is dropped entirely. */
function passesHardConstraints(cafe, prefs, userLoc) {
  // Distance
  if (prefs.distance != null) {
    const d = distanceKm(userLoc, {
      latitude: cafe.geometry?.location?.lat,
      longitude: cafe.geometry?.location?.lng,
    });
    if (d != null && d > prefs.distance * 1.25) return false; // 25% slack
  }
  // Budget — only reject cafes clearly above budget (2× tolerance)
  if (prefs.budget != null) {
    const est = priceLevelToRupees(cafe.price_level);
    if (est != null && est > prefs.budget * 2) return false;
  }
  // Explicit outdoor requirement
  if (prefs.outdoor === true && cafe._traits && cafe._traits.outdoor === false) {
    return false;
  }
  return true;
}

/**
 * Run the recommendation pipeline.
 *
 * @param {object[]} cafes    Cafes from MapScreen's nearbysearch (Google Places).
 * @param {object}   prefs    Output of parsePreferences().
 * @param {object}   userLoc  { latitude, longitude } — current user location.
 * @param {object}   [opts]   { topN = 5, weights }
 * @returns {object[]}        Ranked recommendations with score + breakdown.
 */
export function recommendCafes(cafes, prefs, userLoc, opts = {}) {
  const { topN = 5, weights } = opts;
  if (!Array.isArray(cafes) || cafes.length === 0) return [];

  // 1. Enrich with inferred traits (idempotent — reuses cached _traits).
  const enriched = cafes.map((c) => (c._traits ? c : { ...c, _traits: inferTraits(c) }));

  // 2. Hard-filter.
  const filtered = enriched.filter((c) => passesHardConstraints(c, prefs, userLoc));
  const pool = filtered.length > 0 ? filtered : enriched; // fallback if all filtered out

  // 3. Score.
  const scored = pool.map((cafe) => {
    const { total, breakdown, matchPercent } = scoreCafe(cafe, prefs, userLoc, weights);
    const purposeScores = computePurposeScores(cafe);
    const badges = computeBadges(cafe, purposeScores);
    return {
      cafe,
      score: total,
      breakdown,
      matchPercent,
      purposeScores,
      badges,
      distanceKm: distanceKm(userLoc, {
        latitude: cafe.geometry?.location?.lat,
        longitude: cafe.geometry?.location?.lng,
      }),
      estimatedPrice: priceLevelToRupees(cafe.price_level),
    };
  });

  // 4. Rank + top-N.
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}
