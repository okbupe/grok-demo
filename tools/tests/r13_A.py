# usage: r13_A.py URL [SHOTDIR]  -> round 13, area A checks (home screen, meta layer, end screens) at 390x844 with touch.
# Each check runs in a fresh browser context (its own localStorage) and prints PASS or FAIL; SUMMARY at the end.
# With SHOTDIR it also saves DPR 2 screenshots (title, every panel, the Workshop before and after a purchase, SHOT DOWN, the hand).
import os, sys, json, time, asyncio
from playwright.async_api import async_playwright
URL = sys.argv[1].rstrip('/') + '/'
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
CHROME = os.environ.get('CHROME') or '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
R, ERRS = [], []
READY = 'window.__G && document.getElementById("loading") && document.getElementById("loading").textContent === ""'
SHEET_IN = "!!document.querySelector('#meta.in') && getComputedStyle(document.querySelector('#meta .m-sheet')).transform === 'none'"
CLOSED = "!document.getElementById('meta') || document.getElementById('meta').classList.contains('hidden')"

async def wait(pg, js, ms=20000):   # the headless browser renders slowly: wait for the state, not for a fixed time
    try: await pg.wait_for_function(js, timeout=ms); return True
    except Exception: return False

def ok(name, cond, info=''):
    R.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name, info if isinstance(info, str) else json.dumps(info), flush=True)

async def page(b, q='?tut=0', pre=None, dpr=1, w=390, h=844):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr, is_mobile=True, has_touch=True)
    pg = await ctx.new_page()
    pg.on('console', lambda m: ERRS.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: ERRS.append(f'pageerror: {e}'))
    if pre: await pg.add_init_script(pre)
    await pg.goto(URL + q, wait_until='networkidle'); await pg.wait_for_function(READY, timeout=40000); await pg.wait_for_timeout(500)
    cdp = await ctx.new_cdp_session(pg); vt = [time.time()]
    async def tap(x, y, ms=60):   # a touch tap with explicit timestamps on a virtual clock (tools/tests/gest.py)
        vt[0] = max(vt[0] + 1, time.time()); t = vt[0]
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}], 'timestamp': t})
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': [], 'timestamp': t + ms / 1000})
    async def tap_el(sel):
        r = await pg.evaluate(f"(() => {{ const e = document.querySelector({json.dumps(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; }})()")
        if r: await tap(r[0], r[1])
        return r
    pg.tap, pg.tap_el, pg.ctx = tap, tap_el, ctx
    return pg

async def shot(pg, name):
    if SHOTS: await pg.screenshot(path=os.path.join(SHOTS, name)); print('  shot', name, flush=True)

async def ev(pg, js, default=None):
    try: return await pg.evaluate(js)
    except Exception as e: return default

async def check_title(b):
    pg = await page(b)
    t = await ev(pg, """(() => { const s = document.getElementById('start'), vis = (id) => { const e = document.getElementById(id); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 20 && getComputedStyle(e).visibility !== 'hidden'; };
      return { text: s.innerText, mission: !!document.getElementById('t-mission') && document.getElementById('t-mission').innerText.replace(/\\s+/g, ' ').trim(),
        icons: ['tb-base', 'tb-store', 'tb-settings'].map(vis), cards: ['tc-depot', 'tc-hangar', 'tc-workshop'].map(vis), bank: vis('t-bank'), rank: !!document.querySelector('#t-mission .rank.c') }; })()""", {})
    ok('title: no GROK DEMO text', t and 'GROK DEMO' not in t.get('text', 'GROK DEMO').upper(), t.get('text', '')[:80] if t else '')
    m = (t or {}).get('mission') or ''
    ok('title: mission block (MISSION 1, GET TO BEACON, MISSION THREAT + C rank)', 'MISSION 1' in m and 'GET TO BEACON' in m and 'MISSION THREAT' in m and t.get('rank'), m)
    ok('title: Base, Store and Settings icons and the bank bar', t and all(t.get('icons', [False])) and t.get('bank'), t)
    ok('title: Depot, Hangar and Workshop cards', t and all(t.get('cards', [False])), t)
    await pg.ctx.close()

async def check_taps(b):
    pg = await page(b)
    res = {}
    for sel, pid in [('#tb-base', 'base'), ('#tb-store', 'store'), ('#tb-settings', 'settings'), ('#tc-depot', 'depot'), ('#tc-hangar', 'hangar'), ('#tc-workshop', 'workshop')]:
        at = await pg.tap_el(sel); await wait(pg, SHEET_IN); await pg.wait_for_timeout(200)
        st = await ev(pg, "[window.JCMETA && JCMETA.panel, __G.S.mode, !!document.querySelector('#meta.in')]", [None, None, False])
        closed = None
        if st[0] == pid:   # close it with the close button, then check the run did not start
            await pg.tap_el('#meta .m-close'); await wait(pg, CLOSED); await pg.wait_for_timeout(200)
            closed = await ev(pg, "[JCMETA.panel, __G.S.mode, document.getElementById('meta').className]")
        res[pid] = {'at': at, 'open': st, 'closed': closed}
        ok(f'tap {sel} opens the {pid} panel and does not start the game', at and st[0] == pid and st[1] == 'title' and st[2] and closed and closed[0] is None and closed[1] == 'title', res[pid])
    # tap outside the sheet closes it
    await ev(pg, "JCMETA.open('settings')"); await wait(pg, SHEET_IN)
    await pg.tap(30, 30); await wait(pg, CLOSED); await pg.wait_for_timeout(200)
    st = await ev(pg, "[JCMETA.panel, __G.S.mode]", [1, 1])
    ok('tap outside a panel closes it', st == [None, 'title'], st)
    # taps on the bank bar and the gaps between the cards never start a run
    await pg.tap_el('#tbk-coins'); await pg.wait_for_timeout(300)
    r = await ev(pg, "(() => { const a = document.getElementById('tc-depot').getBoundingClientRect(), b = document.getElementById('tc-hangar').getBoundingClientRect(); return [(a.right + b.left) / 2, a.top + a.height / 2]; })()", [0, 0])
    await pg.tap(r[0], r[1]); await pg.wait_for_timeout(400)
    st = await ev(pg, "__G.S.mode")
    ok('taps on the bank bar and between the cards do not start a run', st == 'title', st)
    # Chrome's touch adjustment can snap a tap in the 10px gap onto the nearest card, which opens it: close it again
    if await ev(pg, "!!JCMETA.panel"): await wait(pg, SHEET_IN); await ev(pg, "JCMETA.close()")
    await wait(pg, CLOSED); await pg.wait_for_timeout(200)
    await pg.tap(195, 560); await wait(pg, "__G.S.mode === 'play'", 5000)
    st = await ev(pg, "__G.S.mode")
    ok('tapping empty space starts the game', st == 'play', st)
    await pg.ctx.close()

async def check_workshop(b):
    pre = "if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', 1); localStorage.setItem('jc.bank', JSON.stringify({ coins: 5000, gems: 10, rubies: 0, diamonds: 0 })); }"
    pg = await page(b, pre=pre, dpr=2 if SHOTS else 1)
    b0 = await ev(pg, "JCMETA.bank()", {})
    m0 = await ev(pg, "JCMETA.mult('rev')")
    await ev(pg, "JCMETA.open('workshop')"); await wait(pg, SHEET_IN)
    await pg.wait_for_timeout(500); await shot(pg, 'panel_workshop_before.png')
    at = await pg.tap_el(".ws-card.rev .ws-buy"); await wait(pg, "!document.querySelector('.ws-card.busy')", 8000); await pg.wait_for_timeout(700)
    b1 = await ev(pg, "JCMETA.bank()", {}); w1 = await ev(pg, "JSON.parse(localStorage.getItem('jc.workshop') || 'null')")
    m1 = await ev(pg, "JCMETA.mult('rev')"); card = await ev(pg, "[document.querySelectorAll('.ws-card.rev .ws-pips i.on').length, document.querySelector('.ws-card.rev .ws-mult').innerText]")
    ok('Workshop: buying a Revenue pip deducts 250 coins, fills a pip and raises the multiplier to x1.1',
       at and b0.get('coins') == 5000 and b1.get('coins') == 4750 and m0 == 1 and m1 == 1.1 and w1 and w1.get('rev') == 1 and card and card[0] == 1, {'before': b0, 'after': b1, 'mult': [m0, m1], 'ws': w1, 'card': card})
    await shot(pg, 'panel_workshop_after.png')
    await pg.reload(wait_until='networkidle'); await pg.wait_for_function(READY, timeout=40000)
    p = await ev(pg, "[JCMETA.bank().coins, JCMETA.workshop().rev, JCMETA.mult('rev')]")
    ok('Workshop: the purchase persists across a reload', p == [4750, 1, 1.1], p)
    # the pip costs, the milestone (gems plus coins) and the multiplier maths from the table
    seq = await ev(pg, """(() => { const out = []; for (let i = 0; i < 6; i++) { const t = JCMETA.track('dmg'); const r = JCMETA.buy('dmg'); out.push([t.cost.coins, t.cost.gems, t.milestone, r ? r.after.mult : null]); } return [out, JCMETA.bank(), JCMETA.track('dmg').level]; })()""")
    exp = [[250, 0, False, 1.05], [340, 0, False, 1.1], [460, 0, False, 1.15], [620, 0, False, 1.2], [830, 0, False, 1.25], [1700, 2, True, 1.5]]
    ok('Workshop: pip costs 250 x 1.35^n (2 s.f.), the milestone costs 2 gems plus coins and jumps the level', seq and seq[0] == exp and seq[2] == 2 and seq[1]['gems'] == 8, seq)
    # unaffordable: the button greys, the cost goes red, nothing is bought, never negative
    await ev(pg, "localStorage.setItem('jc.bank', JSON.stringify({ coins: 10, gems: 0, rubies: 0, diamonds: 0 }))")
    await pg.reload(wait_until='networkidle'); await pg.wait_for_function(READY, timeout=40000)
    await ev(pg, "JCMETA.open('workshop')"); await wait(pg, SHEET_IN)
    await pg.tap_el(".ws-card.rate .ws-buy"); await pg.wait_for_timeout(900)
    u = await ev(pg, "[JCMETA.bank().coins, JCMETA.workshop().rate, document.querySelector('.ws-card.rate .ws-buy').classList.contains('off'), !!document.querySelector('.ws-card.rate .wb-c .no')]")
    ok('Workshop: unaffordable upgrades are greyed with a red cost and buy nothing', u == [10, 0, True, True], u)
    await pg.ctx.close()

async def coins_per_crawler(b, pre):
    pg = await page(b, q='?tut=0&warp=4&autoplay', pre=pre)
    await ev(pg, "__G.god(true)")
    try: await pg.wait_for_function("(__G.S.killsBy.spider || 0) >= 30 || __G.S.t > 20", timeout=150000)
    except Exception: pass
    r = await ev(pg, "[__G.AUD.coins.spider || 0, __G.S.killsBy.spider || 0, JCMETA.mult('rev'), +__G.S.t.toFixed(1)]", [0, 0, 0, 0])
    await pg.ctx.close(); return r

async def check_run_mults(b):
    a = await coins_per_crawler(b, None)
    pre = "localStorage.setItem('jc.bank', JSON.stringify({ coins: 99999, gems: 99, rubies: 0, diamonds: 0 })); localStorage.setItem('jc.workshop', JSON.stringify({ rate: 0, dmg: 0, rev: 5 }));"
    c = await coins_per_crawler(b, pre)
    ra = a[0] / max(1, a[1]); rc = c[0] / max(1, c[1])
    ok('a run after buying Revenue pays more coins per crawler (same warp)', a[1] >= 10 and c[1] >= 10 and abs(ra - 1) < 1e-9 and rc >= 1.4 and c[2] == 1.5, {'x1': a, 'x1.5': c, 'per kill': [round(ra, 3), round(rc, 3)]})

async def check_settings(b):
    pg = await page(b)
    await pg.tap_el('#tb-settings'); await wait(pg, SHEET_IN)
    await pg.tap_el('.st-tog[data-k="sfx"]'); await pg.wait_for_timeout(300)
    await pg.tap_el('.st-tog[data-k="vibe"]'); await pg.wait_for_timeout(300)
    s1 = await ev(pg, "[JSON.parse(localStorage.getItem('jc.settings') || 'null'), __G.S.mode]")
    ok('Settings: toggles save to jc.settings and do not start a run', s1 and s1[0] and s1[0].get('sfx') is False and s1[0].get('vibe') is False and s1[0].get('music') is True and s1[1] == 'title', s1)
    await pg.reload(wait_until='networkidle'); await pg.wait_for_function(READY, timeout=40000)
    await ev(pg, "JCMETA.open('settings')"); await wait(pg, SHEET_IN)
    s2 = await ev(pg, "[JCMETA.settings.sfx, JCMETA.settings.vibe, document.querySelector('.st-tog[data-k=sfx]').classList.contains('on'), JCMETA.api.audio()]")
    ok('Settings: they persist across a reload', s2 and s2[0] is False and s2[1] is False and s2[2] is False, s2)
    await pg.tap(30, 30); await wait(pg, CLOSED)
    await pg.tap(195, 560); await wait(pg, "__G.S.mode === 'play'", 5000); await pg.wait_for_timeout(800)   # starts a run: the audio exists now
    a = await ev(pg, "JCMETA.api.audio()", {})
    ok('Settings: Sound effects off makes the master gain 0 once the audio exists', a and a.get('ctx') and a.get('master') == 0 and a.get('music', 0) > 0, a)
    await pg.tap_el('#mute'); await pg.wait_for_timeout(300)
    m = await ev(pg, "[JCMETA.settings.sfx, JCMETA.api.audio().master, JSON.parse(localStorage.getItem('jc.settings')).sfx, document.getElementById('mute').classList.contains('off')]")
    ok('the in-game mute button is the Sound effects setting (in sync, saved)', m and m[0] is True and m[1] > 0 and m[2] is True and m[3] is False, m)
    await ev(pg, "JCMETA.set('music', false)")
    mu = await ev(pg, "JCMETA.api.audio()", {})
    ok('Settings: Music off silences the ambience bus only', mu and mu.get('music') == 0 and mu.get('ambOnMusic') and mu.get('master', 0) > 0, mu)
    v = await ev(pg, "(() => { let n = 0; const orig = navigator.vibrate; navigator.vibrate = () => { n++; return true; }; JCMETA.set('vibe', false); __G.addShake && 0; __G.hurt(1); JCMETA.set('vibe', true); navigator.vibrate = orig; return n; })()")
    ok('Settings: Vibration off stops the phone vibrating when hurt', v == 0, v)
    await pg.ctx.close()

async def check_bank(b):
    pre = "if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', 1); localStorage.removeItem('jc.bank'); localStorage.setItem('grokdemo.coins', '777'); }"
    pg = await page(b, q='?tut=0&warp=64&bosshp=5&autoplay', pre=pre, dpr=2 if SHOTS else 1)
    m = await ev(pg, "[JCMETA.bank(), JSON.parse(localStorage.getItem('jc.bank') || 'null')]")
    ok('bank: migrates grokdemo.coins into jc.bank once', m and m[0].get('coins') == 777 and m[1] and m[1].get('coins') == 777, m)
    await ev(pg, "__G.god(true)")
    try:
        await pg.wait_for_function("__G.S.mode === 'win'", timeout=200000)
        await ev(pg, "__G.S.gems = 3; __G.S.rubies = 1; __G.S.diamonds = 2")
        await pg.wait_for_function("window.__AUDIT.results && window.__AUDIT.results.final !== undefined", timeout=60000)
    except Exception: pass
    r = await ev(pg, "[__AUDIT.results && __AUDIT.results.final, JCMETA.bank(), document.getElementById('r-bank').textContent]", [None, {}, ''])
    fin = r[0] or 0
    ok('bank: a win adds the final total plus the stones, and the results BANK line shows it', fin > 0 and r[1] == {'coins': 777 + fin, 'gems': 3, 'rubies': 1, 'diamonds': 2} and r[2].replace(',', '') == f'BANK {777 + fin}', r)
    await wait(pg, "document.getElementById('again2').classList.contains('rin')", 90000); await pg.wait_for_timeout(1500)
    await shot(pg, 'results.png')
    # CONTINUE returns home, where the bank counts up with coins flying in
    await pg.tap_el('#again2'); await wait(pg, "__G.S.mode === 'title'", 5000)
    h = await ev(pg, "[__G.S.mode, document.getElementById('start').classList.contains('hidden')]")
    b = await ev(pg, "document.querySelector('#tbk-coins b') && document.querySelector('#tbk-coins b').textContent.replace(/,/g, '')")
    await wait(pg, f"document.querySelector('#tbk-coins b').textContent.replace(/,/g, '') === '{777 + fin}'", 30000)
    t = await ev(pg, "document.querySelector('#tbk-coins b').textContent.replace(/,/g, '')")
    ok('CONTINUE goes home and the bank bar counts up to the new total', h == ['title', False] and b == '777' and t == str(777 + fin), [h, b, t])
    await pg.ctx.close()

async def die(pg, by, coins=137, gems=2, rubies=1):
    await ev(pg, "__G.start()"); await pg.wait_for_timeout(1200)
    await ev(pg, f"__G.S.coins = {coins}; __G.S.gems = {gems}; __G.S.rubies = {rubies}; __G.hurt(200); __G.S.deathBy = {json.dumps(by)}")
    await pg.wait_for_function("!document.getElementById('end').classList.contains('hidden')", timeout=60000)
    await wait(pg, "document.getElementById('lose') && document.getElementById('lose').classList.contains('btns')", 60000)
    await wait(pg, "!!document.getElementById('l-cause') && getComputedStyle(document.getElementById('l-cause')).opacity === '1' && getComputedStyle(document.querySelector('#lose .l-btns')).opacity === '1'", 30000)
    await pg.wait_for_timeout(600)

async def check_shotdown(b):
    pg = await page(b, q='?tut=0&warp=30', dpr=2 if SHOTS else 1)
    b0 = await ev(pg, "window.JCMETA ? JCMETA.bank() : null")
    await die(pg, 'crash')
    s = await ev(pg, """(() => { const vis = (sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(e).visibility !== 'hidden' && +getComputedStyle(e).opacity > 0.5; };
      const txt = document.getElementById('end').innerText;
      return { plate: vis('#lplate') && document.getElementById('lplate').innerText.trim(), dist: vis('#l-dist') && vis('#l-plane'), fill: document.getElementById('l-fill') && document.getElementById('l-fill').style.width,
        coins: document.getElementById('l-coinN') && document.getElementById('l-coinN').textContent, stones: document.querySelectorAll('#l-stones .l-stone').length, cause: vis('#l-cause .l-pic') && document.querySelector('#l-cause b').textContent,
        again: vis('#again'), upg: vis('#upg'), stats: /Xora|Time|Drones/i.test(txt), words: txt.split(/\\s+/).length, bank: JCMETA.bank() }; })()""", {})
    far = await ev(pg, "__AUDIT.results && __AUDIT.results.far")
    ok('SHOT DOWN: red plate, distance bar with the plane, the coins you keep, stones, one cause picture, two buttons, no tallies',
       s and s.get('plate') == 'SHOT DOWN' and s.get('dist') and far is not None and abs(float((s.get('fill') or '0%').rstrip('%')) - far * 100) < 0.2 and s.get('coins') == '137' and s.get('stones') == 2 and s.get('cause') == 'SHOOT IT OPEN' and s.get('again') and s.get('upg') and not s.get('stats'), s)
    ok('SHOT DOWN: you keep what you earned (coins and stones banked)', s and b0 is not None and s.get('bank') == {'coins': b0['coins'] + 137, 'gems': b0['gems'] + 2, 'rubies': b0['rubies'] + 1, 'diamonds': b0['diamonds']}, [b0, s.get('bank') if s else None])
    await shot(pg, 'shotdown.png')
    await pg.tap_el('#upg'); await wait(pg, SHEET_IN)
    u = await ev(pg, "[__G.S.mode, window.JCMETA && JCMETA.panel, document.getElementById('end').classList.contains('hidden'), document.getElementById('start').classList.contains('hidden')]")
    ok('SHOT DOWN: UPGRADE goes home and lands on the Workshop panel', u == ['title', 'workshop', True, False], u)
    await ev(pg, "JCMETA.close()"); await wait(pg, CLOSED)
    await die(pg, 'gate', 20, 0, 0)
    g = await ev(pg, "document.querySelector('#l-cause b') && document.querySelector('#l-cause b').textContent")
    await pg.tap_el('#again'); await wait(pg, "__G.S.mode === 'play'", 5000)
    f = await ev(pg, "[__G.S.mode, document.getElementById('end').classList.contains('hidden')]")
    ok('SHOT DOWN: FLY AGAIN starts a new run (and a gate death shows the gate picture)', f == ['play', True] and g == 'SHOOT IT BLUE', [f, g])
    # teardown stops the count-up: a death then an immediate FLY AGAIN leaves no tally writing into the hidden card
    await ev(pg, "__G.S.coins = 999; __G.hurt(200)")
    await pg.wait_for_function("!document.getElementById('end').classList.contains('hidden')", timeout=60000)
    await ev(pg, "__G.start()"); await pg.wait_for_timeout(3500)
    c = await ev(pg, "[document.getElementById('l-coinN').textContent, document.getElementById('lose').className, __G.S.mode]")
    ok('SHOT DOWN: teardownEnd stops its timers and the count-up', c and c[0] == '0' and c[1] == '' and c[2] == 'play', c)
    await pg.ctx.close()

async def check_shots(b):
    if not SHOTS: return
    pre = "try { localStorage.setItem('jc.bank', JSON.stringify({ coins: 2480, gems: 6, rubies: 2, diamonds: 1 })); } catch (e) { }"
    for (w, h) in [(390, 844), (360, 780), (430, 932)]:
        pg = await page(b, pre=pre, dpr=2, w=w, h=h)
        await pg.wait_for_timeout(1200); await shot(pg, f'title_{w}x{h}.png')
        if w == 390:
            await ev(pg, "(() => { const s = document.querySelector('#steerhand .sh'); s.style.animation = 'none'; s.style.transform = 'translateX(40px)'; })()"); await pg.wait_for_timeout(600)   # hold the sway still for the zoom
            r = await ev(pg, "(() => { const r = document.querySelector('#steerhand svg').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
            if r: await pg.screenshot(path=os.path.join(SHOTS, 'hand_title_zoom.png'), clip={'x': r[0] - 30, 'y': r[1] - 20, 'width': r[2] + 60, 'height': r[3] + 40}, scale='device')
            for pid in ['workshop', 'settings', 'store', 'depot', 'hangar', 'base']:
                await ev(pg, f"JCMETA.open('{pid}')"); await wait(pg, SHEET_IN)
                await pg.wait_for_timeout(700); await shot(pg, f'panel_{pid}.png'); await ev(pg, "JCMETA.close()"); await wait(pg, CLOSED)
        await pg.ctx.close()
    # the hand in a tutorial (the Omega double tap), zoomed
    pg = await page(b, q='?tut=1&warp=12&omega=1', dpr=2)
    await ev(pg, "__G.start()"); await pg.wait_for_timeout(600); await ev(pg, "__G.S.omega = 1; __G.tutWant('omega')")
    try: await pg.wait_for_function("__G.TUT.active && document.querySelector('#tut .hand')", timeout=30000); await pg.wait_for_timeout(2500)
    except Exception: pass
    r = await ev(pg, "(() => { const e = document.querySelector('#tut .hand'); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
    await shot(pg, 'tutorial_omega.png')
    if r: await pg.screenshot(path=os.path.join(SHOTS, 'hand_tutorial_zoom.png'), clip={'x': r[0] - 30, 'y': r[1] - 30, 'width': r[2] + 60, 'height': r[3] + 60}, scale='device')
    await pg.ctx.close()

async def main():
    if SHOTS: os.makedirs(SHOTS, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
        for f in [check_title, check_taps, check_workshop, check_settings, check_shotdown, check_bank, check_run_mults, check_shots]:
            try: await f(b)
            except Exception as e: ok(f.__name__ + ' ran without an exception', False, repr(e)[:300])
        ok('no console errors or page errors', not ERRS, ERRS[:8])
        await b.close()
    print('SUMMARY', sum(k for _, k in R), '/', len(R), flush=True)
asyncio.run(main())
