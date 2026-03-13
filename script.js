// הגדרות בסיסיות
const suits = ['spade', 'heart', 'diamond', 'club'];
const suitSymbols = { 'spade': '♠', 'heart': '♥', 'diamond': '♦', 'club': '♣' };
const cards = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// ניהול תקציב - שמירה בדפדפן (localStorage)
let balance = localStorage.getItem('chance_bankroll') ? parseInt(localStorage.getItem('chance_bankroll')) : 0;
updateBalanceDisplay();

// פונקציה למעבר בין לשוניות
window.openTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
};

// אובייקט לאחסון ספירת הקלפים עבור מפת החום והסוכן
let mockDataCounts = { 'spade': {}, 'heart': {}, 'diamond': {}, 'club': {} };

// 1. ציור מפת החום ויצירת הנתונים (דשבורד)
function generateDataAndHeatmap() {
    const tbody = document.querySelector('#heatmap-table tbody');
    tbody.innerHTML = '';
    
    // יצירת נתונים מדומים (סימולציה של היסטוריית הגרלות)
    suits.forEach(s => cards.forEach(c => mockDataCounts[s][c] = Math.floor(Math.random() * 100)));

    let maxCount = 100;
    
    cards.forEach(card => {
        let row = document.createElement('tr');
        let cardCell = document.createElement('td');
        cardCell.innerText = card;
        row.appendChild(cardCell);

        suits.forEach(suit => {
            let cell = document.createElement('td');
            let count = mockDataCounts[suit][card];
            cell.innerText = count;
            
            let intensity = count / maxCount;
            cell.style.backgroundColor = `rgba(231, 76, 60, ${intensity * 0.8})`;
            if(intensity > 0.5) cell.style.color = 'white';
            
            row.appendChild(cell);
        });
        tbody.appendChild(row);
    });
}

// 2. לוגיקת הסוכן החכם
function updateAgentRecommendations() {
    let hotRecommendation = {};
    let coldRecommendation = {};

    suits.forEach(suit => {
        let maxCard = cards[0];
        let minCard = cards[0];
        let maxVal = -1;
        let minVal = 999999;

        // חיפוש הקלף החם והקר ביותר בהתבסס על הנתונים שנוצרו למפת החום
        cards.forEach(card => {
            let count = mockDataCounts[suit][card]; 
            if (count > maxVal) { maxVal = count; maxCard = card; }
            if (count < minVal) { minVal = count; minCard = card; }
        });

        hotRecommendation[suit] = maxCard;
        coldRecommendation[suit] = minCard;
    });

    // הצגת ההמלצות במסך
    let hotText = suits.map(s => `<span style="color:${(s==='heart'||s==='diamond')?'red':'black'}">${hotRecommendation[s]} ${suitSymbols[s]}</span>`).join(' | ');
    let coldText = suits.map(s => `<span style="color:${(s==='heart'||s==='diamond')?'red':'black'}">${coldRecommendation[s]} ${suitSymbols[s]}</span>`).join(' | ');
    
    document.getElementById('agent-hot').innerHTML = hotText;
    document.getElementById('agent-cold').innerHTML = coldText;

    // שמירת ההמלצה החמה בזיכרון לשם מילוי אוטומטי
    window.currentHotRecommendation = hotRecommendation;
}

// הפעלת הפונקציות בעליית הדף
generateDataAndHeatmap();
updateAgentRecommendations();

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

// 5. סימולטור אסטרטגיות (Backtesting)
document.getElementById('run-sim-btn').addEventListener('click', () => {
    let drawsCount = parseInt(document.getElementById('sim-count').value);
    let ticketCost = 5; // עלות משוערת לטופס
    let totalCost = drawsCount * ticketCost;
    
    let totalWon = 0;
    
    for(let i=0; i<drawsCount; i++) {
        let luck = Math.random();
        if(luck < 0.00024) totalWon += 5000; // סיכוי לזכייה גדולה
        else if(luck < 0.05) totalWon += 20;  // סיכוי לזכייה קטנה
    }
    
    let profit = totalWon - totalCost;
    let resultHTML = `
        <strong>עלות כוללת של שליחת ${drawsCount} טפסים:</strong> ₪${totalCost}<br>
        <strong>סך כל הזכיות בסימולציה:</strong> ₪${totalWon}<br>
        <strong>רווח/הפסד נקי:</strong> <span style="color:${profit >= 0 ? 'green' : 'red'}; font-weight:bold;">₪${profit}</span>
    `;
    
    document.getElementById('sim-results').innerHTML = resultHTML;
});
