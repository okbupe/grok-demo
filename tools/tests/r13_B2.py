# usage: r13_B2.py URL [OUTDIR] [only=audio,mt,...]
# Round 13, area B2 checks (mechanics, honesty, tutorials, robustness). URL is the site root, for example
# http://127.0.0.1:8813/ . Each check prints PASS or FAIL with its evidence; SUMMARY at the end. OUTDIR gets the
# DPR 2 screenshots of the two new tutorials. Touches go through CDP Input.dispatchTouchEvent on a virtual clock.
# Note on CDP multi-touch: touchStart/touchMove list the fingers that are down; touchEnd lists only the fingers that
# lift (an empty list lifts them all).
import os, sys, json, time, asyncio, math
from playwright.async_api import async_playwright

URL = sys.argv[1].rstrip('/') + '/'
OUT = sys.argv[2] if len(sys.argv) > 2 and '=' not in sys.argv[2] else None
ONLY = next((a.split('=', 1)[1].split(',') for a in sys.argv[2:] if a.startswith('only=')), None)
CH = os.environ.get('CHROME') or '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
R = []
MINUS = '−'

# A strict stand-in for a phone's autoplay rule: the context only runs if it is created, resumed or primed (a one-sample
# buffer started) inside a real user activation (pointerup or touchend for a finger, pointerdown/mousedown for a mouse,
# click, keydown). &refuse=N makes the first N activation events that try to start audio fail, to test the retries.
INIT_AUDIO = r"""(() => {
  const A = window.AudioContext; if (!A) return;
  let refuse = +(new URLSearchParams(location.search).get('refuse') || 0);
  const U = window.__AU = { made: [], resumes: [], primes: [], runningBy: '', state: 'none', log: [] };
  const evType = () => (window.event ? window.event.type + (window.event.pointerType ? ':' + window.event.pointerType : '') : '-');
  const act = () => { const e = window.event; if (!e || !e.isTrusted) return null;
    const t = e.type, pt = e.pointerType;
    if (!(t === 'touchend' || t === 'click' || t === 'keydown' || t === 'mousedown' || (t === 'pointerup' && pt !== 'mouse') || (t === 'pointerdown' && pt === 'mouse'))) return null;
    if (e.__b2 === undefined) { e.__b2 = refuse > 0; if (refuse > 0) refuse--; }
    return e.__b2 ? null : evType(); };
  class F extends A {
    constructor(...a) { super(...a); this.__st = 'suspended'; U.state = 'suspended'; U.made.push(evType()); const t = act(); if (t) this.__go(t); }
    get state() { return this.__st; }
    __go(t) { if (this.__st === 'running') return; this.__st = 'running'; U.state = 'running'; if (!U.runningBy) U.runningBy = t; U.log.push(['running', t]); this.dispatchEvent(new Event('statechange')); }
    resume() { const t = act(); U.resumes.push([evType(), !!t]); if (t) this.__go(t); return Promise.resolve(); }
    suspend() { this.__st = 'suspended'; U.state = 'suspended'; U.log.push(['suspended', evType()]); this.dispatchEvent(new Event('statechange')); return Promise.resolve(); }
  }
  window.AudioContext = F; window.webkitAudioContext = F;
  const st = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) {
    if (this.buffer && this.buffer.length === 1) { const t = act(); U.primes.push([evType(), !!t]); if (t && this.context.__go) this.context.__go(t); }
    return st.apply(this, a);
  };
})();"""
# every string drawn on the #ui overlay canvas, tagged with its frame (a frame starts with the clearRect of drawOverlay)
INIT_TEXT = r"""(() => { window.__TX = []; window.__TXon = false; let fr = 0; const P = CanvasRenderingContext2D.prototype, f = P.fillText, cr = P.clearRect;
  P.clearRect = function (...a) { if (this.canvas && this.canvas.id === 'ui') fr++; return cr.apply(this, a); };
  P.fillText = function (s, ...a) { if (window.__TXon && this.canvas && this.canvas.id === 'ui' && __TX.length < 60000) __TX.push([fr, String(s)]); return f.call(this, s, ...a); }; })();"""
TUTKEY = lambda d: "(() => { try { if (!sessionStorage.getItem('b2set')) { sessionStorage.setItem('b2set', '1'); localStorage.setItem('grokdemo.tut', '%s'); } } catch (e) { } })();" % json.dumps(d)


def rec(name, ok, info):
    R.append((name, bool(ok))); print(('PASS ' if ok else 'FAIL ') + name, json.dumps(info, default=str)[:1500], flush=True)


class Pg:
    async def open(self, b, q, dpr=1, inits=()):
        self.ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=dpr, is_mobile=True, has_touch=True)
        for s in inits: await self.ctx.add_init_script(s)
        self.pg = await self.ctx.new_page(); self.errs = []
        # errors and warnings count, except Chrome's note that a preloaded font was not used within a few seconds of load
        # (index.html's font preloads, seen only when a slow DPR 2 page reloads mid-check)
        self.pg.on('console', lambda m: self.errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') and 'was preloaded using link preload' not in m.text else None)
        self.pg.on('pageerror', lambda e: self.errs.append(f'pageerror: {e}'))
        self.cdp = await self.ctx.new_cdp_session(self.pg); self.T = time.time()
        await self.goto(q); return self

    async def goto(self, q):
        await self.pg.goto(URL + q, wait_until='networkidle')
        await self.pg.wait_for_function('window.__G && document.getElementById("loading").textContent === ""', timeout=60000)

    async def ev(self, kind, pts, adv=0.03):   # pts: [(id, x, y)]
        self.T += adv
        await self.cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y, 'id': i} for (i, x, y) in pts], 'timestamp': self.T})

    async def tap(self, x, y, i=9, gap=0.3, ms=0.06):
        await self.ev('touchStart', [(i, x, y)], gap); await self.ev('touchEnd', [], ms)

    async def js(self, s): return await self.pg.evaluate(s)
    async def wait(self, cond, timeout=120000): await self.pg.wait_for_function(cond, timeout=timeout, polling=100)
    async def close(self): await self.ctx.close()


K = 2 * 3.3 / (390 * 0.62)   # steering: world units per px of finger travel


async def check_audio(b):
    p = await Pg().open(b, '?tut=0', inits=[INIT_AUDIO])
    before = await p.js('({mode: __G.S.mode, U: JSON.parse(JSON.stringify(__AU))})')
    await p.tap(195, 500, 0, 0.3)
    await p.pg.wait_for_timeout(500)
    a = await p.js('({mode: __G.S.mode, U: __AU, aud: __AUDIT.audio || null})')
    U = a['U']; primed = any(ok for _, ok in U['primes'])
    made_ok = bool(U['made']) and all(m.split(':')[0] in ('pointerup', 'touchend', 'click', 'keydown') or m == 'pointerdown:mouse' for m in U['made'])
    rec('audio: the first tap (TAP TO FLY) unlocks sound in its own pointerup/touchend', a['mode'] == 'play' and U['state'] == 'running' and U['runningBy'].split(':')[0] in ('pointerup', 'touchend'),
        {'state': U['state'], 'runningBy': U['runningBy'], 'made': U['made'], 'resumes': U['resumes'][:6]})
    rec('audio: a one-sample silent buffer is played inside that gesture', primed, {'primes': U['primes'][:6]})
    rec('audio: the context is never created outside a user activation (not in a touch pointerdown)', made_ok, {'made': U['made']})
    await p.close()
    # retries: the first 3 activation events that try to start audio are refused; a later steering drag must unlock it
    p = await Pg().open(b, '?tut=0&refuse=3', inits=[INIT_AUDIO])
    await p.tap(195, 500, 0, 0.3); await p.pg.wait_for_timeout(400)
    s1 = await p.js('JSON.parse(JSON.stringify(__AU))')
    async def drag(x0, dx):
        await p.ev('touchStart', [(1, x0, 650)], 0.4)
        for k in range(1, 7): await p.ev('touchMove', [(1, x0 + dx * k / 6, 650)], 0.03)
        await p.ev('touchEnd', [], 0.03); await p.pg.wait_for_timeout(250)
    await drag(150, 60); s2 = await p.js('JSON.parse(JSON.stringify(__AU))')
    if s2['state'] != 'running': await drag(210, -60); s2 = await p.js('JSON.parse(JSON.stringify(__AU))')
    n2 = len(s2['resumes']) + len(s2['primes'])
    await drag(150, 40); await drag(190, -40); s3 = await p.js('JSON.parse(JSON.stringify(__AU))')
    n3 = len(s3['resumes']) + len(s3['primes'])
    rec('audio: refused at first, every later gesture retries until the context runs, then stops trying', s1['state'] != 'running' and s2['state'] == 'running' and n3 == n2,
        {'afterTap': s1['state'], 'afterDrag': s2['state'], 'runningBy': s2['runningBy'], 'attemptsWhenRunning': n2, 'attemptsTwoDragsLater': n3, 'aud': await p.js('__AUDIT.audio || null')})
    await p.close()


async def check_mt(b):
    p = await Pg().open(b, '?tut=0')
    await p.tap(195, 500, 0, 0.3); await p.pg.wait_for_timeout(700)
    mode = await p.js('__G.S.mode')
    rec('title: a tap still starts the game', mode == 'play', {'mode': mode})
    await p.js('__G.god(true); __G.omega(1)')
    st = lambda: p.js('({tx: __G.S.tx, fires: __G.AUD.omegaFires, omegaT: __G.S.omegaT})')
    # control: a double tap with no other finger down
    s0 = await st()
    await p.tap(300, 400, 5, 0.5); await p.tap(302, 401, 6, 0.12)
    await p.pg.wait_for_timeout(300); s1 = await st()
    rec('multi-touch control: a lone double tap fires Omega', s1['fires'] == s0['fires'] + 1, {'before': s0, 'after': s1})
    await p.wait('__G.S.omegaT <= 0', 60000); await p.pg.wait_for_timeout(300); await p.js('__G.omega(1)')
    # the thumb goes down and steers 4 px right
    t0 = await st()
    await p.ev('touchStart', [(1, 100, 650)], 0.6); await p.ev('touchMove', [(1, 104, 650)])
    await p.pg.wait_for_timeout(150); t1 = await st()
    # a second finger double-taps while the thumb stays down; the thumb twitches 2 px during tap 1, the finger jitters 2 px during tap 2
    await p.ev('touchStart', [(1, 104, 650), (2, 300, 400)], 0.05)
    await p.ev('touchMove', [(1, 106, 650), (2, 300, 400)], 0.02)
    await p.ev('touchEnd', [(2, 300, 400)], 0.04)
    await p.ev('touchStart', [(1, 106, 650), (3, 302, 401)], 0.12)
    await p.ev('touchMove', [(1, 106, 650), (3, 304, 402)], 0.02)
    await p.ev('touchEnd', [(3, 304, 402)], 0.04)
    await p.pg.wait_for_timeout(300); t2 = await st()
    glog = await p.js('__G.GLOG.slice(-4)')
    rec('multi-touch: a second finger double-taps Omega while the thumb steers', t2['fires'] == t0['fires'] + 1, {'fires': [t0['fires'], t2['fires']], 'glog': glog})
    want = t1['tx'] + 2 * K
    rec('multi-touch: the plane only follows the thumb (the 2 px twitch), never the tapping finger', abs(t1['tx'] - (t0['tx'] + 4 * K)) < 0.01 and abs(t2['tx'] - want) < 0.01,
        {'tx': [round(t0['tx'], 3), round(t1['tx'], 3), round(t2['tx'], 3)], 'expected': round(want, 3)})
    # the thumb keeps steering afterwards
    await p.ev('touchMove', [(1, 136, 650)], 0.05); await p.pg.wait_for_timeout(150); t3 = await st()
    rec('multi-touch: the thumb still steers after the double tap', abs(t3['tx'] - (t2['tx'] + 30 * K)) < 0.01, {'tx': [round(t2['tx'], 3), round(t3['tx'], 3)], 'expected': round(t2['tx'] + 30 * K, 3)})
    # takeover: a new finger is down, the thumb lifts, the new finger moves 20 px left: no jump
    await p.ev('touchStart', [(1, 136, 650), (4, 250, 500)], 0.05)
    await p.ev('touchEnd', [(1, 136, 650)], 0.05)
    await p.ev('touchMove', [(4, 240, 500)], 0.03); await p.ev('touchMove', [(4, 230, 500)], 0.03)
    await p.pg.wait_for_timeout(150); t4 = await st()
    await p.ev('touchEnd', [], 0.05)
    rec('multi-touch: when the steering finger lifts, the next finger takes over with no jump', abs(t4['tx'] - (t3['tx'] - 20 * K)) < 0.01,
        {'tx': [round(t3['tx'], 3), round(t4['tx'], 3)], 'expected': round(t3['tx'] - 20 * K, 3)})
    rec('multi-touch: no console errors', not p.errs, p.errs[:5])
    await p.close()


def frames(tx, word, exact=False):   # most copies of a string drawn in any one frame
    c = {}
    for fr, s in tx:
        if (s == word) if exact else (word in s): c[fr] = c.get(fr, 0) + 1
    return max(c.values()) if c else 0


async def check_rewards(b):
    STATE = "({drones: __G.S.drones, coins: __G.S.coins, loot: __G.S.lootCoins, gate: __G.S.gateCoins || 0, t: __G.S.t, picks: __G.AUD.pickups.length})"
    p = await Pg().open(b, '?tut=0&drones=50', inits=[INIT_TEXT])
    await p.js('__G.start(); __G.god(true)'); await p.pg.wait_for_timeout(800)

    async def gate(val):
        a = await p.js(STATE)
        await p.js(f'__TX = []; __TXon = true; const g = __G.spawnGate(__G.S.px, {val}); g.z = -0.3;')
        await p.pg.wait_for_timeout(1500); await p.js('__TXon = false')
        return a, await p.js(STATE), await p.js('__TX'), await p.js('(__G.AUD.gatePass || []).slice(-1)')
    a, z, tx, gp = await gate(1000)
    words = sorted(set(s for _, s in tx if s.startswith('+') or 'MAX' in s or 'FULL' in s or s == 'UP'))
    rec('gates: a MAX gate with a full squad keeps 50 drones and pays 50 coins into the stage total', z['drones'] == 50 and z['loot'] - a['loot'] == 50 and z['coins'] - a['coins'] >= 50,
        {'drones': z['drones'], 'lootCoins+': z['loot'] - a['loot'], 'coins+': z['coins'] - a['coins'], 'gateCoins': z['gate'], 'pass': gp})
    rec('gates: its popups are honest (a gold +50 coin pop; no MAX!/+1000, no SQUAD FULL, no UP ring)', '+50' in words and not any(w in words for w in ('MAX!', '+1000', 'UP')) and not any('SQUAD FULL' in w for w in words), {'drawn': words})
    await p.js('__G.setDrones(45)'); await p.pg.wait_for_timeout(3500)   # let the last popups and rings finish
    a, z, tx, gp = await gate(20)
    words = sorted(set(s for _, s in tx if s.startswith('+') or 'FULL' in s or s == 'UP'))
    got = z['drones'] - a['drones']
    rec('gates: a +20 gate with room for 5 gives 5 drones, shows +5 (not +20) and pays the other 15 as 1 coin', got == 5 and '+5' in words and '+20' not in words and z['loot'] - a['loot'] == 1 and 'UP' in words,
        {'got': got, 'lootCoins+': z['loot'] - a['loot'], 'drawn': words, 'pass': gp})
    # the rescued pilot with a full squad
    await p.js('__G.setDrones(50)'); await p.pg.wait_for_timeout(500)
    await p.wait('__G.S.t >= ' + str((await p.js('__G.S.t')) + 2.5), 60000)   # game time, not wall time: the +20 gate's popups and ring must be gone
    a = await p.js(STATE)
    await p.js('__TX = []; __TXon = true; __G.pilots.push({x: __G.S.px, z: -6, t: 0.97, reward: {drones: 8, pilot: true}})')
    await p.pg.wait_for_timeout(1500); await p.js('__TXon = false'); z = await p.js(STATE); tx = await p.js('__TX')
    picks = await p.js(f'__G.AUD.pickups.slice({a["picks"]}).map(x => x[1])')
    words = sorted(set(s for _, s in tx if s.startswith('+') or 'PILOT' in s or 'FULL' in s or s == 'UP'))
    rec('pilot: with a full squad the 8 drones pay 8 x 15 = 120 coins, drones stay 50', z['drones'] == 50 and z['loot'] - a['loot'] == 120, {'drones': z['drones'], 'lootCoins+': z['loot'] - a['loot']})
    rec('pilot: PILOT RESCUED! once (one popup, one pickup), no fake +8, no SQUAD FULL, no UP ring', frames(tx, 'PILOT RESCUED') == 1 and sum('PILOT RESCUED' in x for x in picks) == 1 and '+8' not in words and 'UP' not in words and not any('FULL' in w for w in words) and '+120' in words,
        {'maxPerFrame': frames(tx, 'PILOT RESCUED'), 'pickups': picks, 'drawn': words})
    rec('rewards: no console errors', not p.errs, p.errs[:5])
    await p.close()

    # an Omega orb collected with the bar already full pays 25 coins, not a fake +OMEGA (the level orb at 18 s, x -2.1)
    p = await Pg().open(b, '?tut=0&warp=18&drones=6', inits=[INIT_TEXT])
    await p.js('__G.start(); __G.god(true); __G.omega(1); __TX = []; __TXon = true; window.__om = setInterval(() => { __G.S.omega = 1; __G.S.tx = -2.1; }, 50)')
    a = await p.js(STATE); o0 = await p.js('__G.AUD.orbs')
    try: await p.wait(f'__G.AUD.orbs > {o0}', 90000)
    except Exception: pass
    await p.pg.wait_for_timeout(1200); await p.js('__TXon = false; clearInterval(__om)')
    z = await p.js(STATE); tx = await p.js('__TX'); orbs = await p.js('__G.AUD.orbs')
    words = sorted(set(s for _, s in tx if s.startswith('+')))
    rec('omega orb on a full bar: pays 25 coins, no +OMEGA', orbs > o0 and '+OMEGA' not in words and '+25' in words and z['loot'] - a['loot'] == 25, {'orbs': [o0, orbs], 'lootCoins+': z['loot'] - a['loot'], 'drawn': words})
    await p.close()

    # a crate crash with 1 drone pops -1 (the drone actually lost), not -3 (the crate at 8.4 s, x -2.5, made unbreakable)
    p = await Pg().open(b, '?tut=0&warp=8&drones=1&ts=2', inits=[INIT_TEXT])
    await p.js('__G.start(); __G.god(true); __TX = []; __TXon = true; window.__crSeen = false; window.__cr = setInterval(() => { __G.S.tx = -2.5; for (const q of __G.pods) if (q.reward && q.reward.loot && q.x < -2.4) { q.hp = 1e9; __crSeen = true; } }, 50)')
    try: await p.wait("__crSeen && !__G.pods.some(q => q.reward && q.reward.loot && q.x < -2.4)", 120000)
    except Exception: pass
    await p.pg.wait_for_timeout(700); await p.js('__TXon = false; clearInterval(__cr)')
    tx = await p.js('__TX'); d = await p.js('__G.S.drones')
    minus = sorted(set(s for _, s in tx if s.startswith(MINUS)))
    rec('crate crash: pops the drones actually lost (-1 with one drone, never -3)', (MINUS + '1') in minus and (MINUS + '3') not in minus and d == 0, {'drawn': minus, 'drones': d})
    await p.close()


async def check_level_names(b):
    p = await Pg().open(b, '?tut=0&warp=42&ts=3')
    await p.js('__G.start(); __G.god(true); window.__pods = []; window.__pi = setInterval(() => { for (const q of __G.pods) if (!q.__seen) { q.__seen = 1; __pods.push({x: +q.x.toFixed(2), kind: q.kind, reward: q.reward, t: +__G.S.t.toFixed(1)}); } }, 60)')
    await p.wait('__G.S.t > 46', 120000); await p.js('clearInterval(__pi)')
    pods = await p.js('__pods')
    drones = [q for q in pods if q['reward'] and q['reward'].get('drones')]
    gem = [q for q in pods if q['reward'] and q['reward'].get('loot') == 'gems' and abs(q['x'] - 2.3) < 0.1]
    rec('level: no drone canister any more; a gem crate at x 2.3 in its slot (43 s)', not drones and len(gem) == 1, {'pods': pods})
    await p.close()
    p = await Pg().open(b, '?tut=0&warp=64&ts=2&bosshp=90000')
    await p.js('__G.start(); __G.god(true); __G.showThreat()')
    thr = await p.js("({text: __G.AUD.threat && __G.AUD.threat.text, tape: document.querySelector('#threat .tr-name') && document.querySelector('#threat .tr-name').textContent})")
    await p.wait('!!__G.boss', 60000); bn = await p.js("document.getElementById('bossname').textContent")
    rec('boss: MORDRIX on the hazard tape and the boss bar', 'MORDRIX' in (thr['text'] or '') and thr['tape'] == 'MORDRIX' and bn == 'MORDRIX' and 'QUEEN' not in (thr['text'] or ''), {'threat': thr, 'bossbar': bn})
    await p.close()
    p = await Pg().open(b, '?tut=0')
    await p.js('__G.start(); __G.give({weapon: "beam"})'); await p.pg.wait_for_timeout(300)
    pk = await p.js('__G.AUD.pickups.slice(-1)[0][1]'); w1 = await p.js("document.getElementById('weap').textContent")
    await p.js('__G.setBeam(true)'); await p.pg.wait_for_timeout(200); w2 = await p.js("document.getElementById('weap').textContent")
    rec('saber: the pickup reads SABER BEAM! and the HUD weapon line says SABER', pk == 'SABER BEAM!' and 'SABER' in w1 and w2.startswith('SABER') and 'BEAM' not in w2, {'pickup': pk, 'hudOwned': w1, 'hudOn': w2})
    await p.close()


async def check_tutorials(b):
    p = await Pg().open(b, '?tut=1', dpr=2)
    await p.tap(195, 500, 0, 0.3)
    shown = {}
    for tid, by in (('gates', 12), ('cans', 20)):
        try: await p.wait(f'__G.TUT.id === "{tid}" || __G.S.t > {by}', 180000)
        except Exception: pass
        info = await p.js(f'''(() => {{ const G = __G, on = G.TUT.id === "{tid}"; if (!on) return {{ on, t: G.S.t }};
          const el = document.querySelector('#tut .{'tg-hand' if tid == 'gates' else 'tc-aim'}'); const r = el && el.getBoundingClientRect();
          return {{ on, t: +G.S.t.toFixed(2), anchor: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width)] : null, card: !!document.querySelector('#tut .{'tg-card' if tid == 'gates' else 'tc-card'}') }}; }})()''')
        if info['on']:
            await p.wait('__G.BT.p >= 1', 20000); await p.pg.wait_for_timeout(900)
            # where its target is now on screen (the in-range gate or pod nearest the anchor)
            tgt = await p.js(f'''(() => {{ const G = __G, L = "{tid}" === "gates" ? G.gates.filter(g => !g.passed) : G.pods.filter(q => q.kind !== 'omega');
              return L.map(o => {{ const s = G.toScreen(o.x, "{tid}" === "gates" ? 0 : 0.5, o.z); return [Math.round(s[0]), Math.round(s[1]), +o.z.toFixed(1)]; }}); }})()''')
            info['targets'] = tgt; info['bt'] = await p.js('__G.BT.s')
            if OUT:
                await p.pg.screenshot(path=f'{OUT}/tut_{tid}_a.png'); await p.pg.wait_for_timeout(1300); await p.pg.screenshot(path=f'{OUT}/tut_{tid}_b.png')
            await p.tap(195, 620, 7, 0.4); await p.pg.wait_for_timeout(700)
            info['after'] = await p.js('({id: __G.TUT.id, last: __G.AUD.tut.slice(-1)[0], bt: +__G.BT.p.toFixed(2)})')
        shown[tid] = info
    g, c = shown['gates'], shown['cans']
    near = lambda i, dx, dy: i.get('anchor') and any(abs(t[0] - i['anchor'][0] - dx) < 40 for t in i.get('targets', []))
    rec('tutorial gates: appears once a gate is in bullet range (5 to 10 s), hand on the gate, bullet time at 3%', g['on'] and 5 <= g['t'] <= 10 and near(g, 0, 0) and abs(g['bt'] - 0.03) < 0.005, g)
    rec('tutorial gates: a tap continues', g['on'] and g['after']['id'] is None and g['after']['last'][:2] == ['gates', 'done'], g.get('after'))
    rec('tutorial cans: appears once a crate or canister is in range (10 to 18 s), crosshair on it', c['on'] and 10 <= c['t'] <= 18 and near(c, c.get('anchor', [0, 0, 0])[2] / 2, 0), c)
    rec('tutorial cans: a tap continues', c['on'] and c['after']['id'] is None and c['after']['last'][:2] == ['cans', 'done'], c.get('after'))
    await p.wait('__G.S.t > 22', 180000)
    tut = await p.js('__G.AUD.tut')
    starts = {k: sum(1 for e in tut if e[0] == k and e[1] == 'start') for k in ('gates', 'cans')}
    await p.goto('?ts=2'); await p.js('__G.start()'); await p.wait('__G.S.t > 17', 180000)
    tut2 = await p.js('__G.AUD.tut')
    rec('tutorials gates and cans show once (stored in grokdemo.tut, not again on the next load)', starts == {'gates': 1, 'cans': 1} and not any(e[0] in ('gates', 'cans') for e in tut2),
        {'firstLoad': starts, 'secondLoad': tut2, 'stored': await p.js("localStorage.getItem('grokdemo.tut')")})
    rec('tutorials: no console errors', not p.errs, p.errs[:5])
    await p.close()
    # never near the boss: a run that starts at 55 s shows neither, even with the tutorials reset
    p = await Pg().open(b, '?tut=1&warp=55&ts=2')
    await p.js('__G.start(); __G.god(true)'); await p.wait('__G.S.t > 62', 120000)
    tut = await p.js('__G.AUD.tut')
    rec('tutorials gates and cans never start near the boss (run from 55 s)', not any(e[0] in ('gates', 'cans') for e in tut), {'tut': tut})
    await p.close()


async def check_tut_gestures(b):
    done_all = {'omega': 1, 'omegaFill': 1, 'beamOn': 1, 'beamOff': 1, 'beamRisk': 1, 'gates': 1, 'cans': 1}
    d = dict(done_all); del d['beamOn']
    p = await Pg().open(b, '?weapon=beam', inits=[TUTKEY(d)])
    await p.tap(195, 500, 0, 0.3); await p.pg.wait_for_timeout(600)
    await p.js('__G.god(true); __G.tutWant("beamOn")')
    await p.wait('__G.TUT.id === "beamOn" && __G.BT.p >= 1', 30000); await p.pg.wait_for_timeout(400)
    await p.js('__G.omega(1)'); f0 = await p.js('__G.AUD.omegaFires')
    await p.tap(120, 300, 3, 0.5); await p.tap(122, 302, 4, 0.12); await p.pg.wait_for_timeout(400)
    s = await p.js('({fires: __G.AUD.omegaFires, id: __G.TUT.id, omega: __G.S.omega, glog: __G.GLOG.slice(-3)})')
    rec('tutorial beamOn: a double tap during it does not fire Omega (the tutorial stays)', s['fires'] == f0 and s['id'] == 'beamOn', s)
    await p.ev('touchStart', [(5, 195, 520)], 0.5)
    for k in range(1, 6): await p.ev('touchMove', [(5, 195, 520 - 24 * k)], 0.02)
    await p.ev('touchEnd', [], 0.01); await p.pg.wait_for_timeout(600)
    s2 = await p.js('({id: __G.TUT.id, beamOn: __G.S.beamOn, last: __G.AUD.tut.slice(-1)[0]})')
    rec('tutorial beamOn: the swipe up it teaches still continues it', s2['id'] is None and s2['beamOn'] and s2['last'][:2] == ['beamOn', 'done'], s2)
    await p.close()
    # a death with the beam on must not pop the beam explainer early in the next run
    d = dict(done_all); del d['beamRisk']
    p = await Pg().open(b, '?weapon=beam', inits=[TUTKEY(d)])
    await p.tap(195, 500, 0, 0.3); await p.pg.wait_for_timeout(600)
    await p.js('__G.setBeam(true)'); await p.pg.wait_for_timeout(700)
    await p.js('__G.S.inv = 0; __G.hurt(999)'); await p.wait('__G.S.ended', 30000)
    await p.js('__G.start()'); await p.wait('__G.S.t > 4.5 || __G.TUT.id === "beamRisk"', 90000)   # a leaked explainer would freeze the clock in bullet time
    tut = await p.js('__G.AUD.tut'); state = await p.js('__G.TUT.state || null')
    rec('tutorials: state after a death does not leak into the next run (no beam explainer 2 s in)', not any(e[0] == 'beamRisk' for e in tut) and (state is None or not state['lastBeam']), {'tut': tut, 'state': state})
    await p.close()


async def check_misc(b):
    # the rescued pilot gives nothing after death
    p = await Pg().open(b, '?tut=0')
    await p.js('__G.start()'); await p.pg.wait_for_timeout(600)
    await p.js('__G.setDrones(10); __G.pilots.push({x: 0, z: -6, t: 0.5, reward: {drones: 8, pilot: true}}); __G.S.inv = 0; __G.hurt(999)')
    await p.wait('__G.S.ended', 60000); await p.pg.wait_for_timeout(300)   # the pilot lands 0.5 s in, the SHOT DOWN card 1.6 s in
    s = await p.js("({mode: __G.S.mode, drones: __G.S.drones, rescued: __G.S.rescued, cocoon: __G.AUD.cocoon.map(e => e.ev)})")
    rec('pilot: no reward once the run is over (shot down)', s['mode'] == 'dead' and s['drones'] == 0 and not s['rescued'] and 'rescued' not in s['cocoon'], s)
    await p.close()
    # gate textures and materials are disposed when a gate goes, and on reset
    p = await Pg().open(b, '?tut=0&ts=3')
    await p.js('''__G.start(); __G.god(true); window.__GD = {seen: 0, tex: 0, mat: 0, set: new WeakSet()};
      window.__gi = setInterval(() => { for (const g of __G.gates) if (!__GD.set.has(g)) { __GD.set.add(g); __GD.seen++; g.tex.addEventListener('dispose', () => __GD.tex++); g.sprite.material.addEventListener('dispose', () => __GD.mat++); } }, 40)''')
    await p.wait('__GD.seen - __G.gates.length >= 3 || __G.S.t > 40', 150000)
    a = await p.js('({seen: __GD.seen, alive: __G.gates.length, tex: __GD.tex, mat: __GD.mat, t: __G.S.t})')
    alive = await p.js('__G.gates.length'); await p.js('__G.start()'); await p.pg.wait_for_timeout(300)
    z = await p.js('({tex: __GD.tex, mat: __GD.mat})')
    gone = a['seen'] - a['alive']
    rec('gates: every removed gate disposes its texture and material, and a reset disposes the rest', gone >= 3 and a['tex'] == gone and a['mat'] == gone and z['tex'] - a['tex'] == alive and z['mat'] - a['mat'] == alive,
        {'run': a, 'removed': gone, 'aliveAtReset': alive, 'afterReset': z})
    await p.close()


CHECKS = {'audio': check_audio, 'mt': check_mt, 'rewards': check_rewards, 'names': check_level_names, 'tutorials': check_tutorials, 'tutgest': check_tut_gestures, 'misc': check_misc}


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path=CH, headless=True, args=ARGS)
        for k, f in CHECKS.items():
            if ONLY and k not in ONLY: continue
            t0 = time.time()
            try: await f(b)
            except Exception as e: rec(f'{k}: ran to the end', False, repr(e)[:400])
            print(f'-- {k} took {time.time() - t0:.0f} s', flush=True)
        await b.close()
    print('SUMMARY', sum(ok for _, ok in R), '/', len(R), 'passed;', 'FAILED:', [n for n, ok in R if not ok], flush=True)

asyncio.run(main())
