"""
fetch_results.py - שאיבת תוצאות צ'אנס מאתר מפעל הפיס
אסטרטגיות מרובות: API → Playwright DOM → גיבוי
"""
import json
import os
import re
import random
import requests
from datetime import datetime
from playwright.sync_api import sync_playwright

DATA_FILE = 'data.json'
VALID_CARDS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A']
SUITS = ['spade', 'heart', 'diamond', 'club']
SUIT_NAMES_HE = {'spade': 'עלה', 'heart': 'לב', 'diamond': 'יהלום', 'club': 'תלתן'}

MAX_RECORDS = 1000

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/html, */*',
    'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
    'Referer': 'https://www.pais.co.il/',
}


# ─────────────────────────────────────────────
# טעינה ואימות נתונים
# ─────────────────────────────────────────────

def load_existing_data():
    if not os.path.exists(DATA_FILE):
        return []
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            raw = json.load(f)
        valid = [d for d in raw if is_valid_draw(d)]
        if len(valid) < len(raw):
            print(f"⚠️  סוננו {len(raw) - len(valid)} רשומות פגומות")
        return valid
    except Exception as e:
        print(f"שגיאה בטעינת קובץ: {e}")
        return []


def is_valid_draw(draw):
    if not isinstance(draw, dict):
        return False
    results = draw.get('results', {})
    for suit in SUITS:
        if results.get(suit) not in VALID_CARDS:
            return False
    return True


# ─────────────────────────────────────────────
# שיטה 1: API endpoint ישיר
# ─────────────────────────────────────────────

def try_api_endpoints():
    """ניסיון לגשת ל-API של הפיס ישירות"""
    endpoints = [
        'https://www.pais.co.il/api/gameresults/chance',
        'https://www.pais.co.il/api/chance/latest',
        'https://www.pais.co.il/api/game/chance/results',
        'https://www.pais.co.il/GameResults/Chance',
    ]
    for url in endpoints:
        try:
            r = requests.get(url, headers=HEADERS, timeout=10)
            if r.status_code == 200:
                data = r.json()
                parsed = parse_api_response(data)
                if parsed:
                    print(f"✅ API הצליח: {url}")
                    return parsed
        except Exception as e:
            print(f"API נכשל ({url}): {e}")
    return None


def parse_api_response(data):
    """מנסה לחלץ תוצאות ממבנים שונים של JSON"""
    # מבנה אפשרי 1: {"spade":"A","heart":"K",...}
    if isinstance(data, dict):
        results = {}
        for suit in SUITS:
            val = data.get(suit) or data.get(SUIT_NAMES_HE[suit])
            if val and str(val) in VALID_CARDS:
                results[suit] = str(val)
        if len(results) == 4:
            return build_draw(results, 'api_direct')

        # מבנה אפשרי 2: {"results": {...}}
        inner = data.get('results') or data.get('draw') or data.get('winningNumbers')
        if isinstance(inner, dict):
            return parse_api_response(inner)

        # מבנה אפשרי 3: {"items": [...]} — מקח את הראשון
        items = data.get('items') or data.get('draws') or data.get('data')
        if isinstance(items, list) and items:
            return parse_api_response(items[0])

    return None


# ─────────────────────────────────────────────
# שיטה 2: Playwright — סריקה מלאה של DOM
# ─────────────────────────────────────────────

SUIT_SELECTORS = {
    'spade':   ['[class*="spade"]', '[data-suit="spade"]', '[alt*="spade"]',
                '[class*="Spade"]', '[id*="spade"]'],
    'heart':   ['[class*="heart"]', '[data-suit="heart"]', '[alt*="heart"]',
                '[class*="Heart"]', '[id*="heart"]'],
    'diamond': ['[class*="diamond"]', '[data-suit="diamond"]', '[alt*="diamond"]',
                '[class*="Diamond"]', '[id*="diamond"]'],
    'club':    ['[class*="club"]', '[data-suit="club"]', '[alt*="club"]',
                '[class*="Club"]', '[id*="club"]'],
}

# תבניות טקסט ידועות מאתר הפיס לצד כל סדרה
SUIT_KEYWORDS_HE = {
    'spade':   ['עלה', 'Spade'],
    'heart':   ['לב', 'Heart'],
    'diamond': ['יהלום', 'Diamond'],
    'club':    ['תלתן', 'Club'],
}


def scrape_playwright():
    """סריקה מלאה עם Playwright + ניתוח DOM"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        ctx = browser.new_context(
            user_agent=HEADERS['User-Agent'],
            viewport={'width': 1280, 'height': 800},
            locale='he-IL',
        )
        page = ctx.new_page()

        # יירוט תגובות API
        api_results = []
        def on_response(resp):
            if 'chance' in resp.url.lower() or 'result' in resp.url.lower():
                try:
                    data = resp.json()
                    parsed = parse_api_response(data)
                    if parsed:
                        api_results.append(parsed)
                except Exception:
                    pass

        page.on('response', on_response)

        try:
            print("🌐 טוען עמוד מפעל הפיס...")
            page.goto('https://www.pais.co.il/chance/', timeout=30000, wait_until='networkidle')
            page.wait_for_timeout(4000)

            # אם API נקרא בדרך — נשתמש בתוצאה
            if api_results:
                browser.close()
                api_results[0]['status'] = 'playwright_api_intercept'
                print(f"✅ תוצאה נלכדה מ-API: {api_results[0]['results']}")
                return api_results[0]

            # --- ניסיון 1: סלקטורים לפי סדרה ---
            results = {}
            for suit, selectors in SUIT_SELECTORS.items():
                for sel in selectors:
                    try:
                        els = page.locator(sel).all()
                        for el in els:
                            txt = el.inner_text().strip().upper()
                            if txt in [c.upper() for c in VALID_CARDS]:
                                results[suit] = txt if txt != '10' else '10'
                                # normalize
                                for c in VALID_CARDS:
                                    if txt == c.upper():
                                        results[suit] = c
                                break
                    except Exception:
                        pass
                    if suit in results:
                        break

            if len(results) == 4:
                print(f"✅ נתונים אמיתיים (DOM selectors): {results}")
                browser.close()
                return build_draw(results, 'playwright_dom')

            # --- ניסיון 2: חיפוש טקסטואלי בכל ה-DOM ---
            body_html = page.content()
            results = parse_html_text(body_html)
            if results and len(results) == 4:
                print(f"✅ נתונים אמיתיים (HTML parse): {results}")
                browser.close()
                return build_draw(results, 'playwright_html_parse')

            # --- ניסיון 3: screenshot לדיבאג ---
            page.screenshot(path='debug_pais.png', full_page=False)
            print("📸 נשמרה תמונת דיבאג: debug_pais.png")

        except Exception as e:
            print(f"❌ שגיאת Playwright: {e}")
        finally:
            try:
                browser.close()
            except Exception:
                pass

    return None


def parse_html_text(html):
    """חיפוש חכם בטקסט ה-HTML לפי קירבה בין שמות סדרות לקלפים"""
    # חלץ כל זוגות (שם_סדרה, קלף) הסמוכים אחד לשני ב-HTML
    results = {}
    card_pattern = r'\b(10|[7-9]|[JQKA])\b'

    for suit, keywords in SUIT_KEYWORDS_HE.items():
        for kw in keywords:
            idx = html.find(kw)
            if idx == -1:
                continue
            # חפש קלף ב-200 תווים סביב המילה
            window = html[max(0, idx-100):idx+200]
            # נקה תגיות HTML
            clean = re.sub(r'<[^>]+>', ' ', window)
            found = re.findall(card_pattern, clean)
            if found:
                results[suit] = found[0]
                break

    return results if len(results) == 4 else None


# ─────────────────────────────────────────────
# שיטת גיבוי: סימולציה אקראית (מסומנת בבירור)
# ─────────────────────────────────────────────

def fallback_draw():
    print("⚠️  לא ניתן לשאוב נתונים אמיתיים — יוצר הגרלה מדומה (מסומנת כ-simulated)")
    return build_draw(
        {s: random.choice(VALID_CARDS) for s in SUITS},
        'simulated'
    )


# ─────────────────────────────────────────────
# עזרים
# ─────────────────────────────────────────────

def build_draw(results, status):
    return {
        'date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'results': results,
        'status': status,
    }


def save_data(data):
    if len(data) > MAX_RECORDS:
        data = data[-MAX_RECORDS:]
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"💾 נשמרו {len(data)} הגרלות → {DATA_FILE}")


# ─────────────────────────────────────────────
# main
# ─────────────────────────────────────────────

def main():
    data = load_existing_data()
    print(f"📦 נטענו {len(data)} הגרלות קיימות")

    # אסטרטגיה 1 — API ישיר (מהיר, ללא דפדפן)
    new_draw = try_api_endpoints()

    # אסטרטגיה 2 — Playwright (כבד יותר אבל מלא)
    if not new_draw:
        new_draw = scrape_playwright()

    # גיבוי — סימולציה
    if not new_draw:
        new_draw = fallback_draw()

    data.append(new_draw)
    save_data(data)

    status = new_draw.get('status', '?')
    results = new_draw.get('results', {})
    is_real = 'simulated' not in status
    emoji = '✅' if is_real else '⚠️'
    print(f"{emoji} הגרלה חדשה ({status}): {results}")


if __name__ == '__main__':
    main()
