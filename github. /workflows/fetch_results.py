import json
import os
import random
from datetime import datetime

# נגדיר את הקלפים והסדרות
suits = ['spade', 'heart', 'diamond', 'club']
cards = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A']
DATA_FILE = 'data.json'

def load_existing_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            try:
                return json.load(f)
            except:
                return []
    return []

def fetch_new_draw():
    # כאן בעתיד אפשר לשלב קוד BeautifulSoup שמושך ישירות מה-HTML של מפעל הפיס:
    # response = requests.get('https://www.pais.co.il/chance/')
    # ...
    
    # בינתיים, הסקריפט מגריל תוצאה חכמה שנוספת למאגר (מדמה משיכת תוצאה אמיתית)
    draw = {
        "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "results": {
            "spade": random.choice(cards),
            "heart": random.choice(cards),
            "diamond": random.choice(cards),
            "club": random.choice(cards)
        }
    }
    return draw

def main():
    print("מתחיל משיכת נתונים...")
    data = load_existing_data()
    
    # אם הקובץ ריק, ניצור היסטוריה התחלתית של 500 הגרלות (כדי שלסוכן יהיה על מה להתבסס)
    if not data:
        print("מייצר בסיס נתונים היסטורי ראשוני...")
        for _ in range(500):
            data.append(fetch_new_draw())
    else:
        # נוסיף את ההגרלה החדשה של היום
        new_draw = fetch_new_draw()
        data.append(new_draw)
        print("נוספה הגרלה חדשה למאגר.")

    # שמירת הנתונים המעודכנים לקובץ
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
    print("הנתונים נשמרו בהצלחה ב-data.json")

if __name__ == "__main__":
    main()
