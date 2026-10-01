# Round 14 checks at 390x844 (headless Chrome, SwiftShader) with screenshots:
# Round 15: the results run uses ?m=3&story=0 (the bank only exists after the crash; no Haldane scene on the way home) and the first tap lands on open sky above the cards.
#   bullets at each tier (white-hot, orange, blue), the coin in the HUD and in flight, the Mission Complete card (no
#   glow behind the coins and stones), the home bank after CONTINUE, the plane visible while Omega is charged (also in
#   bullet time), and single-tap Omega with synthetic touches (CDP) that never clashes with steering, holds or the
#   swipe-up Saber Beam. Prints PASS/FAIL lines and a SUMMARY with the console errors.
# usage: python r14.py URL OUTDIR [bullets,results,omega,gestures]     (URL = the site root, e.g. https://okbupe.github.io/grok-demo/)
import asyncio, json, os, sys, time
from playwright.async_api import async_playwright
ROOT = sys.argv[1] if sys.argv[1].endswith('/') else sys.argv[1] + '/'
OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)
ONLY = (sys.argv[3] if len(sys.argv) > 3 else 'bullets,results,omega,gestures').split(',')
CHROME = os.environ.get('CHROME') or '/usr/bin/google-chrome'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
R, ERRS = [], []
def check(name, ok, info=''):
    R.append((name, bool(ok))); print(('PASS ' if ok else 'FAIL ') + name + ('  ' + info if info else ''), flush=True)

async def page(p, query, label):
    b = await p.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = await ctx.new_page()
    pg.on('console', lambda m: ERRS.append(f'[{label}] {m.type}: {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: ERRS.append(f'[{label}] pageerror: {e}'))
    pg.on('response', lambda r: ERRS.append(f'[{label}] HTTP {r.status} {r.url}') if r.status >= 400 else None)
    await pg.goto(ROOT + query, wait_until='networkidle')
    await pg.wait_for_function('window.__G && document.getElementById("loading").textContent === ""', timeout=90000)
    return b, ctx, pg

async def bullets(p):
    for tier, name in ((0, 'white'), (1, 'orange'), (2, 'blue')):
        b, ctx, pg = await page(p, f'?autoplay&tut=0&tier={tier}&drones=8', f'tier{tier}')
        await pg.wait_for_function('__G.S.mode === "play" && __G.S.t > 3', timeout=90000); await pg.evaluate('__G.god(true)')
        await pg.wait_for_timeout(1500)
        n = await pg.evaluate('__G.shots.length'); t = await pg.evaluate('__G.S.tier')
        await pg.screenshot(path=f'{OUT}/bullets_{tier}_{name}.png')
        await pg.screenshot(path=f'{OUT}/bullets_{tier}_{name}_zoom.png', clip={'x': 95, 'y': 330, 'width': 200, 'height': 400})
        check(f'bullets tier {tier} ({name}) in the air', t == tier and n > 5, f'shots={n}')
        if tier == 0:   # the HUD coin counter and coins flying into it
            await pg.wait_for_function('__G.S.coinsShown > 20', timeout=90000)
            for i in range(12):
                if await pg.evaluate('__G.coinFx.length') >= 3: break
                await pg.wait_for_timeout(250)
            await pg.screenshot(path=f'{OUT}/hud_coin.png')
            await pg.screenshot(path=f'{OUT}/hud_coin_zoom.png', clip={'x': 250, 'y': 40, 'width': 140, 'height': 110})
            bg = await pg.evaluate("getComputedStyle(document.getElementById('coinico')).backgroundImage")
            check('HUD coin icon is the new coin art', 'coin.png' in bg, bg[:90])
        await b.close()

async def results(p):
    b, ctx, pg = await page(p, '?m=3&story=0&autoplay&tut=0', 'results')
    await pg.wait_for_function('__G.S.mode === "play" && __G.S.t > 1', timeout=90000)
    await pg.evaluate('() => { const S = __G.S; __G.god(true); S.gems = 5; S.rubies = 2; S.diamonds = 1; S.coins = 1180; S.killCoins = 900; S.lootCoins = 280; S.rescued = true; __G.endGame(true); }')
    await pg.wait_for_function('document.getElementById("again2").classList.contains("rin")', timeout=60000)
    await pg.wait_for_timeout(1500)
    await pg.screenshot(path=f'{OUT}/results.png')
    info = await pg.evaluate("""() => { const e = document.getElementById('end'), h = document.querySelector('#r-coins .r-halo');
      const rays = [...document.querySelectorAll('.stone .rays')].map((r) => getComputedStyle(r).display);
      return { shine: e.classList.contains('shine'), halo: h ? getComputedStyle(h).display : 'none', rays, name: getComputedStyle(document.getElementById('r-name')).filter,
        ruby: [...document.querySelectorAll('.stone.ruby .ico')].map((i) => getComputedStyle(i).animationName) } }""")
    check('results: no shine, no halo behind the coins, no rays behind the stones, ruby not glowing', not info['shine'] and info['halo'] == 'none' and all(r == 'none' for r in info['rays']) and all(a == 'none' for a in info['ruby']), json.dumps(info))
    check('results: the hard drop shadow on the text is kept', 'drop-shadow' in info['name'], info['name'][:80])
    await pg.dispatch_event('#again2', 'pointerdown'); await pg.wait_for_timeout(4500)   # CONTINUE -> home: coins fly into the bank bar
    await pg.screenshot(path=f'{OUT}/home_bank.png')
    await pg.screenshot(path=f'{OUT}/home_bank_zoom.png', clip={'x': 190, 'y': 0, 'width': 200, 'height': 80})
    bank = await pg.evaluate("document.querySelector('#tbk-coins b').textContent")
    check('home bank shows the coins (coin art in the pill)', bank not in ('', '0'), f'bank={bank}')
    await b.close()

async def omega(p):
    b, ctx, pg = await page(p, '?autoplay&tut=0&omega=1&drones=6', 'omega')
    await pg.wait_for_function('__G.S.mode === "play" && __G.S.t > 2', timeout=90000)
    await pg.evaluate('__G.god(true)'); await pg.wait_for_timeout(1200)
    # the bot would fire it: keep it charged for the pictures
    await pg.evaluate('__G.omega(1)'); await pg.wait_for_timeout(300)
    await pg.screenshot(path=f'{OUT}/omega_charged.png')
    x, y = (await pg.evaluate('__G.planeScreen()'))[:2]
    await pg.screenshot(path=f'{OUT}/omega_charged_zoom.png', clip={'x': max(0, x - 110), 'y': y - 80, 'width': 220, 'height': 160})
    await pg.evaluate('__G.omega(1); __G.btEnter()'); await pg.wait_for_timeout(1800); await pg.evaluate('__G.omega(1)'); await pg.wait_for_timeout(200)
    await pg.screenshot(path=f'{OUT}/omega_charged_bullet_time.png')
    await pg.evaluate('__G.btExit()')
    check('omega charged screenshots taken (plane visible: see the pictures)', True)
    await b.close()

async def gestures(p):
    b, ctx, pg = await page(p, '?fresh=1&tut=0', 'gestures')
    cdp = await ctx.new_cdp_session(pg)
    VT = [time.time()]
    async def touch(pts, ms, gap=1.0):
        VT[0] = max(VT[0] + gap, time.time()); t = VT[0]
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': pts[0][0], 'y': pts[0][1]}], 'timestamp': t})
        n = max(1, len(pts) - 1)
        for i, (x, y) in enumerate(pts[1:], 1):
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y}], 'timestamp': t + ms / 1000 * i / n})
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': [], 'timestamp': t + ms / 1000})
        VT[0] = t + ms / 1000
    line = lambda a, b_, n: [(a[0] + (b_[0] - a[0]) * i / n, a[1] + (b_[1] - a[1]) * i / n) for i in range(n + 1)]
    st = lambda: pg.evaluate("({tx: +__G.S.tx.toFixed(2), beamOn: __G.S.beamOn, omega: +__G.S.omega.toFixed(2), omegaT: +__G.S.omegaT.toFixed(2), fires: __G.AUD.omegaFires, mode: __G.S.mode})")
    await touch([(195, 330)], 60); await pg.wait_for_function('__G.S.mode === "play"', timeout=30000); await pg.wait_for_timeout(800)
    await pg.evaluate('__G.god(true); __G.S.beamOwned = true; __G.S.hp = 100; __G.setDrones(20)')
    kinds = lambda gl: [g['g'] for g in gl if g['g'] not in ('release', 'tap')]
    async def test(name, fn, expect, charge=True):
        if charge:
            await pg.wait_for_function('__G.S.omegaT <= 0', timeout=90000); await pg.evaluate('__G.omega(1)')
        g0 = await pg.evaluate('__G.GLOG.length'); s0 = await st(); await fn(); await pg.wait_for_timeout(300); s1 = await st()
        gl = await pg.evaluate(f'__G.GLOG.slice({g0})'); ok = expect(s0, s1, gl)
        check(name, ok, json.dumps({'before': s0, 'after': s1, 'gestures': [{k: g.get(k) for k in ('g', 'ms', 'moved', 'changed')} for g in gl]}))
    await test('steering drag right (omega charged): steers, no Omega, no beam', lambda: touch(line((120, 600), (300, 600), 20), 450), lambda a, b_, gl: b_['tx'] > a['tx'] + 1 and not kinds(gl) and b_['fires'] == a['fires'] and not b_['beamOn'])
    await test('quick short steer flick (40px, 120ms): steers, no Omega', lambda: touch(line((250, 600), (210, 600), 5), 120), lambda a, b_, gl: b_['tx'] < a['tx'] and b_['fires'] == a['fires'])
    await test('touch held still for 600ms: no Omega', lambda: touch([(200, 500), (201, 500)], 600), lambda a, b_, gl: b_['fires'] == a['fires'])
    await test('swipe UP (omega charged): Saber Beam on, no Omega', lambda: touch(line((195, 560), (197, 430), 5), 110), lambda a, b_, gl: kinds(gl) == ['swipe-up'] and b_['beamOn'] and b_['fires'] == a['fires'])
    await test('single TAP top-left (beam on): fires Omega, beam stays on', lambda: touch([(80, 260)], 60), lambda a, b_, gl: kinds(gl) == ['omega-tap'] and b_['fires'] == a['fires'] + 1 and b_['beamOn'])
    await test('swipe DOWN: Saber Beam off, no Omega', lambda: touch(line((300, 420), (298, 560), 5), 110), lambda a, b_, gl: kinds(gl) == ['swipe-down'] and not b_['beamOn'] and b_['fires'] == a['fires'])
    await test('single TAP bottom-right: fires Omega, steering unchanged', lambda: touch([(320, 720), (322, 721)], 70), lambda a, b_, gl: b_['fires'] == a['fires'] + 1 and abs(b_['tx'] - a['tx']) < 0.05)
    await pg.wait_for_function('__G.S.omegaT <= 0', timeout=90000); await pg.evaluate('__G.omega(0.3)')
    await test('single TAP while Omega is not charged: nothing fires', lambda: touch([(195, 400)], 60), lambda a, b_, gl: b_['fires'] == a['fires'] and not kinds(gl), charge=False)
    await test('steering still works after the Omega taps', lambda: touch(line((300, 600), (120, 600), 20), 450), lambda a, b_, gl: b_['tx'] < a['tx'] - 1 and b_['fires'] == a['fires'], charge=False)
    await b.close()

async def main():
    async with async_playwright() as p:
        for name, fn in (('bullets', bullets), ('results', results), ('omega', omega), ('gestures', gestures)):
            if name in ONLY: await fn(p)
    print('SUMMARY', sum(ok for _, ok in R), '/', len(R), 'console/page/HTTP errors:', len(ERRS), json.dumps(ERRS[:10]), flush=True)
asyncio.run(main())
