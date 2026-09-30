# usage: gest.py URL  -> synthetic touch tests via CDP Input.dispatchTouchEvent at 390x844
import os
import asyncio, sys, json, time
from playwright.async_api import async_playwright
URL = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME') or None, headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); errs = []
        pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: errs.append(f'pageerror: {e}'))
        cdp = await ctx.new_cdp_session(pg)
        await pg.add_init_script("window.__PE=[];['pointerdown','pointerup','pointercancel','touchstart','touchend'].forEach(k=>addEventListener(k,e=>__PE.push([k,Math.round(e.timeStamp),e.pointerId||'']),true))")
        await pg.goto(URL, wait_until='networkidle'); await pg.wait_for_timeout(1200)
        VT = [time.time()]   # virtual clock: each CDP touch event carries the intended timestamp (swiftshader delays delivery)
        async def touch(pts, ms, gap=0.0):   # pts: path; spread over ms; gap = virtual idle before touch-down (s)
            VT[0] = VT[0] + gap if 0 < gap < 1 else max(VT[0] + gap, time.time()); t = VT[0]
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': pts[0][0], 'y': pts[0][1]}], 'timestamp': t})
            n = len(pts) - 1
            for i, (x, y) in enumerate(pts[1:], 1):
                await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y}], 'timestamp': t + ms / 1000 * i / n})
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': [], 'timestamp': t + ms / 1000})
            VT[0] = t + ms / 1000
        line = lambda a, b, n: [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n + 1)]
        st = lambda: pg.evaluate("({tx: +__G.S.tx.toFixed(2), px: +__G.S.px.toFixed(2), beamOn: __G.S.beamOn, omega: __G.S.omega, omegaT: +__G.S.omegaT.toFixed(2), fires: __G.AUD.omegaFires, glog: __G.GLOG.length, mode: __G.S.mode, t: +__G.S.t.toFixed(2)})")
        await touch([(195, 500)], 60); await pg.wait_for_timeout(800)   # tap to fly
        await pg.evaluate("__G.god(true); __G.S.beamOwned = true; __G.S.hp = 100; __G.setDrones(30)")
        R = []
        async def test(name, fn, expect):
            g0 = await pg.evaluate('__G.GLOG.length'); s0 = await st(); await fn(); await pg.wait_for_timeout(250); s1 = await st()
            gl = await pg.evaluate(f'__G.GLOG.slice({g0})'); ok = expect(s0, s1, gl)
            R.append((name, ok)); print(('PASS ' if ok else 'FAIL ') + name, json.dumps({'before': s0, 'after': s1, 'gestures': gl}), flush=True)
        kinds = lambda gl: [g['g'] for g in gl if g['g'] not in ('release', 'tap')]
        await pg.evaluate('__G.omega(1)')
        await test('slow horizontal drag right steers (omega full, beam owned)', lambda: touch(line((120, 600), (300, 600), 20), 450), lambda a, b, gl: b['tx'] > a['tx'] + 1 and not kinds(gl) and not b['beamOn'] and b['fires'] == a['fires'])
        await test('fast horizontal flick left steers only', lambda: touch(line((300, 520), (90, 530), 6), 110), lambda a, b, gl: b['tx'] < a['tx'] - 1 and not kinds(gl) and not b['beamOn'] and b['fires'] == a['fires'])
        await test('diagonal steer drag (dx 120, dy -70, 250ms) no beam', lambda: touch(line((100, 650), (220, 580), 10), 250), lambda a, b, gl: not kinds(gl) and not b['beamOn'])
        await test('zig-zag steering drags x3 no beam/omega', lambda: (touch(line((150, 600), (260, 610), 8), 160)), lambda a, b, gl: not kinds(gl) and b['fires'] == a['fires'])
        await test('drag right then flick up at end (sideways path > 34px) no beam', lambda: touch(line((100, 600), (200, 600), 6) + line((200, 600), (205, 480), 4)[1:], 250), lambda a, b, gl: not kinds(gl) and not b['beamOn'])
        await test('swipe UP top-left corner turns beam on', lambda: touch(line((60, 300), (64, 180), 5), 110), lambda a, b, gl: kinds(gl) == ['swipe-up'] and b['beamOn'] and abs(b['tx'] - a['tx']) < 0.05)
        await test('swipe DOWN bottom-right turns beam off', lambda: touch(line((330, 560), (326, 700), 5), 120), lambda a, b, gl: kinds(gl) == ['swipe-down'] and not b['beamOn'])
        await test('swipe UP mid-screen again on', lambda: touch(line((195, 520), (195, 400), 5), 100), lambda a, b, gl: kinds(gl) == ['swipe-up'] and b['beamOn'])
        await test('swipe DOWN top edge off', lambda: touch(line((200, 120), (200, 250), 5), 100), lambda a, b, gl: kinds(gl) == ['swipe-down'] and not b['beamOn'])
        async def one(): await touch([(90, 250)], 60, 1)
        await test('single tap (omega full) does not fire', one, lambda a, b, gl: b['fires'] == a['fires'])
        await pg.wait_for_timeout(500)
        async def two_slow(): await touch([(90, 250)], 60, 1); await touch([(92, 252)], 60, 0.45)
        await test('two taps 450ms apart do not fire', two_slow, lambda a, b, gl: b['fires'] == a['fires'])
        await pg.wait_for_timeout(500)
        async def two_far(): await touch([(60, 250)], 60, 1); await touch([(300, 600)], 60, 0.12)
        await test('two quick taps far apart do not fire', two_far, lambda a, b, gl: b['fires'] == a['fires'])
        await pg.wait_for_timeout(500)
        async def dbl(): await touch([(80, 260)], 60, 1); await touch([(84, 263)], 60, 0.12)
        await test('DOUBLE TAP top-left fires omega', dbl, lambda a, b, gl: b['fires'] == a['fires'] + 1 and 'dbltap' in kinds(gl))
        await pg.wait_for_function('__G.S.omegaT <= 0', timeout=60000); await pg.wait_for_timeout(300); await pg.evaluate('__G.omega(1)')
        async def dbl2(): await touch([(320, 700)], 50, 1); await touch([(318, 698)], 50, 0.15)
        await test('DOUBLE TAP bottom-right fires omega', dbl2, lambda a, b, gl: b['fires'] == a['fires'] + 1)
        print('PE', await pg.evaluate('__PE.slice(-16)'))
        print('SUMMARY', sum(ok for _, ok in R), '/', len(R), 'ERRORS', len(errs), errs[:5], flush=True)
        await b.close()
asyncio.run(main())
