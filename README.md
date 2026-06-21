# 🌱 EcoTrack AI — Carbon Footprint Tracker

> **Hackathon Submission · Challenge 3**
> *"Design a solution that helps individuals understand, track, and reduce their carbon footprint through simple actions and personalized insights."*

---

## 🎯 Chosen Vertical / Challenge

**Challenge 3 — Improve Everyday Life with AI.**
The problem statement asks for a solution that helps individuals **understand, track, and reduce** their carbon footprint through **simple actions and personalized insights**. EcoTrack AI addresses all three verbs directly:

- **Understand** → real-time category breakdown + comparison to India's daily average
- **Track** → daily logging with history, streaks, and a 14-day trend chart
- **Reduce** → AI-generated personalized tips and a 7-day action plan, plus 8 static quick-win tips

---

## 💡 What It Does

A **dependency-light, multi-file static web app** that helps any user:

1. **Track** daily carbon footprint across 4 categories — Transport, Food, Energy, Shopping
2. **Understand** impact via visual breakdowns and a comparison to India's national average
3. **Reduce** footprint through an AI chat coach (Gemini) and a personalized 7-day plan
4. **Stay motivated** with streaks, unlockable badges, and a trend chart

---

## 🏗️ Approach & Logic

### Emission Calculation (`app.js` → `emissionEngine`)
All emissions are calculated with **pure, side-effect-free functions** so they can be unit tested in isolation from the DOM. Emission factors are based on IPCC AR6 guidance and India's CEA grid emission factor:

| Category  | Factor source |
|-----------|---------------|
| Transport | Per-km CO₂ by vehicle type (India grid factor used for EV) |
| Food      | Daily diet type × waste multiplier (FAO / IPCC) |
| Energy    | India grid factor: **0.82 kg CO₂/kWh** + cooking fuel type |
| Shopping  | Per-order delivery emissions + plastic-use multiplier |

Unknown/invalid category values **throw a `RangeError`** rather than silently producing `NaN` — this is deliberate: a wrong number that *looks* plausible is worse than a visible, catchable error.

### AI Layer (Google Gemini API)
- **AI Eco Coach** — conversational chatbot, India-specific context injected into every prompt
- **Instant AI Tip** — after calculating, get 3 specific tips for your exact breakdown
- **7-Day Action Plan** — generated from your tracked history

### Data Flow
```
User Input (validated) → emissionEngine.calculate() → Render Result
                                                            │
                                                  store.addEntry() → localStorage
                                                            │
                                          History + Streak + Badges + Chart re-render
                                                            │
                                    aiClient.ask(prompt, apiKey) → Gemini API → Personalized Tips
```

---

## ⚙️ How the Solution Works — Architecture

Rather than one monolithic file, logic is **separated by responsibility**:

| File | Responsibility |
|---|---|
| `index.html` | Semantic markup only — no inline `onclick=`, no inline styles for logic |
| `styles.css` | All styling, including focus states and reduced-motion support |
| `app.js` | **Pure logic layer**: `emissionEngine`, `validate`, `store`, `aiClient` — zero DOM access, fully unit-testable |
| `ui.js` | DOM rendering + event wiring; imports `app.js` logic, never duplicates it |
| `tests.html` | Self-contained assertion test suite for `app.js` — open directly in a browser |

This split exists specifically so the calculation/validation/storage logic in `app.js` can be tested **without spinning up a DOM or any framework** — `tests.html` loads `app.js` standalone and asserts against it directly.

### Tech Stack
- **Frontend:** HTML5 + CSS3 + vanilla JavaScript (ES6+, no build step, no framework)
- **AI:** Google Gemini API (`gemini-2.0-flash`) — free tier
- **Charts:** Chart.js (loaded from CDN)
- **Storage:** Browser `localStorage` (no backend, no database)
- **Testing:** Custom lightweight assertion runner (no external test framework — keeps repo size minimal)

---

## 🔒 Security

| Risk | Mitigation |
|---|---|
| API key exposure | Stored only in `localStorage`, never logged, never sent anywhere except Google's Gemini endpoint over HTTPS |
| API key format errors | `validate.looksLikeApiKey()` checks shape before every use, with a clear user-facing error if invalid |
| XSS via user-typed chat messages | `validate.sanitizeText()` strips HTML tags before any user input reaches `innerHTML`; all dynamic text rendering also goes through `escapeHtml()` |
| XSS via AI responses | AI responses are escaped with `escapeHtml()` before insertion into the chat log — the AI's output is treated as untrusted, just like user input |
| Invalid/out-of-range numeric input | `emissionEngine.safeNumber()` clamps to a safe non-negative finite number; never propagates `NaN`/`Infinity` into a displayed score |
| Invalid category values (whitelist bypass) | `validate.isAllowed()` and `emissionEngine.lookup()` only accept values present in the emission-factor tables — anything else throws rather than silently coercing |
| Corrupted localStorage data | `store.getHistory()` wraps parsing in try/catch and filters out malformed entries instead of crashing the app |
| No backend = no server attack surface | Entirely static; nothing to patch, no database to leak, no auth tokens to steal server-side |

---

## ♿ Accessibility

- **Semantic HTML**: `<fieldset>`/`<legend>` for grouped form inputs, `<nav role="tablist">` for tabs, `<main>`/`<header>`/`<footer>` landmarks
- **Every form input has a real `<label for=>`** — no placeholder-as-label anti-pattern
- **Skip link** to main content for keyboard users
- **Visible focus rings** (`:focus-visible`) on every interactive element, not just default browser outline
- **ARIA live regions** (`aria-live="polite"`) announce footprint results and AI chat replies to screen readers
- **`role="tablist"` / `role="tab"` / `role="tabpanel"`** with proper `aria-selected` and `aria-controls` wiring
- **Color is never the only signal** — score tiers pair color with text labels and icons
- **`prefers-reduced-motion`** respected — animations disabled for users who request it
- **Charts have an `aria-label`** summarizing their content for non-visual users

---

## 🧪 Testing

Open **`tests.html`** directly in a browser (no server, no build step, no npm install needed). It loads `app.js` and runs **40+ assertions** covering:

- ✅ Emission calculation — happy paths (best case, worst case, typical day)
- ✅ Input robustness — empty strings, negative numbers, non-numeric strings all handled safely
- ✅ Invalid category values correctly **throw** rather than silently producing wrong numbers
- ✅ Score classification boundaries (excellent / good / average / high / very high)
- ✅ Streak calculation — consecutive days, gaps, empty history, missing-today edge case
- ✅ Input sanitization — HTML/script tag stripping, length capping, non-string input handling
- ✅ API key format validation — valid/invalid shapes
- ✅ Whitelist enforcement for all dropdown-driven fields
- ✅ `localStorage` persistence — add/replace/list entries, and **graceful handling of corrupted JSON**

Each test reports a clear pass/fail with a human-readable description, and the page shows a pass/fail summary at the top. Results are also exposed at `window.__TEST_RESULTS__` for any automated/headless runner to read programmatically.

```bash
# To run:
open tests.html   # macOS
start tests.html  # Windows
xdg-open tests.html  # Linux
```

---

## 🚀 How to Run the App

### Option 1 — Open directly in browser
```bash
git clone https://github.com/YOUR_USERNAME/ecotrack-ai.git
cd ecotrack-ai
open index.html      # macOS
start index.html     # Windows
xdg-open index.html  # Linux
```

### Option 2 — Local server (recommended, avoids any file:// CORS quirks)
```bash
cd ecotrack-ai
python -m http.server 8000
# Visit http://localhost:8000
```

### Setup API Key
1. Go to [aistudio.google.com](https://aistudio.google.com) → **Get API Key** (free tier)
2. Open the app → paste the key into the **API Key Setup** section → **Save Key**
3. Key is stored locally in your browser only

---

## 📐 Assumptions Made

1. **India-specific emission factors** — electricity grid factor of 0.82 kg CO₂/kWh (CEA India average, 2023)
2. **Daily food emissions** approximated per diet type (IPCC AR6 + FAO India data); this is a simplification of a much more complex real footprint
3. **LPG cooking** assumed at 1.5 kg CO₂/day average Indian household usage
4. **India average daily footprint** ≈ 6 kg CO₂e per person (World Bank / IPCC-derived estimate), used only as a relative benchmark, not a precise national statistic
5. **Single-user, no authentication** — data is stored per-browser via `localStorage`; this is appropriate for a personal tracker / hackathon demo, not a multi-user production system
6. **API key security model** is "good enough for personal/demo use" — for a production multi-user product, the Gemini key would move to a backend proxy so it's never present in client-side storage at all
7. **No backend** was a deliberate choice to keep the submission small, dependency-free, and trivially auditable for security review

---

## 📁 File Structure

```
ecotrack-ai/
├── index.html      # Semantic markup, no inline scripts/handlers
├── styles.css       # All styling, focus states, reduced-motion support
├── app.js           # Pure logic: emissionEngine, validate, store, aiClient
├── ui.js            # DOM rendering + event wiring (imports app.js)
├── tests.html       # Self-contained test suite (40+ assertions)
└── README.md        # This file
```

---

## 🌍 Real-World Usability

- **No install required** — open `index.html` and it works
- **No login / no account** — instant use
- **Tracking works fully offline**; only AI features need internet
- **India-first** — emission factors, food categories, and AI prompt context are all tuned for Indian daily life
- **Free to run** — Gemini's free tier is sufficient for personal use

---

## 👤 Author

Built for Challenge 3 — Improve Everyday Life with AI.
Powered by Google Gemini API · Carbon data from IPCC, CEA India, FAO.
