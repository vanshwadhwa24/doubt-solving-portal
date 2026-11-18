"""Fixed-task measurement. Task: educator signed in, Needs reply tab loaded, answer EVERY waiting doubt
with a one-line answer. Counts clicks, text entries, and route changes (views) from first inbox load to
queue empty. Usage: python3 measure.py before|after   (run on freshly seeded data)"""
import asyncio, sys, json
from playwright.async_api import async_playwright
BASE = "http://localhost:4000"
MODE = sys.argv[1]
INIT = """window.__c={clicks:0,views:0};
document.addEventListener('click',()=>window.__c.clicks++,true);
const _p=history.pushState;history.pushState=function(){window.__c.views++;return _p.apply(this,arguments)};window.addEventListener('popstate',()=>window.__c.views++);"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome")
        page = await (await b.new_context(viewport={"width":1280,"height":800})).new_page()
        await page.goto(BASE); await page.fill("#email","educator@doubtdesk.demo"); await page.fill("#password","educator123")
        await page.click("button[type=submit]"); await page.wait_for_selector(".tabs")
        await page.wait_for_selector(".doubt-card")
        n = await page.locator(".doubt-card").count()
        await page.evaluate(INIT)   # counters start here: inbox is loaded
        fills = 0
        if MODE == "before":
            for i in range(n):
                await page.locator(".doubt-card a.btn-small").first.click()
                await page.wait_for_selector(".reply-box textarea")
                await page.fill(".reply-box textarea", f"Answer {i}"); fills += 1
                await page.click(".reply-box button[type=submit]"); await page.wait_for_selector(f"text=Answer {i}")
                await page.click(".back-link a"); await page.wait_for_selector(".tabs")
        else:
            await page.click("button:has-text('Work the queue')")
            for i in range(n):
                await page.wait_for_selector(".reply-box textarea")
                await page.fill(".reply-box textarea", f"Answer {i}"); fills += 1
                await page.click("button:text-matches('Send . (next|finish)')")
                await page.wait_for_timeout(900)
        await page.wait_for_timeout(500)
        c = await page.evaluate("window.__c")
        left = await page.evaluate("fetch('/api/doubts/summary').then(r=>r.json()).then(s=>s.needs_reply)")
        print(json.dumps({"mode":MODE,"doubts":n,"clicks":c["clicks"],"text_entries":fills,"route_changes":c["views"],"needs_reply_left":left}))
        await b.close()
asyncio.run(main())
