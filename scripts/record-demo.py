"""Records the silent demo walkthrough (demo.mp4) against a seeded app on :4000.
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

def assemble(v1, v2, v3):
    import subprocess
    out = os.path.join(OUT, "demo.mp4")
    f = ("[0:v]scale=1280:760,setsar=1[a];[1:v]scale=-2:760,pad=1280:760:(ow-iw)/2:0:color=0x23201a,setsar=1[b];"
         "[2:v]scale=1280:760,setsar=1[c];[a][b][c]concat=n=3:v=1:a=0[v]")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", v1, "-i", v2, "-i", v3, "-filter_complex", f,
                    "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], check=True)

async def main():
    shutil.rmtree(OUT, ignore_errors=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel=os.environ.get("PW_CHANNEL") or None)
        ctx = await b.new_context(viewport={"width": 1280, "height": 760}, record_video_dir=OUT, record_video_size={"width": 1280, "height": 760})
        page = await ctx.new_page()

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
        v3 = await page.video.path(); await ctx.close(); await b.close()
    assemble(v1, v2, v3)
    print("recorded to", OUT)

asyncio.run(main())
