# Round 15 checks at 390x844 (headless Chrome, SwiftShader) with screenshots:
#   missions: Mission 1 to Beacon (and its story), Mission 2 to the crash (the reset story, the salvage banked, Mission 3
#   selected), Mission 3 to SALVAGE HOME in the bare-bones Patchwork; the MAX gate combo pay-outs step by step and the
#   drone sway; the home screen over 10 refreshes (every image drawn), the HUD (no mute, no weapons line, no heart, the HP bar
#   as long as Omega, Omega hidden when locked), the red edge glow, SHOT DOWN, Help, Settings VOLUME and FOUNDERS on and off.
# usage: python r15.py URL OUTDIR [missions,combo,home,hud,shotdown,help,settings,founders]
import asyncio, json, os, sys
from playwright.async_api import async_playwright
ROOT = sys.argv[1] if sys.argv[1].endswith('/') else sys.argv[1] + '/'
OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)
ONLY = (sys.argv[3] if len(sys.argv) > 3 else 'missions,combo,home,hud,shotdown,help,settings,founders').split(',')
CHROME = os.environ.get('CHROME') or '/usr/bin/google-chrome'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
R, ERRS = [], []
def check(name, ok, info=''):
    R.append((name, bool(ok))); print(('PASS ' if ok else 'FAIL ') + name + ('  ' + str(info) if info != '' else ''), flush=True)

async def page(p, query, label, ctx_reuse=None):
    b = await p.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = await ctx.new_page(); wire(pg, label)
    await pg.goto(ROOT + query, wait_until='networkidle')
    await ready(pg)
    return b, ctx, pg
def wire(pg, label):
    pg.on('console', lambda m: ERRS.append(f'[{label}] {m.type}: {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: ERRS.append(f'[{label}] pageerror: {e}'))
    pg.on('response', lambda r: ERRS.append(f'[{label}] HTTP {r.status} {r.url}') if r.status >= 400 else None)
async def ready(pg):
    await pg.wait_for_function('window.__G && document.getElementById("loading").textContent === ""', timeout=90000)

async def run_to_end(pg, until, timeout=240000):
    await pg.wait_for_function(until, timeout=timeout, polling=250)

async def missions(p):
    # Mission 1: to Beacon; the m1end story plays on the way home; Mission 2 is selected
    b, ctx, pg = await page(p, '?fresh=1&autoplay&tut=0&ts=3', 'm1')
    await pg.evaluate('__G.god(true)')
    m = await pg.evaluate('__G.AUD.mission')
    check('M1: the Lawnmower in daylight, 50 drones, Omega', m['plane'] == 'lawnmower' and m['sky'] == 'day' and m['cap'] == 50 and m['omega'], m)
    await run_to_end(pg, '__G.S.mode === "win" || __G.S.mode === "dead" || document.getElementById("again2").classList.contains("rin")')
    await pg.wait_for_function('document.getElementById("again2").classList.contains("rin")', timeout=60000)
    await pg.wait_for_timeout(800); await pg.screenshot(path=f'{OUT}/m1_complete.png')
    name = await pg.evaluate('document.getElementById("r-name").textContent')
    bank = await pg.evaluate('document.getElementById("r-bank").textContent')
    check('M1 complete: BEACON IN SIGHT, no BANK line (salvage)', name == 'BEACON IN SIGHT' and bank == '', [name, bank])
    await pg.evaluate('JCMETA.api.goHome()')
    await pg.wait_for_timeout(600)
    st = await pg.evaluate('JCSTORY.playing')
    await pg.screenshot(path=f'{OUT}/story_m1end_1.png')
    check('M1: the m1end story plays on the way home', st and st['id'] == 'm1end', st)
    for i in range(1, 6):
        await pg.evaluate('JCSTORY.next()'); await pg.wait_for_timeout(450)
        if i == 2: await pg.screenshot(path=f'{OUT}/story_m1end_3.png')
    mm = await pg.evaluate('JCMETA.missions()')
    check('M1 won: Mission 2 unlocked and selected, salvage held', 1 in mm['done'] and mm['sel'] == 2 and mm['salvage']['coins'] > 0 and not mm['crashed'], mm)
    await pg.wait_for_timeout(600); await pg.screenshot(path=f'{OUT}/home_m2_selected.png')
    await b.close()
    # Mission 2: dusk, armed, the horde, the edge glow, the crash
    b, ctx, pg = await page(p, '?m=2&autoplay&tut=0&ts=3', 'm2')
    m = await pg.evaluate('__G.AUD.mission')
    check('M2: the Lawnmower at dusk, starts armed', m['sky'] == 'dusk' and m['kit'] and m['kit']['tier'] == 1 and m['kit']['rockets'] == 1, m)
    await pg.evaluate('__G.god(true)')
    await pg.wait_for_function('__G.S.t > 20', timeout=120000); await pg.screenshot(path=f'{OUT}/m2_dusk.png')
    await pg.wait_for_function('__G.AUD.warnGlow', timeout=200000)
    await pg.wait_for_timeout(300); await pg.screenshot(path=f'{OUT}/m2_edgeglow.png')
    g = await pg.evaluate('getComputedStyle(document.getElementById("edgeglow")).opacity')
    check('M2: the red edge glow at the horde', float(g) > 0.2, g)
    await pg.wait_for_function('__G.S.crash', timeout=120000); await pg.wait_for_timeout(700)
    await pg.screenshot(path=f'{OUT}/m2_crash_a.png')
    await pg.wait_for_timeout(900); await pg.screenshot(path=f'{OUT}/m2_crash_b.png')
    cw = await pg.evaluate('document.getElementById("crashwarn").className')
    check('M2: the crash warning (no words) shows', cw == 'show', cw)
    await pg.wait_for_function('JCSTORY.playing && JCSTORY.playing.id === "reset"', timeout=60000)
    await pg.wait_for_timeout(500); await pg.screenshot(path=f'{OUT}/story_reset_1.png')
    for i in range(1, 6):
        await pg.evaluate('JCSTORY.next()'); await pg.wait_for_timeout(450)
        if i in (2, 4): await pg.screenshot(path=f'{OUT}/story_reset_{i + 1}.png')
    a = await pg.evaluate('__G.AUD.crash'); mm = await pg.evaluate('JCMETA.missions()'); bk = await pg.evaluate('JCMETA.bank()')
    check('M2: the crash ran its course (AUD.crash.done, first)', a and a.get('done') and a['info']['first'], a)
    check('M2 crash: Lawnmower totalled, Mission 3 selected, salvage banked', mm['crashed'] and mm['sel'] == 3 and 2 in mm['done'] and bk['coins'] == mm['salvage']['coins'] and bk['coins'] > 0, [mm, bk])
    await pg.wait_for_timeout(1200)
    m = await pg.evaluate('__G.AUD.mission'); mode = await pg.evaluate('__G.S.mode')
    check('after the crash: home with the Patchwork, morning, bare bones', mode == 'title' and m['plane'] == 'patchwork' and m['sky'] == 'morning' and m['cap'] == 10 and not m['omega'], [mode, m])
    await pg.screenshot(path=f'{OUT}/home_after_crash.png')
    lk = await pg.evaluate('[...document.querySelectorAll("[data-open]")].filter((e) => e.classList.contains("locked")).length')
    vis = await pg.evaluate('getComputedStyle(document.getElementById("t-bank")).display')
    check('after the crash: the economy opens (no locks, the bank bar shows)', lk == 0 and vis != 'none', [lk, vis])
    await pg.evaluate('JCMETA.open("hangar")'); await pg.wait_for_timeout(700); await pg.screenshot(path=f'{OUT}/hangar_after_crash.png')
    hg = await pg.evaluate('[document.querySelector(".hg-plate b").textContent, !!document.querySelector("#hg-dead img[src*=lawnmower_dead]")]')
    check('Hangar: the Patchwork equipped, the Lawnmower a wreck', hg[0] == 'PATCHWORK' and hg[1], hg)
    await pg.evaluate('JCMETA.close()')
    await b.close()
    # Mission 3: the bare-bones Patchwork flies home with the salvage
    b, ctx, pg = await page(p, '?m=3&autoplay&tut=0&ts=3', 'm3')
    await pg.evaluate('__G.god(true)')
    await pg.wait_for_function('__G.S.t > 8', timeout=120000); await pg.screenshot(path=f'{OUT}/m3_play.png')
    info = await pg.evaluate('({ cap: __G.MAXD, om: getComputedStyle(document.getElementById("omega")).display, plane: __G.plane })')
    check('M3: Patchwork, cap 10, the Omega bar hidden', info['cap'] == 10 and info['om'] == 'none' and info['plane']['key'] == 'patchwork', info)
    await pg.wait_for_function('__G.S.drones > 0', timeout=60000)
    mx = await pg.evaluate('(async () => { let m = 0; for (let i = 0; i < 40; i++) { m = Math.max(m, __G.S.drones); await new Promise((r) => setTimeout(r, 250)); } return m; })()')
    check('M3: never more than 10 drones', mx <= 10, mx)
    await run_to_end(pg, '__G.AUD.home !== undefined', 240000)
    await pg.wait_for_function('document.getElementById("again2").classList.contains("rin")', timeout=60000)
    await pg.wait_for_timeout(800); await pg.screenshot(path=f'{OUT}/m3_complete.png')
    name = await pg.evaluate('document.getElementById("r-name").textContent')
    check('M3 complete: SALVAGE HOME', name == 'SALVAGE HOME', name)
    await b.close()

async def combo(p):
    # the pay-out table, straight through the game's own passGate: six MAX gates in a row, then a normal gate, then one more MAX
    b, ctx, pg = await page(p, '?fresh=1&autoplay&tut=0', 'combo')
    await pg.evaluate('__G.god(true)'); await pg.wait_for_function('__G.S.t > 2', timeout=90000)
    await pg.evaluate("""async () => { const M = __G.GATE_MAX; for (let i = 0; i < 6; i++) { __G.passGate({ val: M, x: __G.S.px, z: -3 }); if (i === 4) await new Promise((r) => setTimeout(r, 350)); } }""")
    await pg.screenshot(path=f'{OUT}/combo.png')
    await pg.evaluate("""() => { __G.passGate({ val: 3, x: __G.S.px, z: -3 }); __G.passGate({ val: __G.GATE_MAX, x: __G.S.px, z: -3 }); }""")
    c = await pg.evaluate('__G.AUD.combo')
    check('combo: six MAX in a row then a normal gate resets it (n = 1..6, then 1)', [x['n'] for x in c] == [1, 2, 3, 4, 5, 6, 1], [x['n'] for x in c])
    C, ST = [50, 100, 500, 1000, 5000], [0, 0, 1, 2, 3]
    ok = all(x['coins'] == C[min(x['n'], 5) - 1] and len(x['stones']) == ST[min(x['n'], 5) - 1] for x in c)
    check('combo: each MAX in a row pays 50, 100, 500, 1000, 5000 coins and 0, 0, 1, 2, 3 stones', ok and max(x['n'] for x in c) >= 5, [(x['n'], x['coins'], len(x['stones'])) for x in c][:12])
    await b.close()
    # the bot with ?gatemax=1: the combo builds in real play (the bot does not always line up every gate)
    b, ctx, pg = await page(p, '?fresh=1&autoplay&tut=0&gatemax=1&ts=2', 'combobot')
    await pg.evaluate('__G.god(true)')
    await pg.wait_for_function('__G.S.t > 45', timeout=180000, polling=500)
    c = await pg.evaluate('__G.AUD.combo || []')
    check('combo in play (bot, ?gatemax=1): MAX gates in a row pay by the table', len(c) > 0 and all(x['coins'] == C[min(x['n'], 5) - 1] for x in c), [(x['n'], x['coins']) for x in c][:14])
    # the drone sway: a wingman wanders around its slot
    xs = await pg.evaluate('(async () => { const out = []; for (let i = 0; i < 30; i++) { const w = __G.wingmen[0]; if (w) out.push(w.sprite.position.x - __G.S.px); await new Promise((r) => setTimeout(r, 100)); } return out; })()')
    span = (max(xs) - min(xs)) if xs else 0
    check('drone sway: the first wingman moves around its slot', span > 0.05, round(span, 3))
    await b.close()

async def home(p):
    b = await p.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = await ctx.new_page(); wire(pg, 'home')
    bad = []
    for i in range(10):
        await pg.goto(ROOT + '?fresh=1', wait_until='load'); await ready(pg); await pg.wait_for_timeout(1700)
        r = await pg.evaluate("""() => { const st = document.getElementById('start');
          const imgs = [...st.querySelectorAll('img')].map((im) => im.complete && im.naturalWidth > 0);
          const op = [...st.querySelectorAll('.t-ico, .t-card, #t-mission')].map((e) => +getComputedStyle(e).opacity);
          return { ready: st.classList.contains('ready'), imgs: imgs.filter(Boolean).length, n: imgs.length, minOp: Math.min(...op) }; }""")
        if not (r['ready'] and r['imgs'] == r['n'] and r['minOp'] > 0.99): bad.append((i, r))
        if i == 0: await pg.screenshot(path=f'{OUT}/home.png')
    check('home: every icon and card drawn on 10 refreshes', not bad, bad)
    r = await pg.evaluate("""() => ({ tap: !!document.querySelector('#start .tap'), arrows: !!document.querySelector('#steerhand .track'), bank: getComputedStyle(document.getElementById('t-bank')).display,
      locked: [...document.querySelectorAll('[data-open]')].filter((e) => e.classList.contains('locked')).map((e) => e.dataset.open) })""")
    check('home: no TAP TO FLY, no hand arrows', not r['tap'] and not r['arrows'], r)
    check('home before the crash: no bank, Depot/Hangar/Workshop/Shop locked', r['bank'] == 'none' and sorted(r['locked']) == sorted(['depot', 'hangar', 'workshop', 'store', 'store']) or set(r['locked']) == {'depot', 'hangar', 'workshop', 'store'}, r)
    await pg.evaluate("document.getElementById('tc-hangar').click()"); await pg.wait_for_timeout(150)
    check('home: a locked card does not open', await pg.evaluate('JCMETA.panel') is None)
    await pg.screenshot(path=f'{OUT}/home_zoom_icons.png', clip={'x': 0, 'y': 0, 'width': 390, 'height': 260})
    await b.close()

async def hud(p):
    b, ctx, pg = await page(p, '?fresh=1&autoplay&tut=0', 'hud')
    await pg.wait_for_function('__G.S.t > 2', timeout=90000); await pg.evaluate('__G.god(true)')
    await pg.screenshot(path=f'{OUT}/hud.png'); await pg.screenshot(path=f'{OUT}/hud_zoom.png', clip={'x': 0, 'y': 0, 'width': 390, 'height': 120})
    r = await pg.evaluate("""() => { const q = (s) => document.querySelector(s), hp = q('#hp').getBoundingClientRect(), om = q('#omega').getBoundingClientRect(), pr = q('#prog').getBoundingClientRect();
      return { mute: !!q('#mute'), weap: !!q('#weap'), seg: !!q('#hpseg'), heart: getComputedStyle(q('#hp'), '::before').display, hpW: hp.width, omW: om.width, progR: innerWidth - pr.right, progW: pr.width,
        pick: !!q('#pickups') && getComputedStyle(q('#pickups')).display !== 'none' }; }""")
    check('HUD: no mute, no weapons line, no black line, no heart', not r['mute'] and not r['weap'] and not r['seg'] and r['heart'] == 'none', r)
    check('HUD: the HP bar as long as the Omega bar', abs(r['hpW'] - r['omW']) < 1, r)
    check('HUD: the progress meter right-aligned', r['progR'] < 40 and r['progW'] < 160, r)
    await b.close()
    b, ctx, pg = await page(p, '?m=3&autoplay&tut=0', 'hud3')
    await pg.wait_for_function('__G.S.t > 1', timeout=90000)
    om = await pg.evaluate('getComputedStyle(document.getElementById("omega")).display')
    await pg.screenshot(path=f'{OUT}/hud_bare.png', clip={'x': 0, 'y': 0, 'width': 390, 'height': 120})
    check('HUD bare bones: Omega bar hidden', om == 'none', om)
    await b.close()
    # the boss warning edge glow
    b, ctx, pg = await page(p, '?fresh=1&autoplay&tut=0&warp=45&ts=2', 'boss')
    await pg.evaluate('__G.god(true)')
    await pg.wait_for_function('document.getElementById("edgeglow").classList.contains("on")', timeout=120000)
    await pg.wait_for_timeout(500); await pg.screenshot(path=f'{OUT}/boss_edgeglow.png')
    check('boss warning: the red edge glow', True)
    await b.close()

async def shotdown(p):
    for q, lab in (('?fresh=1&autoplay&tut=0', 'lose1'), ('?m=3&autoplay&tut=0', 'lose3')):
        b, ctx, pg = await page(p, q, lab)
        await pg.wait_for_function('__G.S.t > 3', timeout=90000)
        await pg.evaluate('() => { __G.S.coins = 420; __G.S.gems = 1; __G.S.deathBy = "xora"; __G.hurt(500); }')
        await pg.wait_for_function('document.getElementById("again").getBoundingClientRect().width > 0 && document.getElementById("lose").classList.contains("rin")', timeout=60000)
        await pg.wait_for_timeout(2600); await pg.screenshot(path=f'{OUT}/shotdown_{lab}.png')
        r = await pg.evaluate("""() => ({ upg: getComputedStyle(document.getElementById('upg')).display, pl: getComputedStyle(document.getElementById('l-plane')).backgroundImage })""")
        if lab == 'lose1': check('SHOT DOWN before the crash: no UPGRADE, the Lawnmower on the track', r['upg'] == 'none' and 'r2_plane' in r['pl'], r)
        else: check('SHOT DOWN after the crash: UPGRADE, the Patchwork on the track', r['upg'] != 'none' and 'patchwork' in r['pl'], r)
        await b.close()

async def help_(p):
    b, ctx, pg = await page(p, '?fresh=1', 'help')
    await pg.wait_for_timeout(1500)
    await pg.evaluate('JCMETA.open("help")'); await pg.wait_for_timeout(900)
    await pg.screenshot(path=f'{OUT}/help.png')
    r = await pg.evaluate('({ tiles: document.querySelectorAll(".hp-tile").length, view: document.getElementById("hp-view").innerHTML.length })')
    check('Help: a tile per tutorial and an animated card', r['tiles'] >= 7 and r['view'] > 100, r)
    await pg.evaluate('document.querySelectorAll(".hp-tile")[5].click()'); await pg.wait_for_timeout(1400)
    await pg.screenshot(path=f'{OUT}/help_gates.png')
    await b.close()

async def settings(p):
    b, ctx, pg = await page(p, '?fresh=1', 'settings')
    await pg.wait_for_timeout(1200)
    await pg.evaluate('JCMETA.open("settings")'); await pg.wait_for_timeout(800)
    await pg.screenshot(path=f'{OUT}/settings.png')
    await pg.touchscreen.tap(60, 400)   # a user gesture for the audio
    await pg.evaluate('JCMETA.api.initAudio()')
    await pg.evaluate("() => { const v = document.getElementById('st-vol'); v.value = 40; v.dispatchEvent(new Event('input')); }")
    a = await pg.evaluate('JCMETA.api.audio()')
    check('Settings VOLUME 40%: master gain 0.55 x 0.4', a['master'] is not None and abs(a['master'] - 0.22) < 0.01, a)
    f = await pg.evaluate('!!document.querySelector(".st-fnd .st-tog") && !document.querySelector(".st-fnd .st-tog").classList.contains("on")')
    check('Settings: FOUNDERS toggle, off by default', f)
    await b.close()

async def founders(p):
    out = {}
    for fl in ('0', '1'):
        b, ctx, pg = await page(p, f'?m=3&founders={fl}&autoplay&tut=0', 'founders' + fl)
        await pg.wait_for_function('__G.S.t > 2', timeout=90000)
        out[fl] = await pg.evaluate('({ m: __G.AUD.mission, om: getComputedStyle(document.getElementById("omega")).display, ok: __G.S.omegaOK, beam: __G.S.beamOwned })')
        await pg.screenshot(path=f'{OUT}/founders_{fl}.png')
        await b.close()
    o, n = out['0'], out['1']
    check('FOUNDERS off: Mission 3 bare bones (10 drones, no Omega)', o['m']['cap'] == 10 and not o['m']['omega'] and o['om'] == 'none' and not o['ok'], o)
    check('FOUNDERS on: Mission 3 keeps everything (50 drones, Omega, kit)', n['m']['cap'] == 50 and n['m']['omega'] and n['om'] != 'none' and n['ok'] and n['m']['kit']['tier'] >= 1 and n['beam'], n)
    # the Workshop carries over: Lawnmower levels add to the Patchwork with FOUNDERS on
    # a round 14 save with Workshop levels: they become the Lawnmower's at the crash; FOUNDERS adds them to the Patchwork
    b, ctx, pg = await page(p, '', 'fws')
    await pg.evaluate("() => { localStorage.clear(); localStorage.setItem('jc.workshop', JSON.stringify({ dmg: 3, rate: 0, rev: 0 })); localStorage.setItem('jc.bank', JSON.stringify({ coins: 500 })); }")
    await pg.reload(wait_until='networkidle'); await ready(pg)
    r = await pg.evaluate("""() => { const M = JCMETA, a = M.missions(); M.set('founders', false); M.useFor('lawnmower'); const lmBefore = M.mult('dmg');
      M.crash({ coins: 10 }); M.useFor('patchwork'); const off = M.mult('dmg'); M.set('founders', true); M.useFor('patchwork'); const on = M.mult('dmg');
      M.set('founders', false); const out = { start: a.sel, crashedBefore: a.crashed, lmBefore, off, on, lm: M.missions().lm, ws: M.workshop(), bank: M.bank().coins }; M.reset(); localStorage.clear(); return out; }""")
    check('old save: starts at Mission 1, its Workshop is the Lawnmower\'s', r['start'] == 1 and not r['crashedBefore'] and r['lmBefore'] > 1, r)
    check('FOUNDERS off: the Patchwork starts with no upgrades; on: it keeps the Lawnmower\'s', r['off'] == 1 and r['on'] == r['lmBefore'] and r['lm']['dmg'] == 3 and r['ws']['dmg'] == 0 and r['bank'] == 510, r)
    await b.close()

async def main():
    async with async_playwright() as p:
        for n, f in (('missions', missions), ('combo', combo), ('home', home), ('hud', hud), ('shotdown', shotdown), ('help', help_), ('settings', settings), ('founders', founders)):
            if n in ONLY:
                try: await f(p)
                except Exception as e: check(n + ' ran', False, repr(e)[:300])
    print('SUMMARY', sum(1 for _, ok in R if ok), '/', len(R), 'passed')
    print('console errors:', len(ERRS)); [print('  ' + e) for e in ERRS[:40]]
asyncio.run(main())
