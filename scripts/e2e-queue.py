"""Journeys for the work queue and answer reuse. Run on freshly seeded data (npm run seed).
Set SHOTS=/dir to save screenshots. PW_CHANNEL=chrome to use installed Chrome."""
import asyncio, os
from playwright.async_api import async_playwright
BASE = "http://localhost:4000"; SHOTS = os.environ.get("SHOTS")
res = []
def chk(name, ok, extra=""):
    res.append(ok); print(("PASS " if ok else "FAIL ") + name, "" if ok else extra)
async def shot(page, name):
    if SHOTS: await page.screenshot(path=f"{SHOTS}/{name}.png")
async def login(page, email, pw):
    await page.goto(BASE); await page.fill("#email", email); await page.fill("#password", pw)
    await page.click("button[type=submit]"); await page.wait_for_selector(".topbar")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel=os.environ.get("PW_CHANNEL") or None)
        ctx = await b.new_context(viewport={"width": 1280, "height": 800}); errs = []
        st = await ctx.new_page(); st.on("pageerror", lambda e: errs.append(str(e)))
        ed = await (await b.new_context(viewport={"width": 1280, "height": 800})).new_page(); ed.on("pageerror", lambda e: errs.append(str(e)))

        # Student asks something close to an already answered CS301 doubt, and something unrelated in CS301.
        await login(st, "aarav@doubtdesk.demo", "student123")
        for text in ("My binary search never stops. It loops forever when I narrow the range with low = mid.",
                     "How does a hash table handle collisions with chaining?"):
            await st.click("text=+ Ask a doubt"); await st.select_option("select", label="CS301 - Computer Science")
            await st.fill("textarea", text); await st.click("button:has-text('Submit doubt')"); await st.wait_for_selector(".toast-ok")
            await st.click(".back-link a"); await st.wait_for_selector(".page-title")
        mine = await st.evaluate("fetch('/api/doubts').then(r=>r.json()).then(j=>j.doubts[0].id)")
        sim = await st.evaluate(f"fetch('/api/doubts/{mine}/similar').then(r=>r.status)")
        chk("student cannot call the similar-answers endpoint", sim == 403, sim)

        await login(ed, "educator@doubtdesk.demo", "educator123")
        await ed.wait_for_selector(".doubt-card")
        n = await ed.locator(".doubt-card").count()
        btn = ed.locator("button:has-text('Work the queue')")
        chk("inbox offers 'Work the queue' with the waiting count", f"{n}" in await btn.inner_text(), await btn.inner_text())
        await shot(ed, "q01-inbox-work-the-queue")

        # Queue starts at the longest-waiting doubt.
        first = (await ed.locator(".doubt-card .doubt-title").first.inner_text()).strip()
        await btn.click(); await ed.wait_for_selector(".queue-bar")
        title = (await ed.locator(".thread-head h2").inner_text()).strip()
        chk("queue opens the longest-waiting doubt", title == first, (title, first))
        bar = await ed.locator(".queue-bar").inner_text()
        chk("queue bar shows waiting count and next doubt", f"{n} waiting" in bar.lower() and "next:" in bar.lower(), bar)
        await shot(ed, "q02-queue-thread")

        # Skip moves on and is counted; Back to inbox is one click away.
        await ed.click(".queue-bar button:has-text('Skip')"); await ed.wait_for_timeout(700)
        bar2 = await ed.locator(".queue-bar").inner_text()
        t2 = (await ed.locator(".thread-head h2").inner_text()).strip()
        chk("skip shows a different doubt and counts it", t2 != title and "1 skipped" in bar2.lower(), (t2, bar2))
        chk("inbox link stays in the queue bar", await ed.locator(".queue-bar a:has-text('Inbox')").count() == 1)

        # Answer reuse: find the new binary-search doubt through the queue.
        for _ in range(n):
            if "binary search never stops" in (await ed.locator(".thread-head").inner_text()).lower(): break
            await ed.click(".queue-bar button:has-text('Skip')"); await ed.wait_for_timeout(600)
        panel = ed.locator(".similar")
        chk("similar panel appears for the related doubt", await panel.count() == 1)
        ptxt = await panel.inner_text() if await panel.count() else ""
        chk("panel shows the earlier binary-search answer", "binary search" in ptxt.lower() and "low = mid + 1" in ptxt, ptxt[:200])
        chk("panel names no student", "Sara" not in ptxt and "sara@" not in ptxt and "Iqbal" not in ptxt, ptxt[:200])
        await shot(ed, "q03-similar-panel")
        await ed.click(".similar button:has-text('Use as draft')")
        draft = await ed.input_value(".reply-box textarea")
        chk("Use as draft fills the box (editable, not sent)", "low = mid + 1" in draft)
        chk("draft warning is shown", "different student" in await ed.locator(".draft-note").inner_text())
        await shot(ed, "q04-draft-copied")
        chk("nothing was sent by Use as draft", await ed.locator(".msg").count() == 0)
        # Placeholder guard
        await ed.fill(".reply-box textarea", "Hi [student], try low = mid + 1.")
        await ed.click(".reply-box button[type=submit]"); await ed.wait_for_timeout(400)
        chk("send is blocked while a placeholder remains", "Replace [student]" in await ed.locator(".form-error").inner_text() and await ed.locator(".msg").count() == 0)
        await ed.fill(".reply-box textarea", "Use low = mid + 1 so the range shrinks every pass.")

        # Unrelated doubt gets no suggestions.
        # Send & next moves on to a doubt, never back to the list.
        before_title = (await ed.locator(".thread-head h2").inner_text()).strip()
        await ed.click("button:has-text('Send & next')"); await ed.wait_for_timeout(1200)
        after_title = (await ed.locator(".thread-head h2").inner_text()).strip()
        chk("Send & next lands on another waiting doubt", after_title != before_title and await ed.locator(".queue-bar").count() == 1, (before_title, after_title))
        done = await ed.evaluate("fetch('/api/doubts').then(r=>r.json()).then(j=>j.doubts.find(d=>d.title.startsWith('My binary search never')).status)")
        chk("answered doubt is now Answered (turn handed to student)", done == "answered", done)

        # Unrelated doubt: no panel.
        for _ in range(n):
            t = (await ed.locator(".thread-head").inner_text()).lower()
            if "hash table" in t: break
            await ed.click(".queue-bar button:has-text('Skip')"); await ed.wait_for_timeout(500)
        chk("unrelated doubt shows no similar panel", "hash table" in (await ed.locator(".thread-head").inner_text()).lower() and await ed.locator(".similar").count() == 0)

        # Drain the queue; last one says Send & finish and returns to inbox with a clear message.
        ed2 = ed
        for _ in range(12):
            if await ed2.locator("button:has-text('Send & finish')").count(): break
            if await ed2.locator("button:has-text('Send & next')").count() == 0: break
            await ed2.fill(".reply-box textarea", "Answer."); await ed2.click("button:has-text('Send & next')"); await ed2.wait_for_timeout(900)
        chk("last doubt says Send & finish", await ed2.locator("button:has-text('Send & finish')").count() == 1)
        await ed2.fill(".reply-box textarea", "Answer."); await ed2.click("button:has-text('Send & finish')"); await ed2.wait_for_selector(".tabs")
        await ed2.wait_for_timeout(700)
        chk("finish returns to inbox with 'Queue clear'", "Queue clear" in await ed2.locator(".toast-ok").inner_text())
        left = await ed2.evaluate("fetch('/api/doubts/summary').then(r=>r.json()).then(s=>s.needs_reply)")
        chk("skipped doubts are not abandoned: queue is only clear when nothing needs a reply", left == 0, left)
        await shot(ed2, "q05-queue-clear")

        # Student sees the answer and whose turn it is.
        await st.goto(BASE); await st.wait_for_selector(".page-title")
        chk("student sees reply cue after queue answers", await st.locator("text=Educator replied").count() >= 1)
        await shot(st, "q06-student-home")

        # Mobile: queue bar and send buttons usable at 390.
        mctx = await b.new_context(viewport={"width": 390, "height": 844}); m = await mctx.new_page(); m.on("pageerror", lambda e: errs.append(str(e)))
        st = await (await b.new_context(viewport={"width": 1280, "height": 800})).new_page()
        await login(st, "rohan@doubtdesk.demo", "student123")  # a fresh doubt keeps the educator queue non-empty
        await st.click("text=+ Ask a doubt"); await st.select_option("select", label="CS301 - Computer Science")
        await st.fill("textarea", "Why is quicksort worst case O(n^2) when the pivot is the smallest element?"); await st.click("button:has-text('Submit doubt')"); await st.wait_for_selector(".toast-ok")
        await login(m, "educator@doubtdesk.demo", "educator123"); await m.wait_for_selector(".doubt-card")
        await shot(m, "q07-mobile-inbox")
        await m.click("button:has-text('Work the queue')"); await m.wait_for_selector(".queue-bar")
        w = await m.evaluate("[document.documentElement.scrollWidth, innerWidth]")
        chk("mobile queue thread has no horizontal overflow", w[0] <= w[1], w)
        h = await m.evaluate("[...document.querySelectorAll('.send-row .btn, .queue-bar .btn')].filter(e=>e.offsetParent).map(e=>Math.round(e.getBoundingClientRect().height))")
        chk("mobile queue buttons are 44px or taller", h and min(h) >= 44, h)
        await m.fill(".reply-box textarea", "x"); await shot(m, "q08-mobile-queue-thread")
        chk("no uncaught page errors", errs == [], errs)
        await b.close()
    print(f"{sum(res)}/{len(res)} checks passed")
    raise SystemExit(0 if all(res) else 1)
asyncio.run(main())
