'use strict';

/**
 * EcoTrack AI — Carbon Footprint Tracker
 * Core application logic.
 *
 * Architecture:
 *  - emissionEngine: pure functions for CO2 calculation (fully unit-testable)
 *  - store: persistence layer (localStorage wrapper with validation)
 *  - ui: DOM rendering and event wiring
 *  - aiClient: Gemini API integration with input sanitization
 *
 * Exposed on `window.EcoTrack` for the test suite (tests.html) to import.
 */

// ═══════════════════════════════════════════════════════════════
// EMISSION ENGINE — pure, testable calculation logic
// ═══════════════════════════════════════════════════════════════
const emissionEngine = (() => {
  /** Emission factors in kg CO2e. Sources: IPCC AR6, India CEA grid factor 2023, FAO. */
  const EF = Object.freeze({
    transport: {
      car_petrol: 0.192, car_diesel: 0.171, car_electric: 0.050,
      bike_petrol: 0.089, bus: 0.027, train: 0.012,
      flight_domestic: 0.255, walk_cycle: 0.000
    },
    food: { vegan: 1.5, vegetarian: 2.5, chicken: 4.5, beef: 7.5 },
    foodWaste: { none: 0, little: 0.2, moderate: 0.5, lot: 1.0 },
    electricityGridFactor: 0.82, // kg CO2 per kWh, India average
    cookingFuel: { lpg: 1.5, electric: 0, solar: 0, firewood: 2.0 },
    shoppingOrders: { 0: 0, 1: 0.5, 2: 1.0, 3: 1.8 },
    plastic: { none: 0, little: 0.1, moderate: 0.3 }
  });

  const INDIA_AVG_DAILY_KG = 6.0;

  /** Score classification thresholds (kg CO2/day). Named so they're self-documenting and reused by classify(). */
  const TIER_THRESHOLDS = Object.freeze({
    EXCELLENT_MAX: 2,
    GOOD_MAX: 4,
    AVERAGE_MAX: 6,
    HIGH_MAX: 10
  });

  /** Reasonable upper bounds for raw numeric inputs, used to reject obviously bogus values. */
  const INPUT_LIMITS = Object.freeze({
    MAX_KM_PER_DAY: 2000,   // a long-haul flight leg, generously
    MAX_KWH_PER_DAY: 500    // far beyond any realistic single-household daily usage
  });

  /**
   * Clamp a value to a safe non-negative finite number within INPUT_LIMITS.
   * Prevents NaN/Infinity/negative/absurdly-large values from corrupting calculations.
   * @param {*} value - raw input, possibly a string, undefined, or malformed number
   * @param {number} [fallback=0] - value to use when input is invalid
   * @param {number} [max=Infinity] - upper bound to clamp to
   * @returns {number} a finite, non-negative number
   */
  function safeNumber(value, fallback = 0, max = Infinity) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.min(n, max);
  }

  /**
   * Look up an emission factor by category+key, throwing on unknown keys
   * rather than silently returning undefined (which would propagate as NaN).
   * @param {Record<string, number>} table - emission factor lookup table
   * @param {string} key - the option selected by the user
   * @param {string} tableName - human-readable name used in the error message
   * @returns {number} the emission factor for that key
   * @throws {RangeError} if key is not present in table
   */
  function lookup(table, key, tableName) {
    if (!Object.prototype.hasOwnProperty.call(table, key)) {
      throw new RangeError(`Unknown ${tableName} option: "${key}"`);
    }
    return table[key];
  }

  /**
   * Calculate today's total carbon footprint from validated user inputs.
   * @param {object} input
   * @param {string} input.mode - transport mode key
   * @param {number|string} input.km - distance travelled today
   * @param {string} input.diet - diet type key
   * @param {string} input.waste - food waste level key
   * @param {number|string} input.kwh - electricity used today
   * @param {string} input.fuel - cooking fuel key
   * @param {string} input.orders - shopping orders count key
   * @param {string} input.plastic - plastic usage level key
   * @returns {{total:number, transport:number, food:number, energy:number, shopping:number}}
   * @throws {RangeError} if any categorical input is not a recognised option
   */
  function calculate(input) {
    if (!input || typeof input !== 'object') {
      throw new TypeError('calculate() requires an input object');
    }

    const km = safeNumber(input.km, 0, INPUT_LIMITS.MAX_KM_PER_DAY);
    const kwh = safeNumber(input.kwh, 0, INPUT_LIMITS.MAX_KWH_PER_DAY);

    const transport = lookup(EF.transport, input.mode, 'transport mode') * km;
    const food = lookup(EF.food, input.diet, 'diet') + lookup(EF.foodWaste, input.waste, 'food waste');
    const energy = kwh * EF.electricityGridFactor + lookup(EF.cookingFuel, input.fuel, 'cooking fuel');
    const shopping = lookup(EF.shoppingOrders, input.orders, 'shopping orders') + lookup(EF.plastic, input.plastic, 'plastic use');

    const total = transport + food + energy + shopping;

    return {
      total: round2(total),
      transport: round2(transport),
      food: round2(food),
      energy: round2(energy),
      shopping: round2(shopping)
    };
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  /**
   * Classify a total footprint into a human-readable tier.
   * @param {number} total - total kg CO2 for the day
   * @returns {{tier:string, label:string, desc:string, color:string}}
   */
  function classify(total) {
    if (total < TIER_THRESHOLDS.EXCELLENT_MAX) {
      return { tier: 'excellent', label: '🌟 Excellent!', desc: 'Far below average. Amazing eco habits!', color: '#22c55e' };
    }
    if (total < TIER_THRESHOLDS.GOOD_MAX) {
      return { tier: 'good', label: '✅ Good', desc: 'Below India average. Keep it up!', color: '#86efac' };
    }
    if (total < TIER_THRESHOLDS.AVERAGE_MAX) {
      return { tier: 'average', label: '⚠️ Average', desc: "Around India's daily average.", color: '#f59e0b' };
    }
    if (total < TIER_THRESHOLDS.HIGH_MAX) {
      return { tier: 'high', label: '🔴 High', desc: 'Above average. Room to reduce.', color: '#f97316' };
    }
    return { tier: 'very_high', label: '🚨 Very High', desc: 'Significantly above average. Take action!', color: '#ef4444' };
  }

  /** Maximum number of days to look back when computing a streak — prevents unbounded loops on corrupt data. */
  const MAX_STREAK_LOOKBACK_DAYS = 365;

  /**
   * Calculate consecutive-day streak ending today.
   * @param {Array<{date:string}>} history - entries with date in 'YYYY-MM-DD' format
   * @param {Date} [referenceDate] - the date to count the streak back from (defaults to now; injectable for testing)
   * @returns {number} number of consecutive days tracked, ending at referenceDate
   */
  function calcStreak(history, referenceDate = new Date()) {
    if (!Array.isArray(history) || history.length === 0) return 0;
    const dateSet = new Set(history.map(e => e.date));
    let streak = 0;
    const d = new Date(referenceDate);
    for (let i = 0; i < MAX_STREAK_LOOKBACK_DAYS; i++) {
      const ds = d.toISOString().split('T')[0];
      if (dateSet.has(ds)) { streak++; d.setDate(d.getDate() - 1); } else break;
    }
    return streak;
  }

  return { EF, INDIA_AVG_DAILY_KG, TIER_THRESHOLDS, INPUT_LIMITS, calculate, classify, calcStreak, safeNumber, round2 };
})();

// ═══════════════════════════════════════════════════════════════
// VALIDATION — input sanitization & whitelisting
// ═══════════════════════════════════════════════════════════════
const validate = (() => {
  /** Allowed option sets, derived from the emission engine so they can never drift apart. */
  const ALLOWED = {
    mode: Object.keys(emissionEngine.EF.transport),
    diet: Object.keys(emissionEngine.EF.food),
    waste: Object.keys(emissionEngine.EF.foodWaste),
    fuel: Object.keys(emissionEngine.EF.cookingFuel),
    orders: Object.keys(emissionEngine.EF.shoppingOrders),
    plastic: Object.keys(emissionEngine.EF.plastic)
  };

  /**
   * @param {string} field - one of the keys in ALLOWED (e.g. 'mode', 'diet')
   * @param {string} value - the value to check
   * @returns {boolean} true if value is a recognised option for that field
   */
  function isAllowed(field, value) {
    return ALLOWED[field] !== undefined && ALLOWED[field].includes(value);
  }

  /**
   * Strip a free-text string down to safe, displayable plain text.
   * Removes HTML tags and caps length to prevent prompt-stuffing / DOM injection
   * when the value is later interpolated into innerHTML or an AI prompt.
   * @param {string} str - raw user input
   * @param {number} [maxLen=500] - maximum characters to retain
   * @returns {string} sanitized, trimmed plain text (empty string for non-string input)
   */
  function sanitizeText(str, maxLen = 500) {
    if (typeof str !== 'string') return '';
    const noTags = str.replace(/<[^>]*>/g, '');
    return noTags.slice(0, maxLen).trim();
  }

  /**
   * Validate a Gemini API key's shape (does not verify it actually works against the API).
   * @param {string} key
   * @returns {boolean}
   */
  function looksLikeApiKey(key) {
    return typeof key === 'string' && /^[A-Za-z0-9_-]{20,100}$/.test(key.trim());
  }

  return { isAllowed, sanitizeText, looksLikeApiKey, ALLOWED };
})();

// ═══════════════════════════════════════════════════════════════
// STORE — localStorage persistence with validation & quota safety
// ═══════════════════════════════════════════════════════════════
const store = (() => {
  const KEYS = Object.freeze({ apiKey: 'eco_api_key', history: 'eco_history' });
  const MAX_HISTORY_ENTRIES = 365;

  /** @returns {string} the saved Gemini API key, or '' if none/storage unavailable */
  function getApiKey() {
    try { return localStorage.getItem(KEYS.apiKey) || ''; }
    catch { return ''; }
  }

  /**
   * @param {string} key - API key to persist
   * @returns {boolean} true if saved successfully
   */
  function setApiKey(key) {
    try { localStorage.setItem(KEYS.apiKey, key); return true; }
    catch { return false; }
  }

  function clearApiKey() {
    try { localStorage.removeItem(KEYS.apiKey); } catch { /* storage unavailable, nothing to clean up */ }
  }

  /**
   * @returns {Array<{date:string,total:number}>} validated history entries, newest first.
   *   Malformed entries (missing date/total) are silently dropped rather than crashing.
   */
  function getHistory() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEYS.history) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw.filter(e => e && typeof e.date === 'string' && Number.isFinite(e.total));
    } catch { return []; }
  }

  /**
   * @param {Array<object>} history - full history array to persist (will be capped at MAX_HISTORY_ENTRIES)
   * @returns {boolean} true if saved successfully
   */
  function saveHistory(history) {
    try {
      const trimmed = history.slice(0, MAX_HISTORY_ENTRIES);
      localStorage.setItem(KEYS.history, JSON.stringify(trimmed));
      return true;
    } catch { return false; }
  }

  /**
   * Add or replace today's entry (one entry per date — re-tracking the same day overwrites it).
   * @param {{date:string,total:number}} entry
   * @returns {Array<object>} the updated, sorted history
   */
  function addEntry(entry) {
    const history = getHistory().filter(e => e.date !== entry.date);
    history.push(entry);
    history.sort((a, b) => b.date.localeCompare(a.date));
    saveHistory(history);
    return history;
  }

  return { getApiKey, setApiKey, clearApiKey, getHistory, saveHistory, addEntry };
})();

// ═══════════════════════════════════════════════════════════════
// AI CLIENT — Gemini API wrapper
// ═══════════════════════════════════════════════════════════════
const aiClient = (() => {
  const MODEL = 'gemini-2.0-flash';
  const REQUEST_TIMEOUT_MS = 15000;
  const MAX_OUTPUT_TOKENS = 600;
  const TEMPERATURE = 0.7;
  const ENDPOINT = (key) => `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;

  /**
   * Call Gemini with a prompt. Never throws — always resolves to a user-facing string,
   * so callers don't need try/catch at every call site.
   * @param {string} prompt - the fully-formed prompt to send
   * @param {string} apiKey - the user's Gemini API key
   * @returns {Promise<string>} the AI's reply, or a user-facing error message
   */
  async function ask(prompt, apiKey) {
    if (!apiKey) {
      return '⚠️ Please add your Gemini API key in the setup section above to use AI features.';
    }
    if (!validate.looksLikeApiKey(apiKey)) {
      return '⚠️ That API key doesn\'t look valid. Please check and re-enter it.';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(ENDPOINT(apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: TEMPERATURE, maxOutputTokens: MAX_OUTPUT_TOKENS }
        })
      });
      const data = await res.json();
      if (data.error) return `❌ API Error: ${validate.sanitizeText(data.error.message, 200)}`;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return text ? text : 'No response from AI. Please try again.';
    } catch (e) {
      if (e.name === 'AbortError') {
        return '⏱️ The request took too long and was cancelled. Please try again.';
      }
      return `❌ Network error: ${validate.sanitizeText(e.message, 200)}`;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return { ask };
})();

// ═══════════════════════════════════════════════════════════════
// EXPORT for test suite + browser global
// ═══════════════════════════════════════════════════════════════
const EcoTrack = { emissionEngine, validate, store, aiClient };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EcoTrack; // Node-based test runners, if ever used
}
if (typeof window !== 'undefined') {
  window.EcoTrack = EcoTrack;
}
