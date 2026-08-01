// components/ai/aiExplanation.js
//
// Generates a short, human-friendly explanation for why a cafe was
// recommended. Deterministic and grounded — composes sentences from the
// SAME attributes the scoring engine used, so we never invent facts.
//
// You can swap `generateExplanation` for an LLM call later; the pipeline
// hands you the exact structured breakdown you'd need for a good prompt.

const AMENITY_PHRASES = {
  wifi:     'reliable Wi-Fi',
  charging: 'charging outlets',
  outdoor:  'outdoor seating',
  indoor:   'comfortable indoor seating',
  quiet:    'a quiet atmosphere',
  lively:   'a lively vibe',
  romantic: 'a romantic setting',
  cozy:     'a cozy feel',
  aesthetic:'an aesthetic space',
  coffee:   'strong coffee',
  dessert:  'great desserts',
};

const PURPOSE_LEAD = {
  study:   'Great for studying',
  work:    'A solid remote-work pick',
  date:    'Nice choice for a date',
  solo:    'Comfortable for a solo visit',
  friends: 'Fun spot to meet friends',
  coffee:  'A go-to for coffee',
  dessert: 'A treat for dessert lovers',
};

function joinNatural(list) {
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

/**
 * Build an explanation from the recommendation record + parsed preferences.
 * Only mentions attributes actually present on the cafe / matched to prefs.
 *
 * @param {object} rec   One entry from recommendCafes(): { cafe, breakdown, matchPercent, distanceKm, estimatedPrice }
 * @param {object} prefs Output of parsePreferences()
 * @returns {string}
 */
export function generateExplanation(rec, prefs) {
  const { cafe, breakdown, distanceKm: d, estimatedPrice } = rec;
  const traits = cafe._traits || {};
  const parts = [];

  // Lead — anchor to the user's purpose if we caught one.
  if (prefs.purpose && PURPOSE_LEAD[prefs.purpose]) {
    parts.push(PURPOSE_LEAD[prefs.purpose] + '.');
  }

  // Amenity matches — only what the user asked for AND the cafe has.
  const matched = [];
  if (prefs.wifi && traits.wifi)         matched.push(AMENITY_PHRASES.wifi);
  if (prefs.charging && traits.charging) matched.push(AMENITY_PHRASES.charging);
  if (prefs.outdoor === true && traits.outdoor)  matched.push(AMENITY_PHRASES.outdoor);
  if (prefs.outdoor === false && traits.indoor)  matched.push(AMENITY_PHRASES.indoor);
  if (prefs.noise === 'low' && traits.quiet)     matched.push(AMENITY_PHRASES.quiet);
  if (prefs.noise === 'high' && traits.lively)   matched.push(AMENITY_PHRASES.lively);
  if (prefs.ambience && traits[prefs.ambience])  matched.push(AMENITY_PHRASES[prefs.ambience]);
  if (prefs.coffee && traits.coffee)             matched.push(AMENITY_PHRASES.coffee);
  if (prefs.food && traits.dessert)              matched.push(AMENITY_PHRASES.dessert);

  if (matched.length > 0) {
    parts.push(`Offers ${joinNatural(matched)}.`);
  }

  // Budget — only if the user set one and Google gave us a price_level.
  if (prefs.budget != null && estimatedPrice != null) {
    if (estimatedPrice <= prefs.budget) {
      parts.push(`Fits your ~₹${prefs.budget} budget (est. ₹${estimatedPrice} pp).`);
    } else if (estimatedPrice <= prefs.budget * 1.3) {
      parts.push(`Slightly over budget (est. ₹${estimatedPrice} pp).`);
    }
  }

  // Distance.
  if (d != null) {
    if (d < 0.8) parts.push(`Just ${Math.round(d * 1000)} m away.`);
    else parts.push(`About ${d.toFixed(1)} km away.`);
  }

  // Rating — only when strong and well-reviewed.
  if (cafe.rating != null && (cafe.user_ratings_total || 0) >= 30) {
    if (cafe.rating >= 4.5) parts.push(`Highly rated (${cafe.rating}★).`);
    else if (cafe.rating >= 4.2) parts.push(`Well rated (${cafe.rating}★).`);
  }

  // Fallback so we never return an empty string.
  if (parts.length === 0) {
    parts.push('A nearby option worth trying.');
  }

  return parts.join(' ');
}

/** Convenience — decorate an array of recommendations in place with `.explanation`. */
export function attachExplanations(recs, prefs) {
  return recs.map((r) => ({ ...r, explanation: generateExplanation(r, prefs) }));
}
