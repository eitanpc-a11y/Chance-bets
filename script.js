// הגדרות בסיסיות
const suits = ['spade', 'heart', 'diamond', 'club'];
const suitSymbols = { 'spade': '♠', 'heart': '♥', 'diamond': '♦', 'club': '♣' };
const cards = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// משתנה גלובלי לאחסון הנתונים מהשרת
let realDataCounts = { 'spade': {}, 'heart': {}, 'diamond': {}, 'club': {} };

// איפוס ספירות
suits.forEach(s => cards.forEach(c => realDataCounts[s][c] = 0));

let balance = localStorage.getItem('chance_bankroll') ? parseInt(localStorage.getItem('chance_bankroll')) : 0;
updateBalanceDisplay();

window.openTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
};

// --- פונקציה חדשה: משיכת הנתונים האמיתיים מקובץ ה-JSON ---
async function loadRealData() {
    try {
        const response = await fetch('data.json');
        if (!response.ok) throw new Error("קובץ הנתונים לא נמצא, נשתמש בנתוני גיבוי.");
        
        const historyData = await response.json();
        
        // ספירת הקלפים מההיסטוריה
        historyData.forEach(draw => {
            if(draw.results) {
                suits.forEach(suit => {
                    let card = draw.results[suit];
                    if(realDataCounts[suit][card] !== undefined) {
                        realDataCounts[suit][card]++;
                    }
                });
            }
        });
        
        console.log("הנתונים נטענו בהצלחה!");
    } catch (error) {
        console.warn(error.message);
        // גיבוי למקרה שהקובץ טרם נוצר: יצירת נתונים זמניים
        suits.forEach(s => cards.forEach(c => realDataCounts[s][c] = Math.floor(Math.random() * 100)));
    }

    // אחרי שהנתונים נטענו, נצייר את מפת החום ונעדכן את הסוכן
    generateHeatmapUI();
    updateAgentRecommendations();
}

// 1. ציור מפת החום על סמך נתוני האמת
function generateHeatmapUI() {
    const tbody = document.querySelector('#heatmap-table tbody');
    tbody.innerHTML = '';
    
    // מציאת הערך המקסימלי כדי לצבוע נכון את מפת החום
    let maxCount = 0;
    suits.forEach(s => cards.forEach(c => {
        if(realDataCounts[s][c] > maxCount) maxCount = realDataCounts[s][c];
    }));
    
    // מניעת חלוקה באפס
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

// 2. לוגיקת הסוכן החכם - מתבסס כעת על ההיסטוריה המלאה!
function updateAgentRecommendations() {
    let hotRecommendation = {};
    let coldRecommendation = {};

    suits.forEach(suit => {
        let maxCard = cards[0];
        let minCard = cards[0];
        let maxVal = -1;
        let minVal = 999999;

        cards.forEach(card => {
            let count = realDataCounts[suit][card]; 
            if (count > maxVal) { maxVal = count; maxCard = card; }
            if (count < minVal) { minVal = count; minCard = card; }
        });

        hotRecommendation[suit] = maxCard;
        coldRecommendation[suit] = minCard;
    });

    let hotText = suits.map(s => `<span style="color:${(s==='heart'||s==='diamond')?'red':'black'}">${hotRecommendation[s]} ${suitSymbols[s]}</span>`).join(' | ');
    let coldText = suits.map(s => `<span style="color:${(s==='heart'||s==='diamond')?'red':'black'}">${coldRecommendation[s]} ${suitSymbols[s]}</span>`).join(' | ');
    
    document.getElementById('agent-hot').innerHTML = hotText;
    document.getElementById('agent-cold').innerHTML = coldText;

    window.currentHotRecommendation = hotRecommendation;
}

// מפעילים את הכל בעליית הדף
loadRealData();

// 3. מחולל טפסים אקראי
document.getElementById('generate-btn').addEventListener('click', () => {
    const display = document.getElementById('generated-cards');
    display.innerHTML = '';
    
    suits.forEach(suit => {
        let randomCard = cards[Math.floor(Math.random() * cards.length)];
        let color = (suit === 'heart' || suit === 'diamond') ? 'red' : 'black';
        display.innerHTML += `<span style="color:${color}; border:1px solid #ddd; padding:10px; border-radius:5px;">${randomCard} ${suitSymbols[suit]}</span>`;
    });
});

// כפתור מילוי אוטומטי לפי המלצת הסוכן
document.getElementById('agent-fill-btn').addEventListener('click', () => {
    const display = document.getElementById('generated-cards');
    display.innerHTML = '';
    
    suits.forEach(suit => {
        let card = window.currentHotRecommendation[suit];
        let color = (suit === 'heart' || suit === 'diamond') ? 'red' : 'black';
        display.innerHTML += `<span style="color:${color}; border:2px solid #27ae60; padding:10px; border-radius:5px; background: #e8f8f5;">${card} ${suitSymbols[suit]}</span>`;
    });
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
