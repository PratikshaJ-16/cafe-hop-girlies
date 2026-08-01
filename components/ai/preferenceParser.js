// components/ai/preferenceParser.js
//
// Converts a natural-language query into a structured Preferences object.
// Rule/keyword/regex based — no LLM. Deterministic and cheap.
//
// Output shape (all fields optional; undefined = "no preference"):
// {
//   purpose:  'study' | 'date' | 'work' | 'solo' | 'friends' | 'coffee' | 'dessert' | undefined,
//   budget:   number  | undefined,     // max price per person, in local currency units
//   wifi:     boolean | undefined,
//   charging: boolean | undefined,
//   outdoor:  boolean | undefined,     // true = wants outdoor, false = wants indoor
//   noise:    'low' | 'medium' | 'high' | undefined,
//   ambience: 'romantic' | 'cozy' | 'aesthetic' | 'lively' | 'quiet' | undefined,
//   coffee:   boolean | undefined,     // explicitly wants good coffee
//   food:     boolean | undefined,     // explicitly wants food / desserts
//   groupSize: number | undefined,
//   distance: number,                  // km, defaults to 5
// }

const PURPOSE_RULES = [
  { key: 'study',    patterns: [/\bstudy(ing)?\b/, /\bfocus\b/, /\bexam/, /\blibrary\b/] },
  { key: 'date',     patterns: [/\bdate\b/, /\bromantic\b/, /\banniversary\b/, /\bcouple/] },
  { key: 'work',     patterns: [/\bwork(ing)?\b/, /\bremote\b/, /\bmeeting\b/, /\blaptop\b/, /\bwfh\b/] },
  { key: 'solo',     patterns: [/\bsolo\b/, /\balone\b/, /\bby myself\b/, /\bme time\b/] },
  { key: 'friends',  patterns: [/\bfriends?\b/, /\bhang(ing)? out\b/, /\bcatch ?up\b/, /\bgroup\b/] },
  { key: 'coffee',   patterns: [/\bbest coffee\b/, /\bespresso\b/, /\blatte\b/, /\bcappuccino\b/] },
  { key: 'dessert',  patterns: [/\bdessert/, /\bcake/, /\bpastr/, /\bbakery/, /\bsweet/] },
];

const AMBIENCE_RULES = [
  { key: 'romantic',  patterns: [/\bromantic\b/, /\bdate\b/, /\bintimate\b/, /\bcandle/] },
  { key: 'cozy',      patterns: [/\bcozy\b/, /\bcosy\b/, /\bwarm\b/, /\bcomfy\b/] },
  { key: 'aesthetic', patterns: [/\baesthetic\b/, /\binstagram/, /\bpretty\b/, /\bcute\b/] },
  { key: 'lively',    patterns: [/\blively\b/, /\bvibrant\b/, /\bbuzzing\b/, /\bfun\b/] },
  { key: 'quiet',     patterns: [/\bquiet\b/, /\bpeaceful\b/, /\bcalm\b/, /\bchill\b/, /\bsilent\b/] },
];

const NOISE_LOW  = [/\bquiet\b/, /\bsilent\b/, /\bpeaceful\b/, /\bcalm\b/, /\bstudy/];
const NOISE_HIGH = [/\blively\b/, /\bloud\b/, /\bvibrant\b/, /\bbuzzing\b/, /\bparty\b/];

// Budget: ₹400, Rs 400, INR 400, $10, under 400, below 500, less than 300, cheap/affordable/premium
const BUDGET_RE = /(?:under|below|less than|within|max|upto|up to|around|approx(?:imately)?|~)?\s*(?:₹|rs\.?|inr|\$|usd|€|eur|£|gbp)?\s*(\d{2,5})/i;

function parseBudget(q) {
  // Handle qualitative words with sensible defaults (in ₹ — the project is India-facing)
  if (/\bcheap\b|\baffordable\b|\bbudget\b/.test(q)) return 300;
  if (/\bmid[- ]?range\b|\bmoderate\b/.test(q))     return 600;
  if (/\bpremium\b|\bfancy\b|\bhigh[- ]?end\b/.test(q)) return 1500;

  // Explicit numeric with a price cue nearby
  const priceCue = /(?:under|below|less than|within|max|upto|up to|budget|price|cost|₹|rs\.?|inr|\$|€|£)/i;
  if (!priceCue.test(q)) return undefined;
  const m = q.match(BUDGET_RE);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  if (Number.isNaN(n) || n < 50 || n > 100000) return undefined;
  return n;
}

function parseDistance(q) {
  // "within 2 km", "under 3km", "nearby" → small; default 5 km
  const m = q.match(/(\d+(?:\.\d+)?)\s*km/i);
  if (m) return Math.min(50, Math.max(0.2, parseFloat(m[1])));
  if (/\bnear ?me\b|\bnearby\b|\bclose by\b|\bwalking distance\b/.test(q)) return 2;
  return 5;
}

function parseGroupSize(q) {
  const m = q.match(/\b(\d{1,2})\s*(?:people|persons?|of us|friends?)\b/i);
  if (m) return Math.min(30, parseInt(m[1], 10));
  if (/\bsolo\b|\balone\b|\bby myself\b/.test(q)) return 1;
  if (/\bcouple\b|\btwo of us\b|\bdate\b/.test(q)) return 2;
  return undefined;
}

function anyMatch(text, patterns) {
  return patterns.some((re) => re.test(text));
}

function firstMatch(text, rules) {
  for (const r of rules) if (anyMatch(text, r.patterns)) return r.key;
  return undefined;
}

/**
 * Parse a natural-language query into structured preferences.
 * @param {string} query
 * @returns {object} preferences
 */
export function parsePreferences(query) {
  const q = (query || '').toLowerCase().trim();

  const purpose = firstMatch(q, PURPOSE_RULES);
  const ambience = firstMatch(q, AMBIENCE_RULES);

  let noise;
  if (anyMatch(q, NOISE_LOW)) noise = 'low';
  else if (anyMatch(q, NOISE_HIGH)) noise = 'high';

  const wifi     = /\bwi[- ]?fi\b|\binternet\b/.test(q) ? true : undefined;
  const charging = /\bcharg(ing|er|e)\b|\bpower(?: outlet)?\b|\boutlet\b|\bplug\b/.test(q) ? true : undefined;

  let outdoor;
  if (/\boutdoor\b|\brooftop\b|\bterrace\b|\bopen[- ]?air\b|\balfresco\b|\bgarden\b/.test(q)) outdoor = true;
  else if (/\bindoor\b|\bair[- ]?condition|\bac\b/.test(q)) outdoor = false;

  const coffee = /\bcoffee\b|\bespresso\b|\blatte\b|\bcappuccino\b|\bbrew\b/.test(q) ? true : undefined;
  const food   = /\bfood\b|\bbrunch\b|\bbreakfast\b|\bmeal\b|\bdessert|\bcake|\bbakery|\bpastr/.test(q) ? true : undefined;

  return {
    raw: query,
    purpose,
    ambience,
    noise,
    wifi,
    charging,
    outdoor,
    coffee,
    food,
    budget: parseBudget(q),
    groupSize: parseGroupSize(q),
    distance: parseDistance(q),
  };
}

/** Human-readable summary of parsed preferences — used in chips / debug. */
export function summarizePreferences(prefs) {
  const bits = [];
  if (prefs.purpose)   bits.push(prefs.purpose);
  if (prefs.budget)    bits.push(`under ₹${prefs.budget}`);
  if (prefs.wifi)      bits.push('wi-fi');
  if (prefs.charging)  bits.push('charging');
  if (prefs.outdoor === true)  bits.push('outdoor');
  if (prefs.outdoor === false) bits.push('indoor');
  if (prefs.noise === 'low')  bits.push('quiet');
  if (prefs.noise === 'high') bits.push('lively');
  if (prefs.ambience)  bits.push(prefs.ambience);
  if (prefs.distance)  bits.push(`≤${prefs.distance}km`);
  return bits.join(' · ');
}
