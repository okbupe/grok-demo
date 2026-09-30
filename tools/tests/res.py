# usage: res.py URL OUTPREFIX MODE(seq|skip:MS) [MAXT]
import os
import asyncio, sys, json, time
from playwright.async_api import async_playwright
URL, OUT, MODE = sys.argv[1], sys.argv[2], sys.argv[3]; MAXT = float(sys.argv[4]) if len(sys.argv) > 4 else 420
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME') or None, headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); errs = []
        pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('response', lambda r: errs.append(f'HTTP {r.status} {r.url}') if r.status >= 400 else None)
        pg.on('pageerror', lambda e: errs.append(f'pageerror: {e}'))
        await pg.goto(URL, wait_until='networkidle'); await pg.wait_for_timeout(1200)
        await pg.screenshot(path=f'{OUT}_title.png')
        await pg.mouse.click(12, 420)
        t0 = time.time(); help_shot = False; last = -1; banners = []
        while time.time() - t0 < MAXT:
            st = await pg.evaluate('''() => { const G = window.__G; if (!G || !G.S) return null; const S = G.S; const b = document.getElementById('banner');
              return { t: +S.t.toFixed(1), mode: S.mode, drones: S.drones, hp: Math.round(S.hp), coins: S.coins, gems: S.gems, rubies: S.rubies, dia: S.diamonds, kills: S.kills, ended: S.ended,
                help: G.cocoons.some(c => c.stage < 2 && c.state === 'hold'), ban: b.className.includes('show') ? b.textContent + (b.className.includes('warn') ? ' [warn]' : '') : '' } }''')
            if st is None: await pg.wait_for_timeout(300); continue
            if st['ban'] and (not banners or banners[-1][1] != st['ban']): banners.append((st['t'], st['ban']))
            if st['help'] and not help_shot:
                await pg.wait_for_timeout(700); await pg.screenshot(path=f'{OUT}_help.png'); help_shot = True; print('shot help', st['t'], flush=True)
            if int(st['t']) != last and int(st['t']) % 10 == 0: last = int(st['t']); print(json.dumps(st), flush=True)
            if st['ended']: break
            await pg.wait_for_timeout(150)
        R = await pg.evaluate('window.__AUDIT.results'); T = R['timeline']
        print('RESULTS', json.dumps({k: v for k, v in R.items() if k not in ('timeline', 'killsBy')}), flush=True)
        print('TIMELINE', json.dumps(T), flush=True)
        async def at(ms):
            await pg.wait_for_function(f'performance.now() - window.__AUDIT.results.t0 >= {ms}', polling='raf', timeout=60000)
        async def snap(name, ms):
            await at(ms); el = await pg.evaluate('performance.now() - window.__AUDIT.results.t0')
            coin = await pg.evaluate("document.getElementById('r-coinN').textContent"); dr = await pg.evaluate("document.getElementById('r-droneN').textContent")
            await pg.screenshot(path=f'{OUT}_{name}.png'); print(f'frame {name} @{int(el)}ms coins={coin} drones={dr}', flush=True)
        if MODE == 'seq':
            beats = [('01_stomp', 700), ('02_coins', (T['c0'] + T['c1']) / 2), ('03_coinsdone', T['c1'] + 150), ('04_drones', T['d0'] + (T['d1'] - T['d0']) * 0.45),
                     ('05_starpulse', T['s0'] + 380), ('06_starpunch', T['s1'] + 140)]
            for i, a in enumerate(T['stones']): beats.append((f'07_stone{i}', a + 330))
            beats += [('08_final', T['f'] + 250), ('09_continue', T['btn'] + 900)]
            for n, ms in beats: await snap(n, ms)
        else:
            ms = int(MODE.split(':')[1]); await at(ms)
            pre = await pg.evaluate("document.getElementById('r-coinN').textContent")
            await pg.mouse.click(200, 470); await pg.wait_for_timeout(700)
            await pg.screenshot(path=f'{OUT}_skipped.png'); print('skip tapped at', ms, 'coins before', pre, flush=True)
        await pg.wait_for_timeout(1500)
        R = await pg.evaluate('window.__AUDIT.results')
        vis = await pg.evaluate("[...document.querySelectorAll('#res > *, .stone')].map(e => e.id || e.className).join(' ') + ' | btn visible: ' + (getComputedStyle(document.getElementById('again2')).visibility) + ' label: ' + document.getElementById('again2').textContent")
        final_dom = await pg.evaluate("document.getElementById('r-coinN').textContent")
        import math; jr = lambda x: math.floor(x + 0.5); exp = jr((R['stage'] + jr(R['drones'] * R['droneCoinBase'] * R['droneCoinMult'])) * R['starMult'])
        print('MATH', f"stage {R['stage']} (kills {R['killCoins']} + loot {R['lootCoins']}) + drones {R['drones']} x {R['droneCoinBase']} x {R['droneCoinMult']} = {R['droneBonus']} -> {R['preStar']} x star {R['starMult']} ({R['stars']}*) = {R['final']}; py-expected {exp}; DOM {final_dom}; shown {R['shown']}; skipped {R.get('skipped')}", flush=True)
        print('OK' if int(final_dom) == exp == R['final'] == R['shown'] else 'MISMATCH', flush=True)
        print('STONES', R['gems'], R['rubies'], R['diamonds'], '| rubies log', json.dumps((await pg.evaluate('window.__AUDIT.rubies'))))
        print('BANNERS', json.dumps(banners)); print('HELPFRAMES', await pg.evaluate('window.__AUDIT.help || 0'))
        print('VIS', vis)
        print('TUTAUD', json.dumps(await pg.evaluate('({tut: __G.AUD.tut, bt: __G.AUD.bt, btMin: __G.AUD.btMin, pickups: __G.AUD.pickups.length, threat: __G.AUD.threat && __G.AUD.threat.t})')))
        print('ERRORS', json.dumps(errs, indent=1))
        await b.close()
asyncio.run(main())
