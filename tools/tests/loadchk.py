# usage: loadchk.py [BASE_URL] [OUTDIR]  -> loads the current build and every frozen /vN/ round with ?autoplay,
# checks the game clock is running after 5 s, and reports console errors, page errors and HTTP >= 400.
import os, sys, asyncio
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else 'https://okbupe.github.io/grok-demo/'
OUT = sys.argv[2] if len(sys.argv) > 2 else '.'
PATHS = [''] + [f'v{n}/' for n in range(2, 13)]   # add new frozen rounds here
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME') or None, headless=True, args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        for path in PATHS:
            ctx = await b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            pg = await ctx.new_page(); errs=[]
            pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('response', lambda r: errs.append(f'HTTP {r.status} {r.url}') if r.status>=400 else None)
            await pg.goto(BASE+path+'?autoplay', wait_until='networkidle'); await pg.wait_for_timeout(5000)
            t = await pg.evaluate('window.__G && window.__G.S ? +window.__G.S.t.toFixed(1) : null')
            title = await pg.evaluate("(document.querySelector('#prevver')||{}).textContent||''")
            await pg.screenshot(path=os.path.join(OUT, f'load_{path.strip("/") or "root"}.png'))
            print(path or '/', 'gameT', t, 'errors', errs, 'prevver', title.strip()[:80])
            await ctx.close()
        await b.close()
asyncio.run(main())
