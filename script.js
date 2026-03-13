// הגדרות בסיסיות
const suits = ['spade', 'heart', 'diamond', 'club'];
const suitSymbols = { 'spade': '♠', 'heart': '♥', 'diamond': '♦', 'club': '♣' };
const cards = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// ניהול תקציב - שמירה בדפדפן (localStorage)
let balance = localStorage.getItem('chance_bankroll') ? parseInt(localStorage.getItem('chance_bankroll')) : 0;
updateBalanceDisplay();

// פונקציה למעבר בין לשוניות
function openTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
}

// 1. ציור מפת החום (דשבורד)
function generateHeatmap() {
    const tbody = document.querySelector('#heatmap-table tbody');
    tbody.innerHTML = '';
    
    // יצירת נתונים מדומים לסטטיסטיקה
    let counts = { 'spade': {}, 'heart': {}, 'diamond': {}, 'club': {} };
    suits.forEach(s => cards.forEach(c => counts[s][c] = Math.floor(Math.random() * 100)));

    let maxCount = 100;
    
    cards.forEach(card => {
        let row = document.createElement('tr');
        let cardCell = document.createElement('td');
        cardCell.innerText = card;
        row.appendChild(cardCell);

        suits.forEach(suit => {
            let cell = document.createElement('td');
            let count = counts[suit][card];
            cell.innerText = count;
            
            let intensity = count / maxCount;
            cell.style.backgroundColor = `rgba(231, 76, 60, ${intensity * 0.8})`;
            if(intensity > 0.5) cell.style.color = 'white';
            
            row.appendChild(cell);
        });
        tbody.appendChild(row);
    });
}
generateHeatmap();

// 2. מחולל טפסים
document.getElementById('generate-btn').addEventListener('click', () => {
    const display = document.getElementById('generated-cards');
    display.innerHTML = '';
    
    suits.forEach(suit => {
        let randomCard = cards[Math.floor(Math.random() * cards.length)];
        let color = (suit === 'heart' || suit === 'diamond') ? 'red' : 'black';
        display.innerHTML += `<span style="color:${color}; border:1px solid #ddd; padding:10px; border-radius:5px;">${randomCard} ${suitSymbols[suit]}</span>`;
    });
});

// 3. ניהול תקציב
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

// 4. סימולטור אסטרטגיות (Backtesting)
document.getElementById('run-sim-btn').addEventListener('click', () => {
    let drawsCount = parseInt(document.getElementById('sim-count').value);
    let ticketCost = 5; // נניח 5 שקלים לטופס רב-צ'אנס בסיסי
    let totalCost = drawsCount * ticketCost;
    
    // סימולציה פשוטה: סיכוי לזכות ב"צ'אנס 4" הוא 1 ל-4096 (8^4)
    // נריץ סימולציה ונבדוק כמה זכיות קטנות (קלף 1) עד גדולות (4 קלפים)
    let totalWon = 0;
    
    for(let i=0; i<drawsCount; i++) {
        // נניח שיש לנו החזר ממוצע (RTP - Return to Player) של בערך 60% במשחקי מזל
        // זו רק הדגמה אנליטית פשוטה
        let luck = Math.random();
        if(luck < 0.00024) totalWon += 5000; // זכייה גדולה
        else if(luck < 0.05) totalWon += 20;  // זכייה קטנה
    }
    
    let profit = totalWon - totalCost;
    let resultHTML = `
        <strong>עלות כוללת של שליחת ${drawsCount} טפסים:</strong> ₪${totalCost}<br>
        <strong>סך כל הזכיות בסימולציה:</strong> ₪${totalWon}<br>
        <strong>רווח/הפסד נקי:</strong> <span style="color:${profit >= 0 ? 'green' : 'red'}; font-weight:bold;">₪${profit}</span>
    `;
    
    document.getElementById('sim-results').innerHTML = resultHTML;
});
