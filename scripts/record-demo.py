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
        await cap(page, "Ask a doubt: course, question, optional screenshot. Code fences keep their formatting.", 3)
        await page.click("text=+ Ask a doubt"); await page.select_option("select", label="CS301 - Computer Science")
        await page.type("textarea", "Why does my merge sort use O(n) extra space? Can it be done in place?\n```\nvoid merge(a, l, m, r) { /* copy to tmp */ }\n```", delay=25)
        await page.set_input_files("input[type=file]", NOTE); await cap(page, "Screenshot attached.", 2.5)
        await page.click("button:has-text('Submit doubt')"); await page.wait_for_selector(".toast-ok")
        await cap(page, "After submitting the student lands on the doubt with a clear confirmation. Code renders as code.", 6)
        await logout(page)

        # 3. Educator inbox
        await login(page, "educator@doubtdesk.demo", "educator123", "the educator")
        await cap(page, "Educator inbox opens on 'Needs reply': longest wait first, with how long each student has waited.", 6)
        await cap(page, "Primary action when you owe a reply is to reply. Moving a doubt between Open and Ongoing is one click.", 5)
        await page.click(".tab:has-text('Open')"); await page.wait_for_timeout(1500)
        row = page.locator(".doubt-card", has_text="merge sort")
        await cap(page, "Start working moves it to Ongoing...", 2.5)
        await row.locator("button:has-text('Start working')").click(); await page.wait_for_selector(".toast")
        await cap(page, "...with an Undo, so a mis-click is never costly.", 4)
        await page.click(".tab:has-text('Ongoing')"); await page.wait_for_timeout(1000)
        await cap(page, "It now appears under Ongoing. Tab, course and search live in the URL, so Back keeps your place.", 5)
        await page.locator(".doubt-card a", has_text="merge sort").click(); await page.wait_for_selector(".thread-head")
        await cap(page, "In the thread a banner says it is the educator's turn, and for how long the student has waited.", 5)
        await page.type(".reply-box textarea", "Use an in-place merge with rotations, or accept the O(n) buffer. Example:\n```\nrotate(a, m, r);\n```", delay=25)
        await cap(page, "Sending an answer marks the doubt Answered.", 2.5)
        await page.click("button:has-text('Send answer')"); await page.wait_for_timeout(1500)
        await cap(page, "Answered: now it is the student's turn. Resolving is offered only after the educator has replied.", 5)
        await logout(page)

        # 4. Student reads, follows up, resolves
        await login(page, "aarav@doubtdesk.demo", "student123", "the student again")
        await cap(page, "The student's list highlights the doubt: 'Educator replied - your turn'.", 5)
        await page.locator(".doubt-row", has_text="merge sort").click(); await page.wait_for_selector(".msg")
        await cap(page, "Reading the reply. This page refreshes by itself, no reload needed.", 4)
        await page.type(".reply-box textarea", "Thanks! Does the rotation version stay stable?", delay=30)
        await page.click("button:has-text('Send')"); await page.wait_for_timeout(1500)
        await cap(page, "A follow-up puts the doubt back in the educator's queue.", 4)
        await logout(page)

        await login(page, "educator@doubtdesk.demo", "educator123", "the educator")
        await cap(page, "The follow-up shows up under 'Needs reply' as 'Student replied', instead of being buried.", 6)
        await page.locator(".doubt-card a", has_text="merge sort").click(); await page.wait_for_selector(".thread-head")
        await page.type(".reply-box textarea", "Yes. Rotation-based merging is stable as long as you rotate whole runs.", delay=25)
        await page.click("button:has-text('Send answer')"); await page.wait_for_timeout(1500)
        await logout(page)
        await login(page, "aarav@doubtdesk.demo", "student123", "the student")
        await page.locator(".doubt-row", has_text="merge sort").click(); await page.wait_for_selector(".msg")
        await cap(page, "The student can close the loop: 'This solved it - mark resolved'.", 4)
        await page.click("button:has-text('This solved it')"); await page.wait_for_timeout(1500)
        await page.click(".back-link a"); await page.wait_for_selector(".page-title"); await page.wait_for_timeout(800)
        await cap(page, "Resolved doubts leave the active home. The educator sees it under Resolved.", 5)

        v1 = await page.video.path(); await ctx.close()

        # 5. Phone width (own 390x844 recording, centred on a dark frame when assembled)
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, record_video_dir=OUT, record_video_size={"width": 390, "height": 844})
        page = await ctx.new_page()
        await login(page, "aarav@doubtdesk.demo", "student123", "the student, on a phone")
        await cap(page, "Student home on a phone: active doubts only, turn cue on each.", 5)
        await logout(page)
        await login(page, "educator@doubtdesk.demo", "educator123", "the educator, on a phone")
        await cap(page, "Educator inbox: all five tabs visible, big tap targets.", 6)
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
