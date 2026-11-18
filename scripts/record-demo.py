"""Records the silent demo walkthrough (about 7 minutes, incl. Telegram section; needs node for scripts/fake-telegram.mjs) (demo.mp4) against a seeded app on :4000.
Usage: npm run seed && npm start (other shell) && python3 scripts/record-demo.py
Set PW_CHANNEL=chrome to use an installed Chrome. Writes DEMO_OUT/demo.mp4 (needs ffmpeg with libx264)."""
import asyncio, base64, os, tempfile, shutil
from playwright.async_api import async_playwright
BASE = "http://localhost:4000"
OUT = os.environ.get("DEMO_OUT", "demo")
NOTE = os.path.join(tempfile.gettempdir(), "dd-demo-note.png")
try:
    from PIL import Image, ImageDraw
    im = Image.new("RGB", (640, 260), "white"); d = ImageDraw.Draw(im)
    d.text((24, 24), "my notes: merge(a, l, m, r) copies both halves into tmp[]", fill="black"); im.save(NOTE)
except Exception:
    open(NOTE, "wb").write(base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="))

CAP_JS = """(t)=>{
if(!document.getElementById('__capstyle')){const st=document.createElement('style');st.id='__capstyle';
st.textContent='html{overflow:hidden!important}body{height:calc(100vh - 72px)!important;overflow:auto!important}#__cap{position:fixed;left:0;right:0;bottom:0;height:72px;box-sizing:border-box;background:#23201a;color:#fff;font:600 16px/1.35 system-ui,sans-serif;padding:8px 16px;display:flex;align-items:center;justify-content:center;text-align:center;z-index:99999;pointer-events:none}';
document.head.appendChild(st);const c=document.createElement('div');c.id='__cap';document.documentElement.appendChild(c);}
document.getElementById('__cap').textContent=t;}"""

async def cap(page, text, secs=3.5):
    await page.evaluate(CAP_JS, text)
    await page.wait_for_timeout(int(secs * 1000))

async def login(page, email, pw, who):
    await page.goto(BASE); await page.wait_for_selector("#email")
    await cap(page, f"Sign in as {who}", 2.5)
    await page.type("#email", email, delay=45); await page.type("#password", pw, delay=45)
    await page.click("button[type=submit]"); await page.wait_for_selector(".topbar"); await page.wait_for_timeout(1200)

async def logout(page):
    await page.evaluate(CAP_JS, ""); await page.click("text=Sign out"); await page.wait_for_selector("#email")

def assemble(parts):
    # parts: [(path, is_phone)] in play order. Phone-width clips are centred on a dark frame.
    import subprocess
    out = os.path.join(OUT, "demo.mp4")
    chains = []
    for i, (_, phone) in enumerate(parts):
        chains.append(f"[{i}:v]scale=-2:760,pad=1280:760:(ow-iw)/2:0:color=0x23201a,setsar=1[v{i}]" if phone
                      else f"[{i}:v]scale=1280:760,setsar=1[v{i}]")
    f = ";".join(chains) + ";" + "".join(f"[v{i}]" for i in range(len(parts))) + f"concat=n={len(parts)}:v=1:a=0[v]"
    args = ["ffmpeg", "-y", "-loglevel", "error"]
    for path, _ in parts: args += ["-i", path]
    subprocess.run(args + ["-filter_complex", f, "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], check=True)

CSS = ("body{margin:0;background:#f3ecdc;color:#23201a;font:20px/1.5 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}"
       ".s{width:980px;border:3px solid #23201a;background:#fff;box-shadow:8px 8px 0 #23201a;padding:36px 44px}"
       "h1{margin:0 0 14px;font-size:40px}h2{margin:0 0 12px;font-size:30px}li{margin:6px 0}code{background:#e9e2fb;padding:1px 6px}"
       ".tag{display:inline-block;background:#c8f169;border:2px solid #23201a;padding:2px 10px;font-weight:700;margin-bottom:12px}"
       "table{border-collapse:collapse;width:100%;font-size:18px}td,th{border:1px solid #23201a;padding:4px 10px;text-align:left}")

async def slide(page, html, secs):
    await page.set_content(f"<style>{CSS}</style><div class=s>{html}</div>")
    await page.wait_for_timeout(int(secs * 1000))

async def main():
    shutil.rmtree(OUT, ignore_errors=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel=os.environ.get("PW_CHANNEL") or None)
        ctx = await b.new_context(viewport={"width": 1280, "height": 760}, record_video_dir=OUT, record_video_size={"width": 1280, "height": 760})
        page = await ctx.new_page()

        await slide(page, "<span class=tag>DoubtDesk</span><h1>A doubt portal for students and educators</h1><p>Doubts now get buried in WhatsApp and Telegram groups. Educators cannot see what is unanswered, students cannot see whether anyone looked.</p><p><b>This demo follows one doubt from question to resolved</b>, then shows the Telegram bridge, phone width, and what is under the hood.</p>", 14)
        await slide(page, "<span class=tag>What you will see</span><h2>The full workflow</h2><ol><li>Student asks a doubt with code and a screenshot</li><li>Educator inbox: Needs reply, longest wait first</li><li>Work queue, similar earlier answers as an editable draft</li><li>Reply, follow-up, resolve, with the turn shown at every step</li><li>Telegram: link, ask, follow-up, photo, answer delivered back</li><li>Phone width, duplicate-submit protection, tests, schema, scale</li></ol>", 16)

        # 1. Student home
        await login(page, "aarav@doubtdesk.demo", "student123", "a student (Aarav)")
        await cap(page, "Student home shows only active doubts. Each one says whose turn it is.", 5)
        await page.click(".resolved-link a"); await page.wait_for_selector("text=Resolved doubts")
        await cap(page, "Resolved doubts live on their own page, so the home stays uncluttered.", 5)
        await page.click(".back-link a"); await page.wait_for_selector(".page-title")

        # 2. Ask a doubt with code and a screenshot
        await cap(page, "Ask a doubt: course, question, optional screenshot. Code keeps its formatting.", 3)
        await page.click("text=+ Ask a doubt"); await page.select_option("select", label="CS301 - Computer Science")
        await page.type("textarea", "My binary search never stops. It loops forever when I narrow the range with low = mid.\n```\nwhile (low < high) { mid = (low + high) / 2; low = mid; }\n```", delay=25)
        await page.set_input_files("input[type=file]", NOTE); await cap(page, "Screenshot attached.", 2.5)
        await page.click("button:has-text('Submit doubt')"); await page.wait_for_selector(".toast-ok")
        await cap(page, "After submitting the student lands on the doubt. Code renders as code.", 5)
        await logout(page)

        # 3. Educator: queue and answer reuse
        await login(page, "educator@doubtdesk.demo", "educator123", "the educator")
        await cap(page, "Inbox opens on Needs reply: longest wait first. Each row's lime button is the next step.", 6)
        await page.click(".tab:has-text('Open')"); await page.wait_for_timeout(1200)
        await cap(page, "Open doubts: Start working moves one to Ongoing...", 3)
        await page.locator(".doubt-card").first.locator("button:has-text('Start working')").click(); await page.wait_for_selector(".toast")
        await cap(page, "...with an Undo, so a mis-click costs nothing.", 4)
        await page.click(".tab:has-text('Needs reply')"); await page.wait_for_timeout(1000)
        await cap(page, "Work the queue opens the longest-waiting doubt and keeps going from there.", 4)
        await page.click("button:has-text('Work the queue')"); await page.wait_for_selector(".queue-bar")
        await cap(page, "Queue bar: how many are waiting, what is next, Skip, and a way back to the inbox.", 6)
        await page.click(".queue-bar button:has-text('Skip')"); await page.wait_for_timeout(1000)
        await cap(page, "Skip leaves a doubt for later. Skipped ones come back when the rest are done.", 4)
        for _ in range(8):
            if "binary search never" in (await page.locator(".thread-head").inner_text()).lower(): break
            await page.click(".queue-bar button:has-text('Skip')"); await page.wait_for_timeout(700)
        await cap(page, "A similar question was answered before in this course. Only the educator sees this.", 6)
        await page.click(".similar button:has-text('Use as draft')")
        await cap(page, "Use as draft copies the answer into the box. It is not sent. A student name in it would become a placeholder to edit out.", 6)
        await page.type(".reply-box textarea", "\n\nIn your loop, set low = mid + 1.", delay=25)
        await cap(page, "Edit, then Send & next sends it and opens the next waiting doubt.", 4)
        await page.click("button:has-text('Send & next')"); await page.wait_for_timeout(1500)
        await cap(page, "Next doubt, no trip back to the inbox.", 4)
        await page.click(".queue-bar a:has-text('Inbox')"); await page.wait_for_selector(".tabs"); await page.wait_for_timeout(800)
        await logout(page)

        # 4. Student reads, follows up, resolves
        await login(page, "aarav@doubtdesk.demo", "student123", "the student again")
        await cap(page, "The student's list highlights the doubt: 'Educator replied - your turn'.", 5)
        await page.locator(".doubt-row", has_text="binary search never").click(); await page.wait_for_selector(".msg")
        await cap(page, "Reading the reply. This page refreshes by itself, no reload needed.", 4)
        await page.type(".reply-box textarea", "That fixed it, thanks. Should mid be computed differently for huge arrays?", delay=30)
        await page.click(".reply-box button[type=submit]"); await page.wait_for_timeout(1500)
        await cap(page, "A follow-up puts the doubt back in the educator's queue.", 4)
        await logout(page)

        await login(page, "educator@doubtdesk.demo", "educator123", "the educator")
        await cap(page, "The follow-up is under Needs reply as 'Student replied', not buried.", 5)
        await page.locator(".doubt-card a", has_text="binary search never").click(); await page.wait_for_selector(".thread-head")
        await page.type(".reply-box textarea", "Yes: use low + (high - low) / 2 to avoid overflow.", delay=25)
        await page.click(".reply-box button[type=submit]"); await page.wait_for_timeout(1500)
        await logout(page)
        await login(page, "aarav@doubtdesk.demo", "student123", "the student")
        await page.locator(".doubt-row", has_text="binary search never").click(); await page.wait_for_selector(".msg")
        await cap(page, "The student closes the loop: 'This solved it - mark resolved'.", 4)
        await page.click("button:has-text('This solved it')"); await page.wait_for_timeout(1500)
        await page.click(".back-link a"); await page.wait_for_selector(".page-title"); await page.wait_for_timeout(800)
        await cap(page, "Resolved doubts leave the active home.", 4)

        v1 = await page.video.path(); await ctx.close()

        # 5. Phone width (own 390x844 recording, centred on a dark frame when assembled)
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, record_video_dir=OUT, record_video_size={"width": 390, "height": 844})
        page = await ctx.new_page()
        await login(page, "aarav@doubtdesk.demo", "student123", "the student, on a phone")
        await cap(page, "Student home on a phone: active doubts only, turn cue on each.", 5)
        await logout(page)
        await login(page, "educator@doubtdesk.demo", "educator123", "the educator, on a phone")
        await cap(page, "Educator inbox on a phone: five tabs, Work the queue, big tap targets.", 6)
        await page.locator(".doubt-card a").first.click(); await page.wait_for_selector(".thread-head")
        await cap(page, "Thread: header stays at the top while scrolling.", 3)
        await page.evaluate("document.body.scrollTo(0, 400)"); await cap(page, "Scrolled: no overlap, image fits.", 5)
        await logout(page)
        v2 = await page.video.path(); await ctx.close()

        ctx = await b.new_context(viewport={"width": 1280, "height": 760}, record_video_dir=OUT, record_video_size={"width": 1280, "height": 760})
        page = await ctx.new_page()
        # 6. Duplicate-submit protection
        await login(page, "sara@doubtdesk.demo", "student123", "another student (Sara)")
        await cap(page, "Appendix: double-clicking Submit still creates exactly one doubt.", 3)
        await page.click("text=+ Ask a doubt"); await page.select_option("select", label="MATH101 - Mathematics")
        await page.type("textarea", "Why is the derivative of ln(x) equal to 1/x?", delay=30)
        await page.dblclick("button:has-text('Submit doubt')"); await page.wait_for_selector(".toast-ok")
        await page.click(".back-link a"); await page.wait_for_selector(".page-title"); await page.wait_for_timeout(1000)
        n = await page.locator(".doubt-row", has_text="derivative of ln").count()
        await cap(page, f"Sara's list shows {n} copy of the doubt.", 5)
        await logout(page)
        v3 = await page.video.path(); await ctx.close()

        # 7. Telegram bridge against a local fake of the Bot API (no real bot)
        import subprocess, time
        fake = subprocess.Popen(["node", "scripts/fake-telegram.mjs", "4100", NOTE], stdout=subprocess.DEVNULL)
        env = dict(os.environ, PORT="4001", TELEGRAM_BOT_TOKEN="demo", TELEGRAM_API_BASE="http://localhost:4100",
                   TELEGRAM_DEFAULT_COURSE="CS301", UPLOAD_DIR=os.environ.get("UPLOAD_DIR", "server/uploads"))
        app2 = subprocess.Popen(["node", "server/src/index.js"], env=env, stdout=subprocess.DEVNULL)
        time.sleep(3)
        try:
            global BASE
            BASE = "http://localhost:4001"
            ctx = await b.new_context(viewport={"width": 1280, "height": 760}, record_video_dir=OUT, record_video_size={"width": 1280, "height": 760})
            page = await ctx.new_page()
            await slide(page, "<span class=tag>Bonus</span><h2>Telegram bridge</h2><p>The next part uses a <b>local fake of the Telegram Bot API</b>, not a real bot. The bridge code is the real one: it polls, saves images, links chats and sends replies the same way.</p><ul><li>Student links their chat with a one-time code</li><li>Text and photos become a doubt; follow-ups join the same doubt</li><li>The educator answers in the portal; the answer goes back to the chat</li></ul>", 12)
            await login(page, "aarav@doubtdesk.demo", "student123", "the student (Aarav)")
            await cap(page, "Telegram is enabled, so the student home offers Connect Telegram.", 4)
            await page.click("button:has-text('Connect Telegram')"); await page.wait_for_selector("code")
            code = (await page.locator("code").first.inner_text()).replace("/start", "").strip()
            await cap(page, "A one-time code, valid 15 minutes. The student sends it to the bot.", 5)
            await page.goto("http://localhost:4100/__chat"); await page.wait_for_selector("#t")
            await cap(page, "Before linking, the bot knows nobody. Sending a question first:", 3)
            await page.type("#t", "why does my loop never end?", delay=40); await page.keyboard.press("Enter")
            await page.wait_for_selector("text=not connected"); await cap(page, "It refuses and explains how to connect. Nothing is created.", 5)
            await page.type("#t", f"/start {code}", delay=40); await page.keyboard.press("Enter")
            await page.wait_for_selector("text=Connected as"); await cap(page, "Linked to the student's account.", 4)
            await page.type("#t", "Why is the time complexity of merge sort n log n?", delay=35); await page.keyboard.press("Enter")
            await page.wait_for_selector("text=posted as doubt"); await cap(page, "The message became a doubt.", 4)
            await page.type("#t", "I already know it halves each time", delay=35); await page.keyboard.press("Enter")
            await page.wait_for_selector("text=Added to doubt"); await cap(page, "A follow-up joins the same doubt instead of starting a new one.", 5)
            await page.type("#t", "my recursion tree sketch", delay=35); await page.click("#p")
            await page.wait_for_function("document.querySelectorAll('.bot').length >= 4"); await cap(page, "Photos work too, with a caption.", 5)
            await page.goto(BASE); await page.wait_for_selector(".topbar"); await page.wait_for_timeout(500)
            await logout(page)
            await login(page, "educator@doubtdesk.demo", "educator123", "the educator")
            await page.locator(".doubt-card a", has_text="merge sort").first.click(); await page.wait_for_selector(".thread-head")
            await cap(page, "The educator sees the Telegram question, the follow-up and the photo in one thread.", 7)
            await page.type(".reply-box textarea", "Each level does n work and there are log n levels.", delay=25)
            await page.click(".reply-box button[type=submit]"); await page.wait_for_timeout(1500)
            await cap(page, "Reply sent from the dashboard.", 3)
            await page.goto("http://localhost:4100/__chat"); await page.wait_for_selector("text=Answer from")
            await cap(page, "The answer arrives in the student's Telegram chat.", 6)
            await page.goto(BASE); await page.wait_for_selector(".topbar"); await logout(page)

            # 8. Under the hood
            await slide(page, "<span class=tag>Data model</span><h2>Database: 8 tables, PostgreSQL</h2><table><tr><th>Table</th><th>Purpose</th></tr><tr><td>users, sessions</td><td>Student/educator roles; hashed tokens</td></tr><tr><td>courses, doubts</td><td>Doubt per student and course; status; idempotency key</td></tr><tr><td>messages, attachments</td><td>Ordered thread; images on a doubt or a message</td></tr><tr><td>telegram_link_codes, telegram_updates</td><td>Chat linking; each bot update handled once</td></tr></table><p>Full ER diagram: <code>docs/SCHEMA.md</code>. API: <code>docs/API.md</code>, <code>docs/openapi.yaml</code>.</p>", 16)
            await slide(page, "<span class=tag>Engineering</span><h2>Access control, errors, duplicates</h2><ul><li>Students see only their own doubts; educator-only routes return 403</li><li>Retried submissions create one doubt (idempotency token)</li><li>Telegram redeliveries and restarts never double-post</li><li>Images: type and size checked, access checked per file</li><li>JSON errors with fitting codes; no stack traces to clients</li></ul>", 14)
            await slide(page, "<span class=tag>Evidence</span><h2>Tests and volume</h2><ul><li>31 API tests, 23 browser checks on the queue, plus smoke and journey scripts and a Telegram end-to-end run</li><li>With 20,000 doubts: inbox lists 0.03 to 0.22 s, search over all 20,000 in 0.22 s (one machine, one request at a time)</li><li>Inbox is capped at 200 rows and says how many more match</li></ul>", 14)
            await slide(page, "<span class=tag>Honest limits</span><h2>What is not done</h2><ul><li>Telegram was run against a fake Bot API, not a real bot</li><li>Real-device phone, accessibility and concurrent-load tests not done</li><li>Search is ILIKE; polling not websockets; no email notifications</li><li>Details: <code>docs/ASSUMPTIONS.md</code></li></ul>", 14)
            v4 = await page.video.path(); await ctx.close()
        finally:
            app2.kill(); fake.kill()
        await b.close()
    assemble([(v1, False), (v2, True), (v3, False), (v4, False)])
    print("recorded to", OUT)

asyncio.run(main())
