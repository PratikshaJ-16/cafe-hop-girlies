// group/preferenceAggregator.js
//
// deterministic merge of many members' preferences into ONE
// preferences object shaped exactly like parsePreferences() output, so the
// existing recommendation engine can consume it unchanged.
//
// Rules (explicitly NOT averaging):
//   budget    → median (the group can't overspend the middle)
//   distance  → median, capped by the strictest member's hard max
//   purpose   → mode (most common); ties broken alphabetically for determinism
//   amenities → union of required amenities (wifi / charging)
//   noise     → majority
//   outdoor   → majority (ties → undefined = no preference)
//   ambience  → mode
//   groupSize → member count (or max declared)

export function median(nums) {
  const xs = nums.filter((n) => typeof n === 'number' && !Number.isNaN(n)).sort((a, b) => a - b);
  if (xs.length === 0) return undefined;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2);
}

export function mode(values) {
  const counts = new Map();
  for (const v of values) {
    if (v == null || v === '') continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  if (counts.size === 0) return undefined;
  let best;
  let bestN = -1;
  for (const [v, n] of [...counts.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

export function majorityBool(values) {
  const defined = values.filter((v) => typeof v === 'boolean');
  if (defined.length === 0) return undefined;
  const yes = defined.filter(Boolean).length;
  const no = defined.length - yes;
  if (yes === no) return undefined;
  return yes > no;
}

/**
 * @param {object} preferencesMap  { [userId]: memberPreferences }
 * @returns {{ groupPrefs: object, memberPrefs: object, conflicts: string[] }}
 */
export function aggregatePreferences(preferencesMap) {
  const entries = Object.entries(preferencesMap || {});
  const memberPrefs = Object.fromEntries(entries);
  const list = entries.map(([, p]) => p || {});
  const conflicts = [];

  if (list.length === 0) {
    return { groupPrefs: { distance: 5 }, memberPrefs, conflicts };
  }

  const budget = median(list.map((p) => p.budget));
  const distances = list.map((p) => p.distance).filter((d) => typeof d === 'number');
  const medDist = median(distances);
  const strictestDist = distances.length ? Math.min(...distances) : undefined;
  // Never ask anyone to travel further than their declared maximum.
  const distance = medDist != null ? Math.min(medDist, strictestDist ?? medDist) : 5;

  const purposes = list.map((p) => p.purpose).filter(Boolean);
  const purpose = mode(purposes);
  if (new Set(purposes).size > 1) conflicts.push('purpose');

  // Union of required amenities: if ANY member requires it, the group requires it.
  const wifi = list.some((p) => p.wifi === true) ? true : undefined;
  const charging = list.some((p) => p.charging === true) ? true : undefined;

  const noise = mode(list.map((p) => p.noise));
  if (new Set(list.map((p) => p.noise).filter(Boolean)).size > 1) conflicts.push('noise');

  const outdoor = majorityBool(list.map((p) => p.outdoor));
  if (list.some((p) => p.outdoor === true) && list.some((p) => p.outdoor === false)) {
    conflicts.push('seating');
  }

  const ambience = mode(list.map((p) => p.ambience));

  const coffee = list.some((p) => p.coffee === true) ? true : undefined;
  const food = list.some((p) => p.food === true) ? true : undefined;

  const declaredSize = Math.max(0, ...list.map((p) => p.groupSize || 0));
  const groupSize = Math.max(list.length, declaredSize);

  if (budget != null) {
    const budgets = list.map((p) => p.budget).filter((b) => typeof b === 'number');
    if (budgets.length > 1 && Math.max(...budgets) > Math.min(...budgets) * 2) {
      conflicts.push('budget');
    }
  }

  return {
    groupPrefs: {
      raw: 'group session',
      purpose,
      ambience,
      noise,
      wifi,
      charging,
      outdoor,
      coffee,
      food,
      budget,
      groupSize,
      distance,
    },
    memberPrefs,
    conflicts,
  };
}
