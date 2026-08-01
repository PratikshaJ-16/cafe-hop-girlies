// group/votingEngine.js
//
// deterministic vote tallying. Pure functions; Firestore writes live
// in sessionManager. votes shape: { [userId]: { [placeId]: 1 | -1 | 0 } }

export function tallyVotes(votes, recommendations) {
  const byPlace = new Map();
  for (const rec of recommendations || []) {
    byPlace.set(rec.placeId, {
      placeId: rec.placeId,
      name: rec.name,
      overallMatch: rec.overallMatch ?? 0,
      up: 0,
      down: 0,
      score: 0,
      voters: [],
    });
  }

  for (const [userId, perPlace] of Object.entries(votes || {})) {
    for (const [placeId, value] of Object.entries(perPlace || {})) {
      const row = byPlace.get(placeId);
      if (!row || !value) continue;
      if (value > 0) row.up += 1;
      else if (value < 0) row.down += 1;
      row.voters.push({ userId, value });
    }
  }

  for (const row of byPlace.values()) row.score = row.up - row.down;
  return [...byPlace.values()];
}

/** Winner = highest (up − down); ties broken by overall group match, then name. */
export function computeWinner(votes, recommendations) {
  const tallies = tallyVotes(votes, recommendations);
  if (tallies.length === 0) return null;
  const sorted = [...tallies].sort(
    (a, b) =>
      b.score - a.score ||
      b.up - a.up ||
      b.overallMatch - a.overallMatch ||
      String(a.name).localeCompare(String(b.name)),
  );
  const top = sorted[0];
  const tied = sorted.filter(
    (t) => t.score === top.score && t.up === top.up && t.overallMatch === top.overallMatch,
  );
  return { ...top, isTie: tied.length > 1, tallies: sorted };
}

/** How many members have cast at least one vote. */
export function votingProgress(votes, members) {
  const total = (members || []).length;
  const voted = Object.entries(votes || {}).filter(([, v]) =>
    Object.values(v || {}).some((x) => x !== 0),
  ).length;
  return { voted, total, complete: total > 0 && voted >= total };
}

export function memberVote(votes, userId, placeId) {
  return votes?.[userId]?.[placeId] ?? 0;
}
