'use strict';

/**
 * EcoTrack AI — UI layer.
 * Handles DOM rendering and event wiring.
 * Depends on app.js (window.EcoTrack) being loaded first.
 */

(function () {
  const { emissionEngine, validate, store, aiClient } = window.EcoTrack;
  const INDIA_AVG = emissionEngine.INDIA_AVG_DAILY_KG;

  const state = {
    apiKey: store.getApiKey(),
    history: store.getHistory(),
    lastResult: null,
    trendChart: null
  };

  const STATIC_TIPS = [
    { icon: '🚲', title: 'Cycle short trips', desc: 'Switch trips under 3km to walking or cycling.', saving: 'Save ~0.5 kg CO₂/day' },
    { icon: '🥗', title: 'One veg day/week', desc: 'A vegetarian day reduces food emissions by 40%.', saving: 'Save ~2 kg CO₂/week' },
    { icon: '💡', title: 'Switch to LEDs', desc: 'LED bulbs use 75% less energy than incandescent.', saving: 'Save ~0.3 kg CO₂/day' },
    { icon: '🛍️', title: 'Reuse bags', desc: 'Carry a cloth bag — say no to single-use plastic.', saving: 'Save ~0.1 kg CO₂/trip' },
    { icon: '🚌', title: 'Use public transport', desc: 'Bus or metro cuts transport emissions by 70%.', saving: 'Save ~3 kg CO₂/day' },
    { icon: '🌊', title: 'Short showers', desc: 'Cut shower time by 2 min to save water & energy.', saving: 'Save ~0.1 kg CO₂/day' },
    { icon: '📱', title: 'Digital receipts', desc: 'Go paperless — opt for digital bills and tickets.', saving: 'Small but meaningful' },
    { icon: '🍱', title: 'Reduce food waste', desc: 'Plan meals, store food well, compost scraps.', saving: 'Save ~1 kg CO₂/day' }
  ];

  const BADGE_DEFS = [
    { icon: '🌱', name: 'First Step', check: h => h.length >= 1 },
    { icon: '🔥', name: '3-Day Streak', check: h => emissionEngine.calcStreak(h) >= 3 },
    { icon: '⚡', name: 'Week Warrior', check: h => emissionEngine.calcStreak(h) >= 7 },
    { icon: '💚', name: 'Green Day', check: h => h.some(e => e.total < 3) },
    { icon: '📊', name: 'Data Driven', check: h => h.length >= 10 },
    { icon: '🌍', name: 'Below Average', check: h => h.some(e => e.total < INDIA_AVG) },
    { icon: '🎯', name: 'Consistent', check: h => h.length >= 5 },
    { icon: '🏆', name: 'Eco Master', check: h => emissionEngine.calcStreak(h) >= 14 }
  ];

  const $ = (id) => document.getElementById(id);

  function announce(message) {
    const region = $('sr-announcer');
    if (region) region.textContent = message;
  }

  function showAlert(id, msg, type) {
    const el = $(id);
    if (!el) return;
    el.textContent = msg;
    el.className = `alert ${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  }

  function hideAlert(id) {
    const el = $(id);
    if (!el) return;
    el.className = 'alert';
    el.textContent = '';
  }

  function switchTab(name, triggerEl) {
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.classList.remove('active');
      p.hidden = true;
    });
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    const panel = $('tab-' + name);
    panel.classList.add('active');
    panel.hidden = false;
    const btn = triggerEl || document.querySelector(`.tab-btn[data-tab="${name}"]`);
    if (btn) { btn.classList.add('active'); btn.setAttribute('aria-selected', 'true'); }
    if (name === 'history') { renderHistory(); updateChart(); }
    if (name === 'badges') { renderBadges(); }
  }

  function saveApiKey() {
    const input = $('api-key-input');
    const key = input.value.trim();
    if (!key || key === '••••••••••••••••') {
      showAlert('api-alert', '⚠ Please enter a valid API key.', 'error');
      return;
    }
    if (!validate.looksLikeApiKey(key)) {
      showAlert('api-alert', '⚠ That doesn\'t look like a valid Gemini API key. Please double-check.', 'error');
      return;
    }
    state.apiKey = key;
    store.setApiKey(key);
    input.value = '••••••••••••••••';
    showAlert('api-alert', '✅ API key saved locally in your browser (never sent anywhere except Google\'s Gemini API).', 'success');
  }

  function readFormInput() {
    return {
      mode: $('t-mode').value,
      km: $('t-km').value,
      diet: $('f-diet').value,
      waste: $('f-waste').value,
      kwh: $('e-kwh').value,
      fuel: $('e-fuel').value,
      orders: $('s-orders').value,
      plastic: $('s-plastic').value
    };
  }

  function calculateFootprint() {
    hideAlert('track-alert');
    const input = readFormInput();
    try {
      const result = emissionEngine.calculate(input);
      state.lastResult = { ...result, ...input };
      renderResult(state.lastResult);
      announce(`Footprint calculated: ${result.total} kilograms CO2 today.`);
    } catch (err) {
      showAlert('track-alert', `⚠ Could not calculate footprint: ${err.message}`, 'error');
    }
  }

  function renderResult(r) {
    const card = $('result-card');
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });

    $('score-num').textContent = r.total.toFixed(2);

    const tier = emissionEngine.classify(r.total);
    const ring = $('score-ring');
    ring.style.borderColor = tier.color;
    $('score-num').style.color = tier.color;
    $('score-label').textContent = tier.label;
    $('score-desc').textContent = `${tier.desc} India avg: ~${INDIA_AVG} kg CO₂/day.`;

    const cats = [
      { name: 'Transport', val: r.transport, color: '#2563eb' },
      { name: 'Food', val: r.food, color: '#22c55e' },
      { name: 'Energy', val: r.energy, color: '#f59e0b' },
      { name: 'Shopping', val: r.shopping, color: '#ec4899' }
    ];
    const bd = $('breakdown');
    bd.innerHTML = '<div style="font-size:0.82rem;color:var(--muted);margin-bottom:8px;">Breakdown</div>' +
      cats.map(cat => {
        const pctBar = r.total > 0 ? (cat.val / r.total * 100).toFixed(0) : 0;
        return `<div class="bar-row">
          <div class="bar-label"><span>${cat.name}</span><span>${cat.val.toFixed(2)} kg</span></div>
          <div class="bar-track" role="img" aria-label="${cat.name}: ${cat.val.toFixed(2)} kilograms, ${pctBar}% of total">
            <div class="bar-fill" style="width:${pctBar}%;background:${cat.color}"></div>
          </div>
        </div>`;
      }).join('');
  }

  function clearForm() {
    $('t-km').value = '';
    $('e-kwh').value = '';
    $('result-card').style.display = 'none';
    state.lastResult = null;
  }

  function saveToHistory() {
    if (!state.lastResult) return;
    const today = new Date().toISOString().split('T')[0];
    const r = state.lastResult;
    state.history = store.addEntry({
      date: today,
      total: r.total,
      breakdown: { transport: r.transport, food: r.food, energy: r.energy, shopping: r.shopping }
    });
    showAlert('track-alert', '✅ Entry saved to your history!', 'success');
    renderBadges();
    setTimeout(() => hideAlert('track-alert'), 3000);
  }

  function renderHistory() {
    const list = $('history-list');
    const empty = $('history-empty');
    const streakEl = $('streak-num');

    if (!state.history.length) {
      empty.style.display = 'block';
      list.innerHTML = '';
      streakEl.textContent = '0';
      return;
    }
    empty.style.display = 'none';

    list.innerHTML = state.history.slice(0, 14).map(e => {
      const color = e.total < 4 ? 'var(--green)' : e.total < 6 ? 'var(--amber)' : 'var(--red)';
      return `<li class="history-item">
        <span class="history-date">📅 ${escapeHtml(e.date)}</span>
        <span class="history-score" style="color:${color}">${e.total} kg CO₂</span>
      </li>`;
    }).join('');

    streakEl.textContent = String(emissionEngine.calcStreak(state.history));
  }

  function initChart() {
    const canvas = $('trend-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    state.trendChart = new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets: [{
        label: 'Daily CO₂ (kg)',
        data: [],
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.08)',
        borderWidth: 2,
        pointBackgroundColor: '#22c55e',
        tension: 0.35,
        fill: true
      }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#1e3a2f33' } },
          y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#1e3a2f33' },
               title: { display: true, text: 'kg CO₂', color: '#94a3b8', font: { size: 10 } } }
        }
      }
    });
    updateChart();
  }

  function updateChart() {
    if (!state.trendChart) return;
    const sorted = [...state.history].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
    state.trendChart.data.labels = sorted.map(e => e.date.slice(5));
    state.trendChart.data.datasets[0].data = sorted.map(e => e.total);
    state.trendChart.update();
  }

  function renderTips() {
    $('tips-grid').innerHTML = STATIC_TIPS.map(t => `
      <div class="tip-card">
        <div class="tip-icon" aria-hidden="true">${t.icon}</div>
        <h4>${escapeHtml(t.title)}</h4>
        <p>${escapeHtml(t.desc)}</p>
        <div class="tip-saving">💰 ${escapeHtml(t.saving)}</div>
      </div>`).join('');
  }

  function renderBadges() {
    $('badges-grid').innerHTML = BADGE_DEFS.map(b => {
      const earned = b.check(state.history);
      return `<div class="badge ${earned ? 'earned' : ''}" role="img" aria-label="${escapeHtml(b.name)} badge: ${earned ? 'earned' : 'locked'}">
        <div class="badge-icon" aria-hidden="true">${earned ? b.icon : '🔒'}</div>
        <div class="badge-name">${escapeHtml(b.name)}</div>
      </div>`;
    }).join('');
  }

  function addAIMessage(text) {
    const box = $('chat-box');
    const div = document.createElement('div');
    div.className = 'msg ai';
    div.innerHTML = `<div class="msg-label">🤖 Eco Coach</div>${escapeHtml(text).replace(/\n/g, '<br/>')}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    announce(text);
  }

  function addUserMessage(text) {
    const box = $('chat-box');
    const div = document.createElement('div');
    div.className = 'msg user';
    div.innerHTML = `<div class="msg-label">You</div>${escapeHtml(text)}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function addTyping() {
    const box = $('chat-box');
    const div = document.createElement('div');
    div.className = 'msg ai typing';
    div.id = 'typing-indicator';
    div.textContent = '🤖 Thinking...';
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function removeTyping() {
    const t = $('typing-indicator');
    if (t) t.remove();
  }

  async function sendChat() {
    const input = $('chat-input');
    const raw = input.value.trim();
    if (!raw) return;
    const msg = validate.sanitizeText(raw, 500);
    input.value = '';

    addUserMessage(msg);

    const contextSummary = state.history.length
      ? `User's recent footprint data: ${JSON.stringify(state.history.slice(0, 5))}. India avg daily: ${INDIA_AVG} kg CO2.`
      : '';

    const prompt = `You are EcoTrack AI, a helpful carbon footprint reduction coach for Indian users. Be concise, friendly, and practical. Use simple language. Focus on India-specific advice (Indian food, transport, energy context).\n\n${contextSummary}\n\nUser asks: ${msg}`;

    const sendBtn = $('chat-send-btn');
    sendBtn.disabled = true;
    addTyping();
    const reply = await aiClient.ask(prompt, state.apiKey);
    removeTyping();
    addAIMessage(reply);
    sendBtn.disabled = false;
  }

  function quickPrompt(text) {
    $('chat-input').value = text;
    switchTab('ai');
    sendChat();
  }

  async function getAITip() {
    if (!state.lastResult) return;
    const r = state.lastResult;
    const prompt = `You are EcoTrack AI, an eco coach for India. A user's daily carbon footprint breakdown is:
- Transport (${r.mode}, ${r.km}km): ${r.transport.toFixed(2)} kg CO2
- Food (${r.diet}, waste: ${r.waste}): ${r.food.toFixed(2)} kg CO2
- Energy (${r.kwh} kWh, ${r.fuel}): ${r.energy.toFixed(2)} kg CO2
- Shopping (orders: ${r.orders}, plastic: ${r.plastic}): ${r.shopping.toFixed(2)} kg CO2
- Total: ${r.total.toFixed(2)} kg CO2 vs India avg ${INDIA_AVG} kg.

Give 3 specific, actionable tips to reduce this footprint. Be concise and India-specific. Use bullet points.`;

    showAlert('track-alert', '🤖 Getting AI tip...', 'success');
    const tip = await aiClient.ask(prompt, state.apiKey);
    hideAlert('track-alert');

    switchTab('ai');
    addAIMessage(`📊 Based on your footprint of ${r.total.toFixed(2)} kg CO₂ today:\n\n${tip}`);
  }

  async function generateActionPlan() {
    const summary = state.history.length
      ? `Recent history (last 7 entries): ${JSON.stringify(state.history.slice(0, 7))}`
      : 'No history yet — give general advice for an average Indian.';

    const prompt = `You are EcoTrack AI. Create a practical 7-day personal action plan to reduce carbon footprint for an Indian user. ${summary}. Format as Day 1 to Day 7 with one specific action per day. Keep it motivating and achievable.`;

    const plan = $('action-plan');
    plan.innerHTML = '<p style="color:var(--muted)">⏳ Generating your plan...</p>';
    const result = await aiClient.ask(prompt, state.apiKey);
    plan.innerHTML = `<div style="font-size:0.87rem;line-height:1.7;color:var(--text)">${escapeHtml(result).replace(/\n/g, '<br/>')}</div>`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function wireEvents() {
    $('save-api-key-btn').addEventListener('click', saveApiKey);

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab, btn));
    });

    $('calc-btn').addEventListener('click', calculateFootprint);
    $('clear-btn').addEventListener('click', clearForm);
    $('save-entry-btn').addEventListener('click', saveToHistory);
    $('ai-tip-btn').addEventListener('click', getAITip);

    $('chat-send-btn').addEventListener('click', sendChat);
    $('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

    document.querySelectorAll('.quick-btn').forEach(btn => {
      btn.addEventListener('click', () => quickPrompt(btn.dataset.prompt));
    });

    $('action-plan-btn').addEventListener('click', generateActionPlan);
  }

  function init() {
    if (state.apiKey) {
      $('api-key-input').value = '••••••••••••••••';
      showAlert('api-alert', '✅ API key loaded from local storage.', 'success');
    }
    wireEvents();
    renderTips();
    renderBadges();
    renderHistory();
    initChart();
    addAIMessage('👋 Hi! I\'m your AI Eco Coach. I can help you understand your carbon footprint, suggest personalised tips, and guide you toward a greener lifestyle. What would you like to know?');
  }

  document.addEventListener('DOMContentLoaded', init);

  window.EcoTrackUI = { switchTab, calculateFootprint, escapeHtml };
})();
