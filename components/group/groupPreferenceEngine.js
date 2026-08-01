// group/groupPreferenceEngine.js
//
// compromise recommendations.
//
// This module does NOT duplicate scoring logic. It:
//   1. aggregates member preferences  (preferenceAggregator)
//   2. calls the EXISTING recommendation engine once with the group prefs
//   3. re-scores the resulting cafes per member with the EXISTING scoreCafe
//   4. combines member scores into an overall group match that rewards
//      satisfying everyone rather than delighting one person
//
// Fully deterministic and explainable.

import { recommendCafes } from '../ai/recommendationEngine';
import { scoreCafe } from '../ai/scoringEngine';
import { generateExplanation } from '../ai/aiExplanation';
import { aggregatePreferences } from './preferenceAggregator';

/**
 * Group match = 70% mean + 30% minimum member score.
 * The min term penalizes a cafe that leaves one friend out.
 */
export function groupMatch(memberScores) {
  const xs = memberScores.filter((n) => typeof n === 'number');
  if (xs.length === 0) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const min = Math.min(...xs);
  return Math.round(0.7 * mean + 0.3 * min);
}

function photoRefOf(cafe) {
  return cafe?.photos?.[0]?.photo_reference || null;
}

/**
 * @param {object[]} cafes         Cafes already fetched from Google Places.
 * @param {object}   preferencesMap { [userId]: memberPreferences }
 * @param {object[]} members       [{ userId, displayName }]
 * @param {object}   userLoc       { latitude, longitude }
 * @param {object}   [opts]        { topN = 5 }
 */
export function recommendForGroup(cafes, preferencesMap, members, userLoc, opts = {}) {
  const { topN = 5 } = opts;
  const { groupPrefs, memberPrefs, conflicts } = aggregatePreferences(preferencesMap);

  // Ask the existing engine for a slightly wider pool, then re-rank by group fit.
  const base = recommendCafes(cafes, groupPrefs, userLoc, { topN: Math.max(topN * 3, 10) });
  if (base.length === 0) {
    return { groupPrefs, conflicts, recommendations: [] };
  }

  const nameOf = (userId) =>
    members?.find((m) => m.userId === userId)?.displayName || 'Friend';

  const withGroup = base.map((rec) => {
    const memberMatches = Object.entries(memberPrefs).map(([userId, prefs]) => ({
      userId,
      displayName: nameOf(userId),
      matchPercent: scoreCafe(rec.cafe, prefs || {}, userLoc).matchPercent,
    }));

    const overallMatch = memberMatches.length
      ? groupMatch(memberMatches.map((m) => m.matchPercent))
      : rec.matchPercent;

    const lowest = memberMatches.length
      ? memberMatches.reduce((a, b) => (b.matchPercent < a.matchPercent ? b : a))
      : null;

    return {
      ...rec,
      placeId: rec.cafe.place_id,
      name: rec.cafe.name,
      photoRef: photoRefOf(rec.cafe),
      memberMatches,
      overallMatch,
      weakestMember: lowest,
      explanation: generateExplanation(rec, groupPrefs),
    };
  });

  withGroup.sort((a, b) => b.overallMatch - a.overallMatch || b.score - a.score);
  return { groupPrefs, conflicts, recommendations: withGroup.slice(0, topN) };
}
