// הגדרות בסיסיות
const suits = ['spade', 'heart', 'diamond', 'club'];
const suitSymbols = { 'spade': '♠', 'heart': '♥', 'diamond': '♦', 'club': '♣' };
const cards = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

let historyDraws = []; 
let realDataCounts = { 'spade': {}, 'heart': {}, 'diamond': {}, 'club': {} };
let trendChartInstance = null; 

// ניהול תקציב
let balance = localStorage.getItem('chance_bankroll') ? parseInt(localStorage.getItem('chance_bankroll')) : 0;
updateBalanceDisplay();

// מעבר בין לשוניות
window.openTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
};

// טעינת הנתונים (מ-JSON או יצירת הדמיה)
async function loadRealData() {
    try {
        const response = await fetch('data.json');
        if (!response.ok) throw new Error("קובץ הנתונים לא נמצא.");
        historyDraws = await response.json();
    } catch (error) {
        console.warn("משתמש בנתוני גיבוי/הדמיה עד שהרובוט ייצר את data.json");
        historyDraws = [];
        for(let i=0; i<500; i++) {
            historyDraws.push({
                results: { 
                    spade: cards[Math.floor(Math.random() * cards.length)], 
                    heart: cards[Math.floor(Math.random() * cards.length)], 
                    diamond: cards[Math.floor(Math.random() * cards.length)], 
                    club: cards[Math.floor(Math.random() * cards.length)] 
                }
            });
        }
    }

    // ספירה מחדש של הנתונים
    suits.forEach(s => cards.forEach(c => realDataCounts[s][c] = 0));
    historyDraws.forEach(draw => {
        if(draw.results) {
            suits.forEach(suit => {
                if(draw.results[suit] !== undefined) realDataCounts[suit][draw.results[suit]]++;
            });
        }
    });

    generateHeatmapUI();
    updateMarketIndicators();
    drawChart('heart'); // מצייר גרף ברירת מחדל לסדרת לב
}

// 1. ציור מפת החום
function generateHeatmapUI() {
    const tbody = document.querySelector('#heatmap-table tbody');
    if (!tbody) return; // הגנה מקריסה
    
    tbody.innerHTML = '';
    let maxCount = Math.max(1, ...suits.flatMap(s => cards.map(c => realDataCounts[s][c])));

    cards.forEach(card => {
        let row = document.createElement('tr');
        row.innerHTML = `<td><strong>${card}</strong></td>`;
        suits.forEach(suit => {
            let count = realDataCounts[suit][card];
            let intensity = count / maxCount;
            let bgColor = `rgba(231, 76, 60, ${intensity * 0.8})`;
            let textColor = intensity > 0.5 ? 'white' : 'black';
            row.innerHTML += `<td style="background-color: ${bgColor}; color: ${textColor};">${count}</td>`;
        });
        tbody.appendChild(row);
    });
}

// 2. אינדיקטורים לסוכן החכם (מגמות ו-RSI)
function updateMarketIndicators() {
    let trendRecommendation = {};
    let overboughtWarning = {}; 

    let shortTermWindow = historyDraws.slice(-10); 
    let longTermWindow = historyDraws.slice(-50); 

    suits.forEach(suit => {
        let bestTrendCard = cards[0];
        let maxTrendGap = -999;
        let overboughtCard = "אין חריגה";
        let maxRSI = 0;

        cards.forEach(card => {
            // חישוב פער ממוצעים (תדירות קצר מול ארוך)
            let shortMA = shortTermWindow.filter(d => d.results && d.results[suit] === card).length / 10;
            let longMA = longTermWindow.filter(d => d.results && d.results[suit] === card).length / 50;
            let trendGap = shortMA - longMA;

            if (trendGap > maxTrendGap) {
                maxTrendGap = trendGap;
                bestTrendCard = card;
            }

            // חישוב RSI (תדירות חריגה לאחרונה)
            let recentOccurrences = shortTermWindow.filter(d => d.results && d.results[suit] === card).length;
            let rsiEquivalent = (recentOccurrences / 10) * 100; 
            
            if (rsiEquivalent >= 30 && rsiEquivalent > maxRSI) { 
                maxRSI = rsiEquivalent;
                overboughtCard = card;
            }
        });

        trendRecommendation[suit] = bestTrendCard;
        overboughtWarning[suit] = overboughtCard;
    });

    // עדכון ה-HTML - חייב להתאים ל-IDs בקובץ ה-HTML החדש
    let elTrend = document.getElementById('agent-trend');
    let elRsi = document.getElementById('agent-rsi');
    
    if(elTrend) elTrend.innerHTML = suits.map(s => `<span style="color:${(s==='heart'||s==='diamond')?'red':'black'}">${trendRecommendation[s]} ${suitSymbols[s]}</span>`).join(' | ');
    if(elRsi) elRsi.innerHTML = suits.map(s => `<span style="color:${(s==='heart'||s==='diamond')?'red':'black'}">${overboughtWarning[s] !== "אין חריגה" ? overboughtWarning[s] : "--"} ${suitSymbols[s]}</span>`).join(' | ');

    window.currentTrendRecommendation = trendRecommendation;
}

// 3. ציור גרף (Chart.js)
function drawChart(selectedSuit) {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    let recentDraws = historyDraws.slice(-50);
    let chartData = cards.map(card => {
        return recentDraws.filter(d => d.results && d.results[selectedSuit] === card).length;
    });

    let colors = selectedSuit === 'heart' || selectedSuit === 'diamond' ? 'rgba(231, 76, 60, 0.6)' : 'rgba(44, 62, 80, 0.6)';

    if (trendChartInstance) trendChartInstance.destroy(); 

    trendChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: cards,
            datasets: [{
                label: `תדירות קלפי ${suitSymbols[selectedSuit]} (50 הגרלות אחרונות)`,
                data: chartData,
                backgroundColor: colors,
                borderColor: colors.replace('0.6', '1'),
                borderWidth: 1
            }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
}

// האזנה לשינוי סדרה בגרף
const suitSelector = document.getElementById('chart-suit-selector');
if(suitSelector) {
    suitSelector.addEventListener('change', (e) => {
        drawChart(e.target.value);
    });
}

// מפעיל את הטעינה
loadRealData();

// 4. מחוללים (כפתורים)
function renderCards(recommendationObj, borderColor) {
    const display = document.getElementById('generated-cards');
    if(!display) return;
    display.innerHTML = '';
    suits.forEach(suit => {
        let card = recommendationObj[suit];
        let color = (suit === 'heart' || suit === 'diamond') ? 'red' : 'black';
        display.innerHTML += `<span style="color:${color}; border:2px solid ${borderColor}; padding:10px; border-radius:5px; background: #e8f8f5;">${card} ${suitSymbols[suit]}</span>`;
    });
}

const fillTrendBtn = document.getElementById('agent-fill-trend-btn');
if(fillTrendBtn) fillTrendBtn.addEventListener('click', () => renderCards(window.currentTrendRecommendation, '#27ae60'));

const generateBtn = document.getElementById('generate-btn');
if(generateBtn) {
    generateBtn.addEventListener('click', () => {
        let randomRec = {};
        suits.forEach(s => randomRec[s] = cards[Math.floor(Math.random() * cards.length)]);
        renderCards(randomRec, '#ddd');
    });
}

// 5. תקציב וסימולטור
const depositBtn = document.getElementById('deposit-btn');
if(depositBtn) {
    depositBtn.addEventListener('click', () => {
        let amount = parseInt(document.getElementById('deposit-amount').value);
        if(amount > 0) { balance += amount; saveBalance(); }
    });
}

function updateBalanceDisplay() {
    let headerBalance = document.getElementById('header-balance');
    let mainBalance = document.getElementById('main-balance');
    if(headerBalance) headerBalance.innerText = balance;
    if(mainBalance) mainBalance.innerText = balance;
}

function saveBalance() {
    localStorage.setItem('chance_bankroll', balance);
    updateBalanceDisplay();
}

const simBtn = document.getElementById('run-sim-btn');
if(simBtn) {
    simBtn.addEventListener('click', () => {
        let drawsCount = parseInt(document.getElementById('sim-count').value);
        let totalCost = drawsCount * 5; 
        let totalWon = 0;
        for(let i=0; i<drawsCount; i++) {
            let luck = Math.random();
            if(luck < 0.00024) totalWon += 5000; 
            else if(luck < 0.05) totalWon += 20;  
        }
        document.getElementById('sim-results').innerHTML = `
            <strong>עלות כוללת:</strong> ₪${totalCost}<br>
            <strong>סך זכיות:</strong> ₪${totalWon}<br>
            <strong>רווח/הפסד:</strong> <span style="color:${totalWon - totalCost >= 0 ? 'green' : 'red'};">₪${totalWon - totalCost}</span>
        `;
    });
}
