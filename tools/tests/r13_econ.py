# usage: r13_econ.py URL [SHOTDIR]  -> round 13 arena fixes (economy critic): the Workshop's Revenue pays on the boss,
# Damage and Fire Rate reach the Saber Beam, the pilot's label says what you will really get (the coins when the squad
# is full), coin popups carry a coin, a gate gain makes at most three +1 pops. Canvas text is read by wrapping strokeText; SHOTDIR gets DPR 2 screenshots.
import os, sys, json, time, asyncio
from playwright.async_api import async_playwright
URL = sys.argv[1].rstrip('/') + '/'
SHOT = sys.argv[2] if len(sys.argv) > 2 else None
CH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
READY = 'window.__G && document.getElementById("loading").textContent === ""'
R, ERRS = [], []
def rec(name, ok, info=''): R.append((name, ok)); print(('PASS ' if ok else 'FAIL ') + name, json.dumps(info)[:400], flush=True)
# every string the overlay strokes (comic numbers and labels), and every coin image drawn next to one
POPS = """(() => { const P0 = Array.prototype.push; window.__POPS = [];
  Array.prototype.push = function (...a) { const o = a[0]; if (a.length === 1 && o && typeof o === 'object' && typeof o.text === 'string' && 'comic' in o && 'stroke' in o && window.__POPS.length < 2000) P0.call(window.__POPS, o.text); return P0.apply(this, a); }; })();"""
TEXTS = """(() => { window.__TX = []; const S0 = CanvasRenderingContext2D.prototype.strokeText;
  CanvasRenderingContext2D.prototype.strokeText = function (s, ...a) { if (window.__TX.length < 4000) window.__TX.push(String(s)); return S0.call(this, s, ...a); }; })();"""

async def page(b, q, ws=None, dpr=1):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=dpr, is_mobile=True, has_touch=True)
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: ERRS.append(str(e))); pg.on('console', lambda m: ERRS.append(m.text) if m.type == 'error' else None)
    await pg.add_init_script(TEXTS); await pg.add_init_script(POPS)
    if ws is not None: await pg.add_init_script(f"if (!sessionStorage.getItem('s')) {{ sessionStorage.setItem('s', 1); localStorage.setItem('jc.workshop', JSON.stringify({json.dumps(ws)})); }}")
    await pg.goto(URL + q, wait_until='networkidle'); await pg.wait_for_function(READY, timeout=60000); await pg.wait_for_timeout(300)
    return ctx, pg

async def game_t(pg, dt):
    t0 = await pg.evaluate('__G.S.t'); await pg.wait_for_function(f'__G.S.t >= {t0 + dt}', timeout=180000, polling=100)

PIN = """(() => { window.__tg = __G.spawnBug(__G.S.px, -11, 'brute', 1e7); window.__keep = true;
  const pin = () => { if (!window.__keep) return; const t = window.__tg; t.x = __G.S.px; t.z = -11; t.vx = 0; t.vz = 0; t.state = 'in'; t.hp = Math.max(t.hp, 1);
    const B = __G.bugs; for (let i = B.length - 1; i >= 0; i--) if (B[i] !== t) B.splice(i, 1); __G.pods.length = 0; };
  window.__pinI = setInterval(pin, 4); })()"""

async def saber(b, ws):
    ctx, pg = await page(b, '?tut=0&warp=4&drones=0', ws)
    await pg.evaluate('__G.start()'); await pg.wait_for_function("__G.S.mode === 'play'"); await pg.wait_for_timeout(400)
    await pg.evaluate("__G.god(true); __G.S.tier = 0; __G.S.rapidLv = 0; __G.S.rocketLv = 0; __G.S.bazookaLv = 0; __G.setDrones(0)")
    await pg.evaluate(PIN); await pg.evaluate("__G.S.beamOwned = true; __G.setBeam(true)"); await pg.wait_for_timeout(300)
    s0 = await pg.evaluate('[__G.S.t, window.__tg.hp, __G.S.primary]'); await game_t(pg, 3.0); s1 = await pg.evaluate('[__G.S.t, window.__tg.hp, __G.S.primary]')
    await pg.evaluate('window.__keep = false; clearInterval(window.__pinI)'); await ctx.close()
    return round((s0[1] - s1[1]) / (s1[0] - s0[0]), 1), s1[2]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CH, headless=True, args=ARGS)
        # 1) Revenue x2 (six pips on the track) doubles MORDRIX's 300 coins
        ctx, pg = await page(b, '?tut=0&warp=64&bosshp=5&autoplay&ts=2', {'rate': 0, 'dmg': 0, 'rev': 6})
        await pg.evaluate('__G.start()'); await pg.wait_for_function("__G.S.mode === 'play'"); await pg.evaluate('__G.god(true)')
        await pg.wait_for_function('__G.AUD.coins && __G.AUD.coins.queen > 0', timeout=600000, polling=250)
        q = await pg.evaluate("[__G.AUD.coins.queen, JCMETA.mult('rev')]")
        rec("Revenue x2 pays on the boss (MORDRIX's 300 coins become 600)", q[0] == 600, {'queen': q[0], 'rev': q[1]})
        await ctx.close()
        # 2) Damage x1.5 and Fire Rate x1.5 reach the Saber Beam (about x2.25, like the guns)
        d1, pr1 = await saber(b, {'rate': 0, 'dmg': 0, 'rev': 0}); d2, pr2 = await saber(b, {'rate': 6, 'dmg': 6, 'rev': 0})
        rec('the Saber Beam scales with Damage and Fire Rate (x1.5 each gives at least x2)', pr1 == 'beam' and pr2 == 'beam' and d2 >= 2.0 * d1, {'x1': d1, 'x1.5x1.5': d2, 'ratio': round(d2 / max(d1, 0.01), 2)})
        # 3) the pilot's label: full squad shows the coins (+120 with a coin), room for 3 shows +3, never a fake +8
        ctx, pg = await page(b, '?tut=0&warp=4', dpr=2 if SHOT else 1)
        await pg.evaluate('__G.start()'); await pg.wait_for_function("__G.S.mode === 'play'"); await pg.evaluate('__G.god(true); __G.setDrones(50)')
        await pg.evaluate("__G.spawnCocoon({ x: 0, z: -16, drones: 8, hp: 1e6 })"); await pg.wait_for_timeout(600)
        await pg.evaluate('window.__TX.length = 0'); await pg.wait_for_timeout(500)
        full = await pg.evaluate("[...new Set(window.__TX.filter(s => /^\\+\\d+$/.test(s)))]")
        if SHOT: await pg.screenshot(path=os.path.join(SHOT, 'econ_cocoon_full.png'))
        await pg.evaluate('__G.setDrones(47); window.__TX.length = 0'); await pg.wait_for_timeout(500)
        room = await pg.evaluate("[...new Set(window.__TX.filter(s => /^\\+\\d+$/.test(s)))]")
        rec('pilot label: a full squad shows the coins it pays (+120), not +8', '+120' in full and '+8' not in full, {'full': full})
        rec('pilot label: room for 3 shows +3, not +8', '+3' in room and '+8' not in room, {'room3': room})
        # 4) a gate over a full squad pops its coins with a coin in front: the coin number is stroked straight after a
        # coin image is drawn (comicCoin), and never without one (on-screen canvas only; the HUD's flying coins are the 22 px ones)
        await pg.evaluate('__G.setDrones(50); __G.cocoons.length = 0')   # the cocoon's own coin label is not part of this check
        await pg.evaluate("""(() => { const L = window.__CI = { withCoin: 0, bare: 0 }; let coin = false;
          const D0 = CanvasRenderingContext2D.prototype.drawImage, S0 = CanvasRenderingContext2D.prototype.strokeText;
          CanvasRenderingContext2D.prototype.drawImage = function (img, ...a) { if (this.canvas.isConnected) coin = !!(img && img.width === 64 && img.height === 64 && a.length === 4 && a[2] !== 22); return D0.call(this, img, ...a); };
          CanvasRenderingContext2D.prototype.strokeText = function (t, ...a) { if (window.__want && this.canvas.isConnected && String(t) === window.__want) { if (coin) L.withCoin++; else L.bare++; } return S0.call(this, t, ...a); }; })()""")
        await pg.evaluate('__G.spawnGate(__G.S.px, 400, -9)')
        await pg.wait_for_function("(__G.AUD.bonusCoins || []).some(e => e.why === 'gate')", timeout=120000, polling=50)
        await pg.evaluate("window.__want = '+' + __G.AUD.bonusCoins.filter(e => e.why === 'gate')[0].coins"); await pg.wait_for_timeout(400)
        if SHOT: await pg.screenshot(path=os.path.join(SHOT, 'econ_gate_coins.png'))
        gc = await pg.evaluate("[window.__want, window.__CI.withCoin, window.__CI.bare]")
        rec('gate coins pop with a coin in front of the number (never a bare number)', gc[1] > 0 and gc[2] == 0, {'number': gc[0], 'withCoin': gc[1], 'bare': gc[2]})
        # 5) a gate gain: its own +N, and a +1 on three drones at most (up to 14 of them buried every other popup)
        n0 = await pg.evaluate('(__G.AUD.gatePass || []).length')
        await pg.evaluate('__G.setDrones(10); window.__POPS.length = 0; __G.spawnGate(__G.S.px, 12, -9)')
        await pg.wait_for_function(f"(__G.AUD.gatePass || []).length > {n0}", timeout=120000, polling=50); await pg.wait_for_timeout(1500)
        e = await pg.evaluate('__G.AUD.gatePass[__G.AUD.gatePass.length - 1]'); pp = await pg.evaluate('window.__POPS.slice()')
        rec('a gate gain shows its +N and at most three +1 pops', ('+' + str(e['got'])) in pp and pp.count('+1') <= 3, {'gate': e, 'pops': pp[:24]})
        await ctx.close()
        rec('no console or page errors', not ERRS, ERRS[:5])
        await b.close()
    print('SUMMARY', sum(ok for _, ok in R), '/', len(R), flush=True)
asyncio.run(main())
