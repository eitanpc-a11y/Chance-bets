/* =====================================================
   CHANCE ANALYTICS PRO — script.js
   ===================================================== */

'use strict';

// ──────────────────────────────────────────────────────
// CONSTANTS
// ──────────────────────────────────────────────────────

const SUITS = ['spade', 'heart', 'diamond', 'club'];

// תיקון: ♠=עלה, ♥=לב, ♦=יהלום, ♣=תלתן
const SUIT_META = {
  spade:   { symbol: '♠', name: 'עלה',    color: 'black', cssColor: 'var(--spade-col)' },
  heart:   { symbol: '♥', name: 'לב',     color: 'red',   cssColor: 'var(--heart-col)' },
  diamond: { symbol: '♦', name: 'יהלום',  color: 'red',   cssColor: 'var(--diamond-col)' },
  club:    { symbol: '♣', name: 'תלתן',   color: 'black', cssColor: 'var(--club-col)' },
};

const CARDS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// הסתברויות אמיתיות (אומתו ב-2M סימולציות)
const REAL_PROBS = {
  0: 2401 / 4096,  // 58.618%
  1: 1372 / 4096,  // 33.496%
  2:  294 / 4096,  //  7.178%
  3:   28 / 4096,  //  0.684%
  4:    1 / 4096,  //  0.024%
};

// תשלומים משוערים (מפעל הפיס — יתכן שינוי)
const PRIZES = { 0: 0, 1: 0, 2: 10, 3: 50, 4: 5000 };

// ──────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────

let allDraws = [];
let counts = {};   // counts[suit][card] = number
let chartInstance = null;
let distChartInstance = null;
let currentPick = null;  // הטור הנוכחי שנבחר במחולל

SUITS.forEach(s => {
  counts[s] = {};
  CARDS.forEach(c => { counts[s][c] = 0; });
});

// ──────────────────────────────────────────────────────
// UTILS
// ──────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function formatNum(n) {
  return n.toLocaleString('he-IL');
}

function pct(val, total) {
  if (!total) return '0.0';
  return ((val / total) * 100).toFixed(1);
}

function randCard() {
  return CARDS[Math.floor(Math.random() * CARDS.length)];
}

function randDraw() {
  const r = {};
  SUITS.forEach(s => r[s] = randCard());
  return r;
}

// ──────────────────────────────────────────────────────
// CHI-SQUARE STATISTICS
// ──────────────────────────────────────────────────────

/**
 * Regularized upper incomplete gamma function Q(a, x)
 * = p-value for chi-square distribution (df=2a, chi2=2x)
 * Uses Lentz continued fraction (Numerical Recipes)
 */
function gammaIncUpper(a, x) {
  if (x < 0) return 1;
  if (x === 0) return 1;

  // Log-gamma via Lanczos
  function logGamma(z) {
    const g = 7;
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
               771.32342877765313, -176.61502916214059, 12.507343278686905,
               -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
    z -= 1;
    let xg = c[0];
    for (let i = 1; i < g + 2; i++) xg += c[i] / (z + i);
    const t = z + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(xg);
  }

  const logPrefix = -x + a * Math.log(x) - logGamma(a);

  if (x < a + 1) {
    // Series expansion for lower, return 1 - lower
    let term = 1.0 / a, total = term;
    for (let n = 1; n < 300; n++) {
      term *= x / (a + n);
      total += term;
      if (Math.abs(term) < 1e-12 * Math.abs(total)) break;
    }
    return 1.0 - total * Math.exp(logPrefix);
  } else {
    // Continued fraction for upper
    let b = x + 1 - a;
    let cc = 1e30, d = b ? 1.0 / b : 1e30, h = d;
    for (let i = 1; i < 300; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < 1e-30) d = 1e-30;
      cc = b + an / cc;
      if (Math.abs(cc) < 1e-30) cc = 1e-30;
      d = 1 / d;
      const del = d * cc;
      h *= del;
      if (Math.abs(del - 1) < 1e-12) break;
    }
    return Math.exp(logPrefix) * h;
  }
}

function chiSquarePValue(chi2, df) {
  return gammaIncUpper(df / 2, chi2 / 2);
}

function computeChiSquare(suit) {
  const n = allDraws.filter(d => d.results && d.results[suit]).length;
  if (n < 8) return null;
  const expected = n / 8;
  let chi2 = 0;
  CARDS.forEach(c => {
    const obs = counts[suit][c];
    chi2 += Math.pow(obs - expected, 2) / expected;
  });
  const pval = chiSquarePValue(chi2, 7); // df = 8 - 1
  return { chi2, pval, n, expected };
}

// ──────────────────────────────────────────────────────
// DATA LOADING
// ──────────────────────────────────────────────────────

async function loadData() {
  let raw = [];
  let source = 'unknown';

  try {
    const res = await fetch('data.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = await res.json();
    raw = Array.isArray(parsed) ? parsed : [];
    source = raw.length > 0 ? 'file' : 'empty';
  } catch (e) {
    console.warn('data.json לא נמצא:', e.message);
    source = 'empty';
  }

  // Merge manually entered draws (localStorage) with file draws
  const manualDraws = loadManualDraws();
  if (manualDraws.length) {
    raw = [...raw, ...manualDraws];
    console.log(`📝 נטענו ${manualDraws.length} הגרלות שהוזנו ידנית`);
  }

  // אמות ונקה
  allDraws = raw.filter(d => {
    if (!d || !d.results) return false;
    return SUITS.every(s => CARDS.includes(d.results[s]));
  });

  // ספירה מחדש
  SUITS.forEach(s => CARDS.forEach(c => { counts[s][c] = 0; }));
  allDraws.forEach(d => {
    SUITS.forEach(s => {
      if (d.results[s]) counts[s][d.results[s]]++;
    });
  });

  updateDataQualityBadge(source);
  renderAll();
}

function updateDataQualityBadge(source) {
  const badge = $('data-quality-badge');
  const msg   = $('data-status-msg');
  const countBadge = $('data-count-badge');

  const real = allDraws.filter(d => d.status && !d.status.includes('simulated')).length;
  const sim  = allDraws.filter(d => !d.status || d.status.includes('simulated')).length;
  const manual = allDraws.filter(d => d.status === 'manual_real').length;
  const total = allDraws.length;

  countBadge.textContent = `${formatNum(total)} הגרלות`;

  if (source === 'empty' && total === 0) {
    badge.className = 'data-quality dq-empty';
    badge.textContent = 'אין נתונים';
    msg.innerHTML = `הזן את תוצאת ההגרלה בטופס למטה — כל הגרלה שתוסיף תיספר כ<strong>נתון אמיתי</strong>.`;
    return;
  }

  if (real === 0) {
    badge.className = 'data-quality dq-sim';
    badge.textContent = 'מדומה';
    msg.innerHTML = `כל ${total} ההגרלות הן סימולציה פנימית — הסקריפר לא שאב עדיין. <strong style="color:var(--blue)">הוסף תוצאות ידנית!</strong>`;
  } else if (real === total) {
    badge.className = 'data-quality dq-real';
    badge.textContent = '● אמיתי';
    msg.textContent = `${formatNum(total)} הגרלות${manual ? ` (${manual} הוזנו ידנית)` : ''} — נתוני מפעל הפיס.`;
  } else {
    badge.className = 'data-quality dq-partial';
    badge.textContent = '◐ חלקי';
    msg.textContent = `${formatNum(real)} אמיתיות (${pct(real,total)}%)${manual ? ` כולל ${manual} ידניות` : ''} + ${formatNum(sim)} מדומות.`;
  }
}

// ──────────────────────────────────────────────────────
// RENDER — HEATMAP
// ──────────────────────────────────────────────────────

function renderHeatmap() {
  const tbody = $('heatmap-body');
  if (!tbody) return;

  const maxCount = Math.max(1, ...SUITS.flatMap(s => CARDS.map(c => counts[s][c])));
  const total = allDraws.length || 1;

  tbody.innerHTML = CARDS.map(card => {
    const cells = SUITS.map(suit => {
      const n = counts[suit][card];
      const intensity = n / maxCount;
      const expected = total / 8;
      const diff = n - expected;

      // צבע: אדום = גבוה, כחול = נמוך, ירוק = ממוצע
      let bg, fc;
      if (intensity > 0.65) {
        bg = `rgba(255,59,48,${0.12 + intensity * 0.55})`;
        fc = intensity > 0.82 ? '#fff' : '#7a1a15';
      } else if (intensity < 0.25 && total > 40) {
        bg = `rgba(0,122,255,${(0.25 - intensity) * 1.3})`;
        fc = '#003d80';
      } else {
        bg = intensity > 0 ? `rgba(52,199,89,${intensity * 0.22})` : 'transparent';
        fc = 'var(--t1)';
      }

      const diffSign = diff >= 0 ? '+' : '';
      return `<td style="background:${bg};color:${fc}" title="${n} פעמים (ציפוי: ${expected.toFixed(1)}, פער: ${diffSign}${diff.toFixed(1)})">
        ${n}<span style="font-size:0.7em;opacity:0.7;display:block">${diffSign}${diff.toFixed(0)}</span>
      </td>`;
    }).join('');

    return `<tr><td><strong>${card}</strong></td>${cells}</tr>`;
  }).join('');
}

// ──────────────────────────────────────────────────────
// RENDER — TREND CHART
// ──────────────────────────────────────────────────────

function renderTrendChart(suit) {
  const canvas = $('trend-chart');
  if (!canvas) return;

  const recent = allDraws.slice(-50);
  const data = CARDS.map(c => recent.filter(d => d.results && d.results[suit] === c).length);
  const expected = recent.length / 8;

  const meta = SUIT_META[suit];
  const isRed = meta.color === 'red';

  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  chartInstance = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: CARDS,
      datasets: [
        {
          label: `${meta.symbol} ${meta.name} (50 הגרלות אחרונות)`,
          data,
          backgroundColor: CARDS.map(c => {
            const n = counts[suit][c];
            const exp = (allDraws.length || 1) / 8;
            if (n > exp * 1.3) return isRed ? 'rgba(255,59,48,0.75)' : 'rgba(0,122,255,0.75)';
            if (n < exp * 0.7 && allDraws.length > 40) return 'rgba(255,149,0,0.6)';
            return isRed ? 'rgba(255,59,48,0.35)' : 'rgba(0,122,255,0.35)';
          }),
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          label: 'ציפוי אחיד',
          data: Array(8).fill(expected),
          type: 'line',
          borderColor: 'rgba(88,86,214,0.5)',
          borderDash: [4, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: 'rgba(60,60,67,0.6)', font: { family: 'Inter' } } },
        tooltip: {
          callbacks: {
            footer: items => {
              if (items[0].datasetIndex === 1) return '';
              const n = items[0].raw;
              return `ציפוי: ${expected.toFixed(1)} | פער: ${(n - expected).toFixed(1)}`;
            }
          }
        }
      },
      scales: {
        y: { beginAtZero: true, ticks: { color: 'rgba(60,60,67,0.45)' }, grid: { color: 'rgba(0,0,0,0.05)' } },
        x: { ticks: { color: 'rgba(60,60,67,0.45)' }, grid: { color: 'rgba(0,0,0,0.04)' } }
      }
    }
  });
}

// ──────────────────────────────────────────────────────
// RENDER — DISTRIBUTION CHART (all data)
// ──────────────────────────────────────────────────────

function renderDistChart() {
  const canvas = $('dist-chart');
  if (!canvas) return;

  if (distChartInstance) { distChartInstance.destroy(); distChartInstance = null; }

  const datasets = SUITS.map(suit => {
    const meta = SUIT_META[suit];
    const clr = meta.color === 'red' ? 'rgba(239,83,80,' : 'rgba(176,190,197,';
    return {
      label: `${meta.symbol} ${meta.name}`,
      data: CARDS.map(c => counts[suit][c]),
      backgroundColor: `${clr}0.4)`,
      borderColor: `${clr}0.9)`,
      borderWidth: 1.5,
      borderRadius: 3,
    };
  });

  distChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels: CARDS, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: 'rgba(60,60,67,0.6)' } } },
      scales: {
        y: { beginAtZero: true, ticks: { color: 'rgba(60,60,67,0.45)' }, grid: { color: 'rgba(0,0,0,0.05)' } },
        x: { ticks: { color: 'rgba(60,60,67,0.45)' }, grid: { color: 'rgba(0,0,0,0.04)' } }
      }
    }
  });
}

// ──────────────────────────────────────────────────────
// RENDER — CHI-SQUARE
// ──────────────────────────────────────────────────────

function renderChiSquare() {
  const container = $('chi-results');
  if (!container) return;

  container.innerHTML = SUITS.map(suit => {
    const meta = SUIT_META[suit];
    const res = computeChiSquare(suit);
    if (!res) return `<div class="chi-result"><span class="chi-suit">${meta.symbol}</span><span class="chi-stat">נדרשות לפחות 8 הגרלות</span></div>`;

    const { chi2, pval, n, expected } = res;
    const pct100 = (pval * 100).toFixed(2);

    let cls, verdict, barColor;
    if (pval > 0.05) {
      cls = 'chi-ok'; verdict = '✅ הגרלה נראית הוגנת'; barColor = 'var(--green)';
    } else if (pval > 0.01) {
      cls = 'chi-warn'; verdict = '⚠️ חריגה קלה (p<0.05)'; barColor = 'var(--gold)';
    } else {
      cls = 'chi-alert'; verdict = '🚨 אנומליה סטטיסטית (p<0.01)'; barColor = 'var(--red)';
    }

    // bar width = p-value mapped to 0-100% (higher p = more green = wider)
    const barWidth = Math.min(100, pval * 100 * 3); // scale for visibility

    return `
      <div class="chi-result ${cls}">
        <span class="chi-suit" style="color:${meta.cssColor}">${meta.symbol}</span>
        <div style="flex:1">
          <div style="display:flex;gap:10px;align-items:center;margin-bottom:6px">
            <span style="font-weight:600">${meta.name}</span>
            <span class="chi-stat">χ²=${chi2.toFixed(2)}, n=${formatNum(n)}</span>
            <span style="margin-right:auto;font-size:0.82rem">${verdict}</span>
          </div>
          <div class="chi-bar">
            <div class="chi-bar-fill" style="width:${barWidth}%;background:${barColor}"></div>
          </div>
        </div>
        <div class="chi-pval" style="color:${barColor}">p=${pct100}%</div>
      </div>`;
  }).join('');
}

// ──────────────────────────────────────────────────────
// RENDER — STREAKS
// ──────────────────────────────────────────────────────

function computeStreaks() {
  const streaks = {};

  SUITS.forEach(suit => {
    let maxStreak = 0, currentStreak = 1;
    let maxCard = '', currentCard = '';
    let hotCard = '', hotCount = 0;
    let coldCard = '', coldCount = Infinity;

    // Find current streak (latest draws)
    const relevantDraws = allDraws.filter(d => d.results && d.results[suit]);
    for (let i = relevantDraws.length - 1; i > 0; i--) {
      if (relevantDraws[i].results[suit] === relevantDraws[i-1].results[suit]) {
        currentStreak++;
      } else break;
    }
    currentCard = relevantDraws.length ? relevantDraws[relevantDraws.length-1].results[suit] : '?';

    // Find max streak
    let tempStreak = 1, tempCard = relevantDraws[0]?.results[suit] || '';
    for (let i = 1; i < relevantDraws.length; i++) {
      if (relevantDraws[i].results[suit] === relevantDraws[i-1].results[suit]) {
        tempStreak++;
        if (tempStreak > maxStreak) { maxStreak = tempStreak; maxCard = tempCard; }
      } else {
        tempStreak = 1;
        tempCard = relevantDraws[i].results[suit];
      }
    }
    if (maxStreak === 0 && relevantDraws.length) { maxStreak = 1; maxCard = relevantDraws[0].results[suit]; }

    CARDS.forEach(c => {
      const n = counts[suit][c];
      if (n > hotCount) { hotCount = n; hotCard = c; }
      if (n < coldCount) { coldCount = n; coldCard = c; }
    });

    streaks[suit] = { currentStreak, currentCard, maxStreak, maxCard, hotCard, hotCount, coldCard, coldCount };
  });

  return streaks;
}

// ──────────────────────────────────────────────────────
// BACKTEST — test a specific pick against real history
// ──────────────────────────────────────────────────────

function backtestPick(pick) {
  const matchCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  let totalCost = 0, totalWon = 0;

  allDraws.forEach(d => {
    if (!d.results) return;
    const matched = SUITS.reduce((sum, s) => sum + (d.results[s] === pick[s] ? 1 : 0), 0);
    matchCounts[matched]++;
    totalCost += 5;
    totalWon  += PRIZES[matched];
  });

  const n = allDraws.length || 1;
  const net = totalWon - totalCost;
  const pct = {};
  for (let k = 0; k <= 4; k++) pct[k] = (matchCounts[k] / n * 100).toFixed(1);

  return { n, matches: matchCounts, pct, totalCost, totalWon, net };
}

function renderStreaks() {
  const grid = $('streak-grid');
  if (!grid) return;

  const streaks = computeStreaks();

  grid.innerHTML = SUITS.flatMap(suit => {
    const meta = SUIT_META[suit];
    const s = streaks[suit];
    return [
      `<div class="streak-item">
        <div class="streak-label">${meta.symbol} ${meta.name} — רצף נוכחי</div>
        <div class="streak-value" style="color:${meta.cssColor}">${s.currentStreak}×${s.currentCard}</div>
        <div class="streak-sub">הגרלות ברצף</div>
       </div>`,
      `<div class="streak-item">
        <div class="streak-label">${meta.symbol} ${meta.name} — רצף מקסימלי</div>
        <div class="streak-value">${s.maxStreak}×${s.maxCard}</div>
        <div class="streak-sub">שיא כל הזמנים</div>
       </div>`,
    ];
  }).join('');
}

// ──────────────────────────────────────────────────────
// RENDER — DATA BREAKDOWN
// ──────────────────────────────────────────────────────

function renderDataBreakdown() {
  const el = $('data-breakdown');
  if (!el) return;

  const statusCounts = {};
  allDraws.forEach(d => {
    const s = d.status || 'unknown';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });

  const total = allDraws.length || 1;
  el.innerHTML = Object.entries(statusCounts).map(([status, n]) => {
    const width = (n / total) * 100;
    const isReal = !status.includes('simulated');
    const color = isReal ? 'var(--green)' : 'var(--red)';
    return `
      <div class="match-row">
        <span class="match-label" style="width:200px;white-space:nowrap;color:${color}">${status}</span>
        <div class="match-bar-wrap">
          <div class="match-bar" style="width:${width}%;background:${color}"></div>
        </div>
        <span class="match-count" style="width:80px">${formatNum(n)} (${width.toFixed(1)}%)</span>
      </div>`;
  }).join('');
}

// ──────────────────────────────────────────────────────
// RENDER — HISTORY LOG
// ──────────────────────────────────────────────────────

function renderHistoryLog() {
  const el = $('history-log');
  if (!el) return;

  const recent = allDraws.slice(-50).reverse();
  el.innerHTML = recent.map(d => {
    const cards = SUITS.map(s => {
      const m = SUIT_META[s];
      return `<span style="color:${m.cssColor}">${d.results[s]}${m.symbol}</span>`;
    }).join(' ');

    const isReal = d.status && !d.status.includes('simulated');
    const badge = isReal
      ? `<span class="log-status-badge" style="background:var(--green-dim);color:var(--green)">אמיתי</span>`
      : `<span class="log-status-badge" style="background:var(--red-dim);color:var(--red)">מדומה</span>`;

    return `<div class="log-row">
      <span class="log-date">${d.date || ''}</span>
      ${badge}
      <span>${cards}</span>
    </div>`;
  }).join('');
}

// ──────────────────────────────────────────────────────
// RENDER — GENERATOR
// ──────────────────────────────────────────────────────

function getFreqCard(suit, mode = 'hot') {
  let best = CARDS[0], bestVal = mode === 'hot' ? -1 : Infinity;
  CARDS.forEach(c => {
    const n = counts[suit][c];
    if (mode === 'hot' && n > bestVal) { bestVal = n; best = c; }
    if (mode === 'cold' && n < bestVal) { bestVal = n; best = c; }
  });
  return best;
}

function renderGeneratedCards(pick, borderColor) {
  currentPick = pick;  // שמור לשימוש ה-AI ולbacktest

  const el = $('generated-cards');
  if (!el) return;

  el.innerHTML = SUITS.map(suit => {
    const meta = SUIT_META[suit];
    const card = pick[suit];
    const freq = counts[suit][card];
    const total = allDraws.length || 1;
    const p = (freq / total * 100).toFixed(1);
    return `
      <div class="card-chip ${meta.color}" style="border-color:${borderColor}">
        <span class="card-suit-icon">${meta.symbol}</span>
        <span class="card-value">${card}</span>
        <span class="card-suit-name">${meta.name}</span>
        <span style="font-size:0.7rem;color:var(--text-3)">${p}%</span>
      </div>`;
  }).join('');

  // Backtest this pick against all historical draws
  const bt = backtestPick(pick);
  const statsEl = $('gen-stats');
  if (statsEl && bt.n > 1) {
    const netColor = bt.net >= 0 ? 'var(--green)' : 'var(--red)';
    const netSign  = bt.net >= 0 ? '+' : '';
    statsEl.innerHTML = `
      <div style="margin-top:14px; background:var(--bg-hover); border:1px solid var(--border); border-radius:var(--radius); padding:14px;">
        <div class="panel-title" style="margin-bottom:12px">🔁 Backtest — הטור הזה מול ${formatNum(bt.n)} הגרלות היסטוריות</div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px">
          <div class="sim-stat" style="flex:1;min-width:120px">
            <div class="sim-stat-label">עלות כוללת</div>
            <div class="sim-stat-value red">₪${formatNum(bt.totalCost)}</div>
          </div>
          <div class="sim-stat" style="flex:1;min-width:120px">
            <div class="sim-stat-label">זכיות כוללות</div>
            <div class="sim-stat-value">₪${formatNum(bt.totalWon)}</div>
          </div>
          <div class="sim-stat" style="flex:1;min-width:120px">
            <div class="sim-stat-label">רווח / הפסד</div>
            <div class="sim-stat-value" style="color:${netColor}">${netSign}₪${formatNum(bt.net)}</div>
          </div>
        </div>
        ${[0,1,2,3,4].map(k => {
          const barW = bt.n ? (bt.matches[k] / bt.n * 100) : 0;
          const barColor = k === 4 ? 'var(--gold)' : k >= 2 ? 'var(--green)' : 'var(--text-3)';
          return `<div class="match-row">
            <span class="match-label">${k}/4</span>
            <div class="match-bar-wrap"><div class="match-bar" style="width:${barW}%;background:${barColor}"></div></div>
            <span class="match-count">${formatNum(bt.matches[k])}</span>
            <span style="font-size:0.72rem;color:var(--text-3);min-width:70px">${bt.pct[k]}%</span>
            <span style="font-size:0.72rem;color:var(--gold)">+₪${PRIZES[k]}</span>
          </div>`;
        }).join('')}
        <div style="margin-top:10px; font-size:0.75rem; color:var(--text-3)">
          * Backtest הוא תצוגה היסטורית בלבד — אינו מנבא תוצאות עתידיות
        </div>
      </div>`;
  } else {
    if (statsEl) statsEl.innerHTML = `<span class="text-muted">הסתברות לפגיעה מלאה: 0.024% (1 ל-4,096)</span>`;
  }
}

function setupGenerator() {
  $('fill-freq-btn')?.addEventListener('click', () => {
    const pick = {};
    SUITS.forEach(s => pick[s] = getFreqCard(s, 'hot'));
    renderGeneratedCards(pick, 'var(--green)');
  });

  $('fill-random-btn')?.addEventListener('click', () => {
    renderGeneratedCards(SUITS.reduce((o, s) => { o[s] = randCard(); return o; }, {}), 'var(--border-hi)');
  });

  $('fill-cold-btn')?.addEventListener('click', () => {
    const pick = {};
    SUITS.forEach(s => pick[s] = getFreqCard(s, 'cold'));
    renderGeneratedCards(pick, 'var(--blue)');
  });
}

// ──────────────────────────────────────────────────────
// SIMULATOR — correct probabilities
// ──────────────────────────────────────────────────────

function runSimulator() {
  const n = parseInt($('sim-count-slider').value);
  const cost = parseFloat($('sim-cost').value) || 5;
  const strategy = $('sim-strategy').value;
  const mode = $('sim-mode')?.value || 'monte-carlo';

  // ── מצב Backtest: הטור הנוכחי מול הגרלות אמיתיות ──
  if (mode === 'backtest') {
    if (!currentPick) {
      alert('בחר טור תחילה בלשונית "מחולל"');
      return;
    }
    const bt = backtestPick(currentPick);
    renderSimResults({
      n: bt.n, totalCost: bt.totalCost, totalWon: bt.totalWon,
      matchCounts: bt.matches, cost,
      modeLabel: `Backtest היסטורי — הטור ${SUITS.map(s=>`${SUIT_META[s].symbol}${currentPick[s]}`).join(' ')} מול ${formatNum(bt.n)} הגרלות אמיתיות`,
      isBacktest: true,
    });
    return;
  }

  // ── מצב Monte Carlo: סימולציה אקראית ──
  function getPlayerPick() {
    if (strategy === 'freq') { const p={}; SUITS.forEach(s=>p[s]=getFreqCard(s,'hot')); return p; }
    if (strategy === 'cold') { const p={}; SUITS.forEach(s=>p[s]=getFreqCard(s,'cold')); return p; }
    if (strategy === 'current' && currentPick) return currentPick;
    return randDraw();
  }

  let totalCost = 0, totalWon = 0;
  const matchCounts = { 0:0, 1:0, 2:0, 3:0, 4:0 };

  for (let i = 0; i < n; i++) {
    const realDraw = randDraw();
    const playerPick = getPlayerPick();
    const matched = SUITS.reduce((sum, s) => sum + (realDraw[s] === playerPick[s] ? 1 : 0), 0);
    matchCounts[matched]++;
    totalCost += cost;
    totalWon  += PRIZES[matched];
  }

  renderSimResults({ n, totalCost, totalWon, matchCounts, cost,
    modeLabel: `Monte Carlo — ${formatNum(n)} הגרלות מדומות`, isBacktest: false });
}

function renderSimResults({ n, totalCost, totalWon, matchCounts, cost, modeLabel, isBacktest }) {
  const netPnl  = totalWon - totalCost;
  const roi     = totalWon / totalCost * 100;
  const ev      = netPnl / n;
  const houseEdge = Math.max(0, (1 - roi / 100) * 100);

  const panel = $('sim-results-panel');
  panel.style.display = 'block';

  // Mode label
  const modeEl = $('sim-mode-label');
  if (modeEl) modeEl.textContent = modeLabel;

  const statsGrid = $('sim-stat-grid');
  statsGrid.innerHTML = [
    { label: 'מספר משחקים', value: formatNum(n), cls: '' },
    { label: 'עלות כוללת', value: `₪${formatNum(totalCost)}`, cls: 'red' },
    { label: 'זכיות כוללות', value: `₪${formatNum(totalWon)}`, cls: netPnl >= 0 ? 'green' : 'red' },
    { label: 'רווח / הפסד', value: `${netPnl >= 0 ? '+' : ''}₪${formatNum(Math.round(netPnl))}`, cls: netPnl >= 0 ? 'green' : 'red' },
    { label: isBacktest ? 'EV ממוצע' : 'EV לפי סימולציה', value: `₪${ev.toFixed(2)}`, cls: ev >= 0 ? 'green' : 'red' },
    { label: 'ROI', value: `${roi.toFixed(1)}%`, cls: roi >= 100 ? 'green' : 'red' },
    { label: 'יתרון הבית', value: `${houseEdge.toFixed(1)}%`, cls: 'gold' },
    { label: '4/4 פגיעות', value: formatNum(matchCounts[4]), cls: matchCounts[4] > 0 ? 'gold' : '' },
  ].map(s => `
    <div class="sim-stat">
      <div class="sim-stat-label">${s.label}</div>
      <div class="sim-stat-value ${s.cls}">${s.value}</div>
    </div>`).join('');

  const breakdownEl = $('sim-match-breakdown');
  const maxCount = Math.max(1, ...Object.values(matchCounts));
  breakdownEl.innerHTML = [0,1,2,3,4].map(k => {
    const cnt = matchCounts[k];
    const barW = (cnt / maxCount) * 100;
    const theorPct = (REAL_PROBS[k] * 100).toFixed(2);
    const actualPct = (cnt / n * 100).toFixed(2);
    const barColor = k === 4 ? 'var(--gold)' : k >= 2 ? 'var(--green)' : 'var(--text-3)';
    return `
      <div class="match-row">
        <span class="match-label">${k}/4 קלפים</span>
        <div class="match-bar-wrap">
          <div class="match-bar" style="width:${barW}%;background:${barColor}"></div>
        </div>
        <span class="match-count">${formatNum(cnt)}</span>
        <span style="font-size:0.72rem;color:var(--text-3);min-width:160px">
          בפועל ${actualPct}% | תיאורטי ${theorPct}%
        </span>
        <span style="font-size:0.72rem;color:var(--gold);min-width:60px">+₪${PRIZES[k]}</span>
      </div>`;
  }).join('');

  // ── חיבור לתקציב: הצע לנכות מהיתרה ──
  const budgetLinkEl = $('sim-budget-link');
  if (budgetLinkEl && balance > 0) {
    budgetLinkEl.style.display = 'block';
    budgetLinkEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span class="text-muted">יתרתך: <strong style="color:var(--green)">₪${formatNum(balance)}</strong></span>
        <span class="text-muted">עלות כרטיסים בסימולציה: <strong style="color:var(--red)">₪${formatNum(totalCost)}</strong></span>
        <button class="btn btn-danger" id="deduct-sim-btn">נכה מהתקציב</button>
        <button class="btn btn-secondary" id="log-sim-btn">רשום כהימור</button>
      </div>`;
    $('deduct-sim-btn')?.addEventListener('click', () => {
      if (balance >= totalCost) {
        balance = balance - totalCost + totalWon;
        saveBalance(); updateBalanceDisplay();
        budgetLinkEl.innerHTML = `<span style="color:var(--green)">✅ עודכן — יתרה חדשה: ₪${formatNum(balance)}</span>`;
      } else {
        budgetLinkEl.innerHTML += `<span style="color:var(--red)"> ❌ אין מספיק בתקציב (₪${formatNum(balance)})</span>`;
      }
    });
    $('log-sim-btn')?.addEventListener('click', () => {
      betLog.push({ date: new Date().toLocaleString('he-IL'), cost: totalCost, win: totalWon,
                    note: `סימולציה ${formatNum(n)} משחקים` });
      saveBalance(); renderBetLog();
      budgetLinkEl.innerHTML = `<span style="color:var(--green)">✅ נרשם ביומן ההימורים</span>`;
    });
  }
}

function setupSimulator() {
  const slider = $('sim-count-slider');
  const display = $('sim-count-display');
  slider?.addEventListener('input', () => {
    display.textContent = formatNum(parseInt(slider.value));
  });

  // הצג/הסתר slider לפי מצב
  $('sim-mode')?.addEventListener('change', (e) => {
    const sliderRow = $('sim-count-row');
    const stratRow  = $('sim-strategy-row');
    if (!sliderRow || !stratRow) return;
    if (e.target.value === 'backtest') {
      sliderRow.style.opacity = '0.4';
      stratRow.style.opacity  = '0.4';
      sliderRow.style.pointerEvents = 'none';
      stratRow.style.pointerEvents  = 'none';
    } else {
      sliderRow.style.opacity = '1';
      stratRow.style.opacity  = '1';
      sliderRow.style.pointerEvents = 'auto';
      stratRow.style.pointerEvents  = 'auto';
    }
  });

  $('run-sim-btn')?.addEventListener('click', runSimulator);
}

// ──────────────────────────────────────────────────────
// BANKROLL
// ──────────────────────────────────────────────────────

let balance = parseInt(localStorage.getItem('chance_balance') || '0');
const betLog = JSON.parse(localStorage.getItem('chance_bet_log') || '[]');

function saveBalance() {
  localStorage.setItem('chance_balance', balance);
  localStorage.setItem('chance_bet_log', JSON.stringify(betLog.slice(-100)));
}

function updateBalanceDisplay() {
  ['header-balance', 'main-balance'].forEach(id => {
    const el = $(id);
    if (el) el.textContent = formatNum(balance);
  });

  // Show expected value warning
  const evWarn = $('bankroll-ev-warning');
  if (evWarn && balance > 0) {
    const expectedLoss = balance * 0.538;
    evWarn.innerHTML = `ℹ️ אם תשחק את כל היתרה בצ'אנס, תפסיד בממוצע <strong style="color:var(--red)">₪${Math.round(expectedLoss)}</strong> (53.8% יתרון בית)`;
  }
}

function renderBetLog() {
  const el = $('bet-log');
  if (!el) return;
  const recent = betLog.slice(-30).reverse();
  el.innerHTML = recent.map(b => {
    const pnl = b.win - b.cost;
    const col = pnl >= 0 ? 'var(--green)' : 'var(--red)';
    return `<div class="log-row">
      <span class="log-date">${b.date}</span>
      <span>עלות: ₪${b.cost}</span>
      <span>זכייה: ₪${b.win}</span>
      <span style="color:${col};font-weight:600">${pnl >= 0 ? '+' : ''}₪${pnl}</span>
    </div>`;
  }).join('') || '<div style="color:var(--text-3);padding:8px">אין פעולות עדיין</div>';
}

function setupBankroll() {
  updateBalanceDisplay();
  renderBetLog();

  $('deposit-btn')?.addEventListener('click', () => {
    const amt = parseInt($('deposit-amount').value);
    if (amt > 0) { balance += amt; saveBalance(); updateBalanceDisplay(); }
  });

  $('withdraw-btn')?.addEventListener('click', () => {
    const amt = parseInt($('deposit-amount').value);
    if (amt > 0 && balance >= amt) { balance -= amt; saveBalance(); updateBalanceDisplay(); }
  });

  $('reset-bankroll-btn')?.addEventListener('click', () => {
    if (confirm('לאפס את כל התקציב?')) { balance = 0; saveBalance(); updateBalanceDisplay(); }
  });

  $('log-bet-btn')?.addEventListener('click', () => {
    const cost = parseInt($('bet-cost').value) || 0;
    const win  = parseInt($('bet-win').value)  || 0;
    if (cost > 0) {
      balance = balance - cost + win;
      betLog.push({ date: new Date().toLocaleString('he-IL'), cost, win });
      saveBalance();
      updateBalanceDisplay();
      renderBetLog();
    }
  });
}

// ──────────────────────────────────────────────────────
// MANUAL DATA ENTRY
// ──────────────────────────────────────────────────────

const MANUAL_KEY = 'chance_manual_draws';

function loadManualDraws() {
  try { return JSON.parse(localStorage.getItem(MANUAL_KEY) || '[]'); }
  catch { return []; }
}

function saveManualDraws(draws) {
  localStorage.setItem(MANUAL_KEY, JSON.stringify(draws));
}

function setupManualEntry() {
  $('add-manual-btn')?.addEventListener('click', () => {
    const results = {};
    let ok = true;
    for (const s of SUITS) {
      const val = $(`manual-${s}`)?.value;
      if (!val || !CARDS.includes(val)) { ok = false; break; }
      results[s] = val;
    }
    if (!ok) {
      const fb = $('manual-feedback');
      if (fb) { fb.textContent = '⚠️ בחר קלף לכל 4 סדרות'; fb.style.color = 'var(--red)'; }
      return;
    }

    const draw = {
      date: new Date().toLocaleString('he-IL'),
      results,
      status: 'manual_real',
    };

    const manuals = loadManualDraws();
    manuals.push(draw);
    saveManualDraws(manuals);

    // Reload all data
    allDraws.push(draw);
    SUITS.forEach(s => counts[s][results[s]]++);

    // Reset selects
    SUITS.forEach(s => { const el = $(`manual-${s}`); if (el) el.value = ''; });

    const fb = $('manual-feedback');
    if (fb) {
      fb.textContent = `✅ נוסף! (${SUITS.map(s => `${SUIT_META[s].symbol}${results[s]}`).join(' ')})`;
      fb.style.color = 'var(--green)';
      setTimeout(() => { if (fb) fb.textContent = ''; }, 3000);
    }

    updateDataQualityBadge('file');
    renderAll();
  });

  $('export-btn')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(allDraws, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `chance-data-${new Date().toISOString().substring(0,10)}.json`;
    a.click();
  });
}



function getApiKey() { return localStorage.getItem('chance_api_key') || ''; }
function saveApiKey(key) { localStorage.setItem('chance_api_key', key); }

function setupApiKey() {
  const input = $('api-key-input');
  const status = $('api-key-status');

  const existing = getApiKey();
  if (existing) {
    input.value = existing;
    status.textContent = '✅ מפתח API שמור';
    status.style.color = 'var(--green)';
  }

  $('save-key-btn')?.addEventListener('click', () => {
    const key = input.value.trim();
    if (key.startsWith('sk-ant-')) {
      saveApiKey(key);
      status.textContent = '✅ מפתח נשמר';
      status.style.color = 'var(--green)';
    } else {
      status.textContent = '❌ מפתח לא תקין — חייב להתחיל ב-sk-ant-';
      status.style.color = 'var(--red)';
    }
  });

  $('clear-key-btn')?.addEventListener('click', () => {
    localStorage.removeItem('chance_api_key');
    input.value = '';
    status.textContent = 'מפתח נמחק';
    status.style.color = 'var(--text-2)';
  });
}

function buildDataSummary() {
  const total = allDraws.length;
  const real  = allDraws.filter(d => d.status && !d.status.includes('simulated')).length;

  // ── תדירות + chi-square לכל סדרה ──
  const countSummary = SUITS.map(s => {
    const meta = SUIT_META[s];
    const cardStats = CARDS.map(c => `${c}:${counts[s][c]}`).join(', ');
    const chi = computeChiSquare(s);
    const chiStr = chi ? `χ²=${chi.chi2.toFixed(2)} p=${(chi.pval*100).toFixed(1)}%` : 'N/A';
    return `${meta.symbol}${meta.name}: [${cardStats}] (${chiStr})`;
  }).join('\n');

  // ── רצפים ──
  const streaks = computeStreaks();
  const streakStr = SUITS.map(s => {
    const meta = SUIT_META[s];
    const st = streaks[s];
    return `${meta.symbol}: רצף נוכחי ${st.currentStreak}×${st.currentCard}, חם:${st.hotCard}(${st.hotCount}), קר:${st.coldCard}(${st.coldCount})`;
  }).join('\n');

  // ── 30 הגרלות אחרונות (גולמי) ──
  const recent30 = allDraws.slice(-30).reverse().map((d, i) => {
    const cards = SUITS.map(s => `${SUIT_META[s].symbol}${d.results[s]}`).join(' ');
    const flag = d.status?.includes('simulated') ? '[מדומה]' : '[אמיתי]';
    return `${i+1}. ${cards} ${flag}`;
  }).join('\n');

  // ── backtest: הטור הנוכחי מהמחולל מול נתוני עבר ──
  const currentPickStr = currentPick
    ? SUITS.map(s => `${SUIT_META[s].symbol}${currentPick[s]}`).join(' ')
    : 'לא נבחר עדיין';

  let backtestStr = 'לא זמין — בחר טור במחולל תחילה';
  if (currentPick && total > 0) {
    const bt = backtestPick(currentPick);
    backtestStr = `טור: ${currentPickStr}
על ${bt.n} הגרלות היסטוריות:
  • 0/4: ${bt.matches[0]} פעמים (${bt.pct[0]}%)
  • 1/4: ${bt.matches[1]} פעמים (${bt.pct[1]}%)
  • 2/4: ${bt.matches[2]} פעמים (${bt.pct[2]}%)
  • 3/4: ${bt.matches[3]} פעמים (${bt.pct[3]}%)
  • 4/4: ${bt.matches[4]} פעמים (${bt.pct[4]}%)
  • עלות כוללת: ₪${bt.totalCost} | זכיות: ₪${bt.totalWon} | רווח/הפסד: ₪${bt.net}`;
  }

  // ── מצב תקציב ──
  const budgetStr = `יתרה: ₪${balance} | הימורים שנרשמו: ${betLog.length} | סה"כ הוצאות: ₪${betLog.reduce((s,b)=>s+b.cost,0)} | סה"כ זכיות: ₪${betLog.reduce((s,b)=>s+b.win,0)}`;

  return `=== נתוני הגרלות צ'אנס ===
סה"כ הגרלות: ${total} (${real} אמיתיות, ${total-real} מדומות)

תדירות קלפים + Chi-Square:
${countSummary}

ניתוח רצפים:
${streakStr}

30 הגרלות אחרונות (מהחדשה לישנה):
${recent30}

Backtest הטור הנוכחי מול כל ההיסטוריה:
${backtestStr}

מצב תקציב משתמש:
${budgetStr}

הסתברויות תיאורטיות (אומתו 2M סימולציות):
4/4=0.024% (1:4096) | 3/4=0.68% | 2/4=7.2% | 1/4=33.5% | 0/4=58.6%
יתרון בית: ~53.8% | EV למשחק ₪5: -₪2.69`.trim();
}

async function sendChatMessage(userMsg) {
  const key = getApiKey();
  const messagesEl = $('chat-messages');

  // Add user message
  const userDiv = document.createElement('div');
  userDiv.className = 'msg user';
  userDiv.textContent = userMsg;
  messagesEl.appendChild(userDiv);

  // Add loading indicator
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'msg assistant';
  loadingDiv.textContent = '...מחשב';
  messagesEl.appendChild(loadingDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  const dataSummary = buildDataSummary();
  const systemPrompt = `אתה עוזר ניתוח נתונים מומחה להגרלות צ'אנס של מפעל הפיס.
ענה בעברית בצורה ברורה, מדויקת ומבוססת נתונים.
הדגש תמיד ש-צ'אנס היא הגרלה עצמאית — ניתוח היסטורי לא מנבא עתיד.
השתמש בנתונים האלה שנטענו מהאפליקציה:
${dataSummary}`;

  if (!key) {
    loadingDiv.textContent = '⚠️ לא הוגדר מפתח API. עבור ללשונית "עוזר AI" → הגדרות → הזן מפתח Anthropic.';
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return;
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '(תשובה ריקה)';
    loadingDiv.textContent = text;

  } catch (e) {
    loadingDiv.textContent = `❌ שגיאה: ${e.message}`;
    loadingDiv.style.color = 'var(--red)';
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setupAIChat() {
  setupApiKey();

  $('chat-send-btn')?.addEventListener('click', () => {
    const input = $('chat-input');
    const msg = input.value.trim();
    if (msg) { input.value = ''; sendChatMessage(msg); }
  });

  $('chat-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') $('chat-send-btn')?.click();
  });

  document.querySelectorAll('[data-prompt]').forEach(btn => {
    btn.addEventListener('click', () => sendChatMessage(btn.dataset.prompt));
  });
}

// ──────────────────────────────────────────────────────
// TABS
// ──────────────────────────────────────────────────────

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(btn.dataset.tab)?.classList.add('active');

      // Lazy render charts when tabs become visible
      if (btn.dataset.tab === 'tab-stats') {
        renderDistChart();
        renderChiSquare();
        renderStreaks();
        renderDataBreakdown();
      }
    });
  });

  $('chart-suit-selector')?.addEventListener('change', e => renderTrendChart(e.target.value));
}

// ──────────────────────────────────────────────────────
// RENDER ALL
// ──────────────────────────────────────────────────────

function renderAll() {
  renderHeatmap();
  renderTrendChart('spade');
  renderHistoryLog();
  updateBalanceDisplay();

  // Pre-generate a random pick
  renderGeneratedCards(SUITS.reduce((o, s) => { o[s] = randCard(); return o; }, {}), 'var(--border-hi)');
}

// ──────────────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupGenerator();
  setupSimulator();
  setupBankroll();
  setupAIChat();
  setupManualEntry();
  loadData();
});
