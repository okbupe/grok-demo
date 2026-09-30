# usage: tut.py URL OUTDIR MAXT  -> screenshots each bullet-time tutorial (and a mid-ease frame), prints AUD.tut/bt, errors
import os
import asyncio, sys, json, time
from playwright.async_api import async_playwright
URL, OUT, MAXT = sys.argv[1], sys.argv[2], float(sys.argv[3])
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME') or None, headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); errs = []
        pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: errs.append(f'pageerror: {e}'))
        await pg.goto(URL, wait_until='networkidle'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=f'{OUT}/intro_hand.png')
        await pg.mouse.click(12, 420)
        t0 = time.time(); seen = set(); mid = False; pk = False; last = -1
        while time.time() - t0 < MAXT:
            st = await pg.evaluate("() => { const G = window.__G; return { id: G.TUT.id, k: G.BT.k, p: G.BT.p, t: +G.S.t.toFixed(1), mode: G.S.mode, ended: G.S.ended, pops: G.AUD.pickups.length } }")
            if st['id'] and st['id'] not in seen:
                if not mid and st['p'] < 0.8:
                    await pg.wait_for_timeout(250); await pg.screenshot(path=f'{OUT}/bt_mid_ease.png'); mid = True
                    print('mid', await pg.evaluate('({k: __G.BT.k, s: __G.BT.s})'), flush=True)
                await pg.wait_for_function('__G.BT.p >= 1', timeout=10000); await pg.wait_for_timeout(700)
                await pg.screenshot(path=f'{OUT}/tut_{st["id"]}.png'); seen.add(st['id']); print('shot', st, flush=True)
            if int(st['t']) != last and int(st['t']) % 20 == 0: last = int(st['t']); print(json.dumps(st), flush=True)
            if st['ended']: break
            await pg.wait_for_timeout(100)
        A = await pg.evaluate('({tut: __G.AUD.tut, bt: __G.AUD.bt, btMin: __G.AUD.btMin, pickups: __G.AUD.pickups, done: __G.TUT.done, glog: __G.GLOG.slice(-40)})')
        print('AUD', json.dumps(A), flush=True)
        print('ERRORS', len(errs), errs[:10], flush=True)
        await b.close()
asyncio.run(main())
