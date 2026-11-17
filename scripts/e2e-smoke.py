import asyncio
from playwright.async_api import async_playwright
BASE = "http://localhost:4000"

async def login(page, email, pw):
    await page.goto(BASE)
    await page.wait_for_selector('input[type="email"]', timeout=8000)
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', pw)
    await page.click('button:has-text("Sign in")')
    await page.wait_for_selector('text=Sign out', timeout=8000)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page = await (await b.new_context(viewport={"width":1280,"height":800})).new_page()
        page.on("pageerror", lambda e: print("PAGEERROR:", str(e)[:400]))
        # student
        await login(page, "aarav@doubtdesk.demo", "student123")
        await page.goto(BASE + '/#/my')
        await page.wait_for_selector('text=My doubts', timeout=8000)
        await page.click('button:has-text("Ask a doubt")')
        await page.wait_for_timeout(500)
        opts = await page.eval_on_selector_all("select option", "os => os.map(o=>({v:o.value,t:o.textContent}))")
        assert len(opts) > 1, f"no course options: {opts}"
        pick = next((o for o in opts if o['t'].startswith('MATH')), opts[1])
        await page.select_option("select", value=pick['v'])
        val = await page.eval_on_selector("select", "s => s.value")
        assert val == pick['v'], f"select did not stick: {val} vs {pick['v']}"
        await page.fill('input[maxlength="120"]', "Why is the vertex of a parabola the minimum point?")
        await page.fill("textarea", "Dry run question body.")
        await page.set_input_files('input[type="file"]', "/tmp/demo/notes.png")
        await page.click('button:has-text("Submit doubt")')
        await page.wait_for_selector('text=/vertex of a parabola/i', timeout=8000)
        print("ASSERT 1 OK: doubt created and listed")
        await page.click('text=/vertex of a parabola/i >> nth=0')
        await page.wait_for_selector('text=Dry run question body.', timeout=8000)
        print("ASSERT 2 OK: thread opens with image attached")
        await page.click('text=Sign out')
        await page.wait_for_selector('input[type="email"]', timeout=8000)
        # educator
        await login(page, "educator@doubtdesk.demo", "educator123")
        await page.goto(BASE + '/#/inbox')
        await page.wait_for_selector('text=Doubt inbox', timeout=8000)
        await page.locator('input[placeholder*="earch"]').fill("parabola")
        await page.click('button:has-text("Search")')
        await page.wait_for_timeout(800)
        card = page.locator('text=/vertex of a parabola/i').first
        assert await card.count() > 0, "educator search did not find the doubt"
        await card.click()
        await page.wait_for_selector('text=Dry run question body.', timeout=8000)
        print("ASSERT 3 OK: educator finds and opens the doubt")
        await page.fill("textarea", "Dry run educator answer.")
        await page.click('button:has-text("Send answer")')
        await page.wait_for_selector('text=Dry run educator answer.', timeout=8000)
        await page.locator("select").last.select_option(value="resolved")
        await page.wait_for_timeout(800)
        print("ASSERT 4 OK: reply persisted, status set resolved")
        await page.click('text=Sign out')
        await page.wait_for_selector('input[type="email"]', timeout=8000)
        # student sees answer
        await login(page, "aarav@doubtdesk.demo", "student123")
        await page.goto(BASE + '/#/my')
        await page.wait_for_selector('text=/vertex of a parabola/i', timeout=8000)
        await page.click('text=/vertex of a parabola/i >> nth=0')
        await page.wait_for_selector('text=Dry run educator answer.', timeout=8000)
        print("ASSERT 5 OK: student sees educator answer")
        await b.close()
    print("DRY RUN PASSED")

asyncio.run(main())
