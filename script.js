// הגדרות בסיסיות
const suits = ['spade', 'heart', 'diamond', 'club'];
const suitSymbols = { 'spade': '♠', 'heart': '♥', 'diamond': '♦', 'club': '♣' };
const cards = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// משתנים גלובליים
let realDataCounts = { 'spade': {}, 'heart': {}, 'diamond': {}, 'club': {} };
let historyDraws = []; // מערך שישמור את סדר ההגרלות הכרונולוגי

suits.forEach(s => cards.forEach(c => realDataCounts[s][c] = 0));

let balance = localStorage.getItem('chance_bankroll') ? parseInt(localStorage.getItem('chance_bankroll')) : 0;
updateBalanceDisplay();

window.openTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
};

// --- משיכת נתונים ובניית היסטוריה ---
async function loadRealData() {
    try {
        const response = await fetch('data.json');
        if (!response.ok) throw new Error("קובץ הנתונים לא נמצא, נייצר נתוני הדמיה מתקדמים.");
        
        historyDraws = await response.json();
    } catch (error) {
        console.warn(error.message);
        // יצירת סדרת נתונים מדומה שתאפשר לאלגוריתם הסטטיסטי לעבוד
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

    // ספירת הנתונים עבור מפת החום הכללית
    suits.forEach(s => cards.forEach(c => realDataCounts[s][c] = 0));
    historyDraws.forEach(draw => {
        if(draw.results) {
            suits.forEach(suit => {
                let card = draw.results[suit];
                if(realDataCounts[suit][card] !== undefined) {
                    realDataCounts[suit][card]++;
                }
            });
        }
    });

    generateHeatmapUI();
    updateAdvancedAgentRecommendations();
}

// 1. ציור מפת החום (כל הזמנים)
function generateHeatmapUI() {
    const tbody = document.querySelector('#heatmap-table tbody');
    tbody.innerHTML = '';
    
    let maxCount = 0;
    suits.forEach(s => cards.forEach(c => {
        if(realDataCounts[s][c] > maxCount) maxCount = realDataCounts[s][c];
    }));
    
    if(maxCount === 0) maxCount = 1;

    cards.forEach(card => {
        let row = document.createElement('tr');
        let cardCell = document.createElement('td');
        cardCell.innerText = card;
        row.appendChild(cardCell);

        suits.forEach(suit => {
            let cell = document.createElement('td');
            let count = realDataCounts[suit][card];
            cell.innerText = count;
            
            let intensity = count / maxCount;
            cell.style.backgroundColor = `rgba(231, 76, 60, ${intensity * 0.8})`;
            if(intensity > 0.5) cell.style.color = 'white';
            
            row.appendChild(cell);
        });
        tbody.appendChild(row);
    });
}

// 2. לוגיקת סוכן סטטיסטית מתקדמת
function updateAdvancedAgentRecommendations() {
    let hotRecommendation = {};
    let delayRecommendation = {};
    let delayStatsText = {};

    // חיתוך 50 ההגרלות האחרונות בלבד עבור בדיקת המומנטום
    let recentDraws = historyDraws.slice(-50);

    suits.forEach(suit => {
        // --- אלגוריתם 1: מומנטום (החם ביותר ב-50 האחרונות) ---
        let recentCounts = {};
        cards.forEach(c => recentCounts[c] = 0);
        
        recentDraws.forEach(draw => {
            if(draw.results && draw.results[suit]) {
                recentCounts[draw.results[suit]]++;
            }
        });
        
        // מציאת הקלף עם הספירה הגבוהה ביותר בחלון הזמן
        let hotCard = cards.reduce((a, b) => recentCounts[a] > recentCounts[b] ? a : b);
        hotRecommendation[suit] = hotCard;

        // --- אלגוריתם 2: מדד השהיה (כמה הגרלות עברו מאז שהופיע) ---
        let delays = {};
        cards.forEach(c => delays[c] = 0);
        
        cards.forEach(card => {
            let delayCount = 0;
            // לולאה שרצה אחורה מההגרלה האחרונה ביותר ועד הישנה ביותר
            for (let i = historyDraws.length - 1; i >= 0; i--) {
                if (historyDraws[i].results && historyDraws[i].results[suit] === card) {
                    break; // מצאנו את ההופעה האחרונה, עוצרים את הספירה
                }
                delayCount++;
            }
            delays[card] = delayCount;
        });

        // מציאת הקלף עם ההשהיה הגדולה ביותר
        let maxDelayCard = cards.reduce((a, b) => delays[a] > delays[b] ? a : b);
        delayRecommendation[suit] = maxDelayCard;
        delayStatsText[suit] = delays[maxDelayCard]; // שומר את מספר ההגרלות שעברו להצגה
    });

    // הרכבת הטקסט להצגה בממשק
    let hotText = suits.map(s => `<span style="color:${(s==='heart'||s==='diamond')?'red':'black'}">${hotRecommendation[s]} ${suitSymbols[s]}</span>`).join(' | ');
    
    // בטקסט של ההשהיה נוסיף בסוגריים כמה הגרלות הקלף הזה נעדר
    let delayText = suits.map(s => `<span style="color:${(s==='heart'||s==='diamond')?'red':'black'}">${delayRecommendation[s]} ${suitSymbols[s]} <span style="font-size:0.7em; color:gray;">(${delayStatsText[s]} נעדר)</span></span>`).join(' | ');
    
    document.getElementById('agent-hot').innerHTML = hotText;
    document.getElementById('agent-delay').innerHTML = delayText;

    // שמירת ההמלצות בזיכרון למילוי בלחיצת כפתור
    window.currentHotRecommendation = hotRecommendation;
    window.currentDelayRecommendation = delayRecommendation;
}

// מפעילים את הכל בעליית הדף
loadRealData();

// 3. מחולל טפסים וכפתורי מילוי אוטומטי
function renderCards(recommendationObj, borderColor) {
    const display = document.getElementById('generated-cards');
    display.innerHTML = '';
    
    suits.forEach(suit => {
        let card = recommendationObj[suit];
        let color = (suit === 'heart' || suit === 'diamond') ? 'red' : 'black';
        display.innerHTML += `<span style="color:${color}; border:2px solid ${borderColor}; padding:10px; border-radius:5px; background: #e8f8f5;">${card} ${suitSymbols[suit]}</span>`;
    });
}

document.getElementById('agent-fill-hot-btn').addEventListener('click', () => {
    renderCards(window.currentHotRecommendation, '#27ae60'); // ירוק למומנטום
});

document.getElementById('agent-fill-delay-btn').addEventListener('click', () => {
    renderCards(window.currentDelayRecommendation, '#8e44ad'); // סגול להשהיה
});

document.getElementById('generate-btn').addEventListener('click', () => {
    let randomRec = {};
    suits.forEach(suit => randomRec[suit] = cards[Math.floor(Math.random() * cards.length)]);
    renderCards(randomRec, '#ddd'); // אפור לאקראי
});

// 4. ניהול תקציב
document.getElementById('deposit-btn').addEventListener('click', () => {
    let amount = parseInt(document.getElementById('deposit-amount').value);
    if(amount > 0) {
        balance += amount;
        saveBalance();
    }
});

function updateBalanceDisplay() {
    document.getElementById('header-balance').innerText = balance;
    document.getElementById('main-balance').innerText = balance;
}

function saveBalance() {
    localStorage.setItem('chance_bankroll', balance);
    updateBalanceDisplay();
}

// 5. סימולטור
document.getElementById('run-sim-btn').addEventListener('click', () => {
    let drawsCount = parseInt(document.getElementById('sim-count').value);
    let ticketCost = 5; 
    let totalCost = drawsCount * ticketCost;
    let totalWon = 0;
    
    for(let i=0; i<drawsCount; i++) {
        let luck = Math.random();
        if(luck < 0.00024) totalWon += 5000; 
        else if(luck < 0.05) totalWon += 20;  
    }
    
    let profit = totalWon - totalCost;
    let resultHTML = `
        <strong>עלות כוללת של שליחת ${drawsCount} טפסים:</strong> ₪${totalCost}<br>
        <strong>סך כל הזכיות בסימולציה:</strong> ₪${totalWon}<br>
        <strong>רווח/הפסד נקי:</strong> <span style="color:${profit >= 0 ? 'green' : 'red'}; font-weight:bold;">₪${profit}</span>
    `;
    document.getElementById('sim-results').innerHTML = resultHTML;
});
