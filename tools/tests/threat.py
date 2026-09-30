# usage: threat.py URL OUTPREFIX  -> waits for the boss hazard-tape warning, screenshots 4 frames, prints tape/name/plate boxes and __AUDIT.threat
import os
import asyncio, sys, json
from playwright.async_api import async_playwright
URL, OUT = sys.argv[1], sys.argv[2]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME') or None, headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); errs = []
        pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: errs.append(f'pageerror: {e}'))
        await pg.goto(URL, wait_until='networkidle'); await pg.wait_for_timeout(1000); await pg.mouse.click(12, 420)
        await pg.wait_for_function("document.getElementById('threat').className === 'show'", polling=50, timeout=400000)
        for i, ms in enumerate([700, 160, 160, 1000]):
            await pg.wait_for_timeout(ms); await pg.screenshot(path=f'{OUT}_{i}.png')
        m = await pg.evaluate('''() => { const o = {}; for (const s of ['.tape', '.tr-name', '.tr-sub']) { const r = document.querySelector('#threat ' + s).getBoundingClientRect(); o[s] = [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; }
          o.filter = getComputedStyle(document.getElementById('threat')).filter; o.aud = window.__AUDIT.threat; return o; }''')
        print(json.dumps(m)); print('ERRORS', errs); await b.close()
asyncio.run(main())
