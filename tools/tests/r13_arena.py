# usage: r13_arena.py URL  -> round 13 arena fixes (critic C2): tap-ending a tutorial never makes a double tap, keyboard
# focus never opens a panel over a run, the title's reward effects stop when a run starts, SHOT DOWN skips on a tap and
# reaches its buttons in about 2 s, a tutorial cut short is not marked as seen.
import asyncio, sys, json, time
from playwright.async_api import async_playwright
URL = sys.argv[1].rstrip('/') + '/'
CH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
R = []
def rec(name, ok, info=''): R.append((name, ok)); print(('PASS ' if ok else 'FAIL ') + name, json.dumps(info)[:300], flush=True)

async def page(b, q, touch=True, vw=390, vh=844):
    ctx = await b.new_context(viewport={'width': vw, 'height': vh}, device_scale_factor=1, is_mobile=touch, has_touch=touch)
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    await pg.goto(URL + q, wait_until='networkidle')
    await pg.wait_for_function('window.__G && document.getElementById("loading").textContent === ""', timeout=60000)
    cdp = await ctx.new_cdp_session(pg) if touch else None
    T = [time.time()]
    async def tap(x, y, gap=0.3, ms=0.06):
        T[0] += gap
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}], 'timestamp': T[0]})
        T[0] += ms
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': [], 'timestamp': T[0]})
    return ctx, pg, tap, errs

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CH, headless=True, args=ARGS)
        # 1) the tap that ends a tap tutorial must not pair with the next tap into a double tap (Omega)
        ctx, pg, tap, errs = await page(b, '?tut=1')
        await tap(195, 700); await pg.wait_for_function("['gates', 'cans'].includes(__G.TUT.id)", timeout=300000, polling=200)
        first = await pg.evaluate('__G.TUT.id'); await pg.wait_for_timeout(600); g0 = await pg.evaluate('__G.GLOG.length')
        await tap(200, 500, 0.3); await tap(203, 502, 0.12); await pg.wait_for_timeout(800)
        gl = await pg.evaluate(f'__G.GLOG.slice({g0}).map(e => e.g)')
        rec('a double tap that ends a tap tutorial is not read as a double tap (Omega)', 'dbltap' not in gl and first in (await pg.evaluate('__G.TUT.done')), {'tut': first, 'gestures': gl})
        # 5) a tutorial cut short (back to the title) is not marked as seen
        other = 'cans' if first == 'gates' else 'gates'
        await pg.wait_for_function(f"__G.TUT.id === '{other}'", timeout=300000, polling=200)
        await pg.evaluate('__G.goHome()'); await pg.wait_for_timeout(500)
        done = await pg.evaluate('__G.TUT.done')
        rec('a tutorial cut short is not marked as seen', other not in done and first in done, {'cut': other, 'done': done})
        await ctx.close()
        # 2) desktop: click a card, Escape, Enter: the run starts and no panel opens over it
        ctx, pg, tap, errs2 = await page(b, '?tut=0', touch=False, vw=1280, vh=800)
        card = await pg.query_selector('#tc-workshop, .tcard.workshop, [data-open="workshop"]')
        if card: await card.click()
        else: await pg.mouse.click(640, 400)
        await pg.wait_for_timeout(700); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(600)
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(1500)
        st = await pg.evaluate("({mode: __G.S.mode, panel: !document.getElementById('meta').classList.contains('hidden') && document.getElementById('meta').className})")
        rec('desktop: Enter after closing a panel starts the run with no panel over it', st['mode'] == 'play' and not st['panel'], {'card': bool(card), **st})
        await ctx.close()
        # 3) the title's reward effects (coins flying into the bank) stop when a run starts
        ctx, pg, tap, errs3 = await page(b, '?tut=0')
        await pg.evaluate("JCMETA.bankAdd({coins: 900, gems: 3, rubies: 1, diamonds: 0}); __G.goHome()")
        await pg.wait_for_timeout(700); n0 = await pg.evaluate("document.getElementById('mfx').children.length")
        await pg.evaluate('__G.start()'); await pg.wait_for_timeout(1500)
        n1 = await pg.evaluate("({fx: document.getElementById('mfx').children.length, mode: __G.S.mode})")
        rec('the title reward effects stop when a run starts', n1['mode'] == 'play' and n1['fx'] == 0, {'flyingOnTitle': n0, **n1})
        # 4) SHOT DOWN: a tap skips to the end with the buttons in; untouched, the buttons arrive by about 2 s
        await pg.evaluate('__G.hurt(200)'); await pg.wait_for_function("!document.getElementById('end').classList.contains('hidden')", timeout=60000)
        t0 = time.time(); await pg.wait_for_function("document.getElementById('lose').classList.contains('btns')", timeout=60000, polling=50)
        w = round(time.time() - t0, 2); rec('SHOT DOWN: the buttons arrive by about 2 s (under 2.4 s wall time; was 2.7 s)', w < 2.4, {'wall_s': w})
        await pg.evaluate('__G.start()'); await pg.wait_for_timeout(500); await pg.evaluate('__G.hurt(200)')
        await pg.wait_for_function("!document.getElementById('end').classList.contains('hidden')", timeout=60000)
        await pg.wait_for_timeout(700); await tap(195, 200); await pg.wait_for_timeout(400)
        s = await pg.evaluate("({btns: document.getElementById('lose').classList.contains('btns'), coins: document.getElementById('l-coinN').textContent, want: String(__G.S.coins)})")
        rec('SHOT DOWN: a tap skips to the end (buttons in, coins counted)', s['btns'] and s['coins'].replace(',', '') == s['want'], s)
        rec('no console or page errors', not (errs + errs2 + errs3), (errs + errs2 + errs3)[:5])
        await ctx.close(); await b.close()
    print('SUMMARY', sum(ok for _, ok in R), '/', len(R), flush=True)
asyncio.run(main())
