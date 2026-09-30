# Round 13, area B1 (feel): shakes that land, solid bullets, bullet time in colour, the bullet-time buffer and WebGL
# context loss, gates +50%. Every check measures the page the same way on any build (a per-frame sampler reads
# S.shakePx and the HUD's CSS translate; screenshots and the WebGL canvas are sampled for colour), so it can be run on
# the round 13 groundwork (it must FAIL) and on the B1 branch (it must PASS).
#
# usage: python r13_B1.py URL [--only events,omega,crate,boss,gate,bullets,bt,ctx] [--shots DIR --label NAME] [--dpr N]
#   URL is the site root, e.g. http://localhost:8812/ ; flags are added per check.
import argparse, asyncio, io, json, math, os, statistics, sys, time
from playwright.async_api import async_playwright

ap = argparse.ArgumentParser()
ap.add_argument('url'); ap.add_argument('--only', default='events,omega,crate,boss,gate,bullets,bt,ctx')
ap.add_argument('--shots', default=''); ap.add_argument('--label', default='run'); ap.add_argument('--dpr', type=float, default=2)
A = ap.parse_args()
ROOT = A.url if A.url.endswith('/') else A.url + '/'
CHROME = os.environ.get('CHROME') or '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
RES = []
def check(name, ok, info=''):
    RES.append((name, bool(ok))); print(('PASS ' if ok else 'FAIL ') + name + ('  ' + info if info else ''), flush=True)

# per-frame sampler: [real ms, game s, ground px, clouds px, gameplay px, HUD px, omegaT, boss state]
SAMPLER = """() => { if (window.__SMP) return; window.__SMP = []; const hud = document.getElementById('hud');
  const f = () => { const G = window.__G, S = G.S, sp = S.shakePx || [0, 0, 0];
    const m = (hud.style.translate || '').match(/-?[\\d.]+/g) || [];
    window.__SMP.push([performance.now(), S.t, sp[0] || 0, sp[1] || 0, sp[2] || 0, Math.hypot(+m[0] || 0, +m[1] || 0), S.omegaT || 0, G.boss ? G.boss.state : '']);
    if (window.__SMP.length < 30000) requestAnimationFrame(f); };
  requestAnimationFrame(f); }"""

async def open_page(p, query, dpr=1):
    b = await p.chromium.launch(executable_path=CHROME, headless=True, args=ARGS)
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=dpr, is_mobile=True, has_touch=True)
    pg = await ctx.new_page(); errs = []
    pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errs.append(f'pageerror: {e}'))
    await pg.goto(ROOT + query, wait_until='networkidle')
    await pg.wait_for_function('window.__G && __G.S && __G.S.mode === "play"', timeout=40000)
    return b, pg, errs

async def smp(pg, since=0):
    return await pg.evaluate(f'window.__SMP.filter((r) => r[0] >= {since})')

async def trigger(pg, js):   # run js, return the real time just before it
    return await pg.evaluate(f'(() => {{ const t = performance.now(); {js}; return t; }})()')

# Timing checks run the game at a debug time scale (ts, which also scales the shake clock), so even a loaded machine
# rendering at 5 to 10 fps samples every burst finely; times below are in shake time (real ms x ts).
TSF = 0.25
def burst_stats(rows, t0, ts=1):
    after = [r for r in rows if r[0] >= t0]
    if not after: return None
    pk = max(r[4] for r in after)
    last = max([(r[0] - t0) * ts for r in after if r[4] >= 1.5], default=0)
    return {'peakP': round(pk, 1), 'peakG': round(max(r[2] for r in after), 1), 'peakHud': round(max(r[5] for r in after), 1),
            'visibleMs': round(last), 'late': round(max([r[4] for r in after if (r[0] - t0) * ts > 900], default=0), 2), 'frames': len(after)}

# ------------------------------------------------------------------ shake: thud, medium, pickup, and no shake on fire
async def t_events(p):
    b, pg, errs = await open_page(p, f'?autoplay&tut=0&ts={TSF}')
    await pg.wait_for_function('__G.S.t > 0.5', timeout=120000); await pg.evaluate(SAMPLER); await pg.wait_for_timeout(300)
    q0 = await trigger(pg, 'window.__SH0 = __G.AUD.shotsPlane')
    await pg.wait_for_function('__G.AUD.shotsPlane - window.__SH0 >= 8', timeout=120000)
    quiet = [r for r in await smp(pg, q0)]
    shoot = await pg.evaluate('__G.AUD.shotsPlane - window.__SH0')
    check('no shake on normal fire and bullet hits (8+ plane shots)', shoot >= 8 and max(r[4] for r in quiet) < 0.3 and max(r[2] for r in quiet) < 0.3,
          json.dumps({'maxGameplay': max(r[4] for r in quiet), 'maxGround': max(r[2] for r in quiet), 'planeShots': shoot}))
    st = {}; ring = None
    for kind in ('thud', 'medium', 'pickup'):
        t0 = await trigger(pg, f"__G.addShake('{kind}')"); await pg.wait_for_timeout(1300 / TSF)
        st[kind] = burst_stats(await smp(pg, t0 - 50), t0, TSF); print('   ', kind, json.dumps(st[kind]), flush=True)
        if kind == 'thud':   # the game's own per-frame record (AUD.shk ring): every layer, bounded
            ring = await pg.evaluate(f"""(() => {{ const R = __G.AUD.shk; if (!R) return null; const N = Math.min(R.n, R.cap); let pk = [0, 0, 0, 0], n = 0;
              for (let k = R.n - N; k < R.n; k++) {{ const i = k % R.cap; if (R.rt[i] < {t0}) continue; n++; pk = [Math.max(pk[0], R.g[i]), Math.max(pk[1], R.c[i]), Math.max(pk[2], R.p[i]), Math.max(pk[3], R.h[i])]; }}
              return {{ n, cap: R.cap, len: [R.rt.length, R.g.length, R.c.length, R.p.length, R.h.length], ground: +pk[0].toFixed(1), clouds: +pk[1].toFixed(1), gameplay: +pk[2].toFixed(1), hud: +pk[3].toFixed(1) }}; }})()""")
    print('    AUD.shk', json.dumps(ring), flush=True)
    check('__AUDIT records the per-frame offsets of all four layers, in a bounded ring that agrees with the screen',
          bool(ring) and ring['n'] >= 5 and all(l == ring['cap'] for l in ring['len']) and ring['ground'] > ring['clouds'] > ring['gameplay'] > 0 and abs(ring['gameplay'] - st['thud']['peakP']) <= 0.25 * st['thud']['peakP'] + 0.5,
          json.dumps(ring))
    T, M, P = st['thud'], st['medium'], st['pickup']
    check('crate thud: gameplay layer peak >= 9 px', T['peakP'] >= 9, f"{T['peakP']} px")
    check('crate thud: ground layer larger than gameplay (x1.5+)', T['peakG'] >= 1.5 * T['peakP'], f"ground {T['peakG']} px")
    check('crate thud: visible (>= 1.5 px) for 0.30 to 0.65 s, then settled', 300 <= T['visibleMs'] <= 650 and T['late'] < 0.5, f"{T['visibleMs']} ms, after 0.9 s {T['late']} px")
    check('crate thud: HUD still', T['peakHud'] < 0.3, f"{T['peakHud']} px")
    check('big or elite kill: medium, about half a thud', 0.3 <= M['peakP'] / max(T['peakP'], 0.1) <= 0.7 and M['peakHud'] < 0.3, f"{M['peakP']} px")
    check('pickup: small (0.5 to 4.5 px, below medium)', 0.5 <= P['peakP'] <= 4.5 and P['peakP'] < M['peakP'] and P['peakHud'] < 0.3, f"{P['peakP']} px")
    check('events: no console or page errors', not errs, str(errs[:3]))
    await b.close()

# ------------------------------------------------------------------ Omega: continuous rumble incl. the HUD, then a burst
async def t_omega(p):
    b, pg, errs = await open_page(p, f'?autoplay&tut=0&ts={TSF}')
    await pg.wait_for_function('__G.S.t > 0.5', timeout=120000); await pg.evaluate(SAMPLER); await pg.evaluate('__G.god(true)'); await pg.wait_for_timeout(300)
    t0 = await trigger(pg, '__G.omega(1); __G.fireOmega()')
    await pg.wait_for_function('__G.S.omegaT <= 0', timeout=240000); await pg.wait_for_timeout(1500 / TSF)
    rows = await smp(pg, t0)
    om = [r for r in rows if r[6] > 0]
    end = next((r[0] for r in rows if r[0] > om[-1][0]), om[-1][0]) if om else t0
    P = [r[4] for r in om]; Hh = [r[5] for r in om]
    endPk = max([r[4] for r in rows if end <= r[0] <= end + 450 / TSF], default=0)
    hudAfter = max([r[5] for r in rows if r[0] > end + 700 / TSF], default=0)
    info = {'frames': len(om), 'gameplayMedian': round(statistics.median(P), 1) if P else 0, 'gameplay>=3': round(sum(v >= 3 for v in P) / max(1, len(P)), 2),
            'hudMedian': round(statistics.median(Hh), 1) if Hh else 0, 'hudMax': round(max(Hh), 1) if Hh else 0, 'hud>=3': round(sum(v >= 3 for v in Hh) / max(1, len(Hh)), 2),
            'groundMedian': round(statistics.median([r[2] for r in om]), 1) if om else 0, 'endBurst': round(endPk, 1), 'hudAfter': hudAfter}
    print('   omega', json.dumps(info), flush=True)
    check('Omega: a strong rumble for its whole length (gameplay median >= 5 px, >= 3 px in 85% of frames)', len(om) >= 8 and info['gameplayMedian'] >= 5 and info['gameplay>=3'] >= 0.85)
    check('Omega: the HUD rumbles too (median 5 to 11 px, max <= 14, >= 3 px in 80% of frames)', 5 <= info['hudMedian'] <= 11 and info['hudMax'] <= 14 and info['hud>=3'] >= 0.8)
    check('Omega: ends in a burst (gameplay >= 9 px), then the HUD is still again', endPk >= 9 and hudAfter < 0.3)
    check('omega: no console or page errors', not errs, str(errs[:3]))
    await b.close()

# ------------------------------------------------------------------ a real crate broken by gunfire, with its vibration
async def t_crate(p):
    b, pg, errs = await open_page(p, f'?autoplay&tut=0&warp=7.5&ts={TSF}')
    cdp = await pg.context.new_cdp_session(pg)   # one real tap first, so vibration is allowed (userGestured)
    for ty in ('touchStart', 'touchEnd'): await cdp.send('Input.dispatchTouchEvent', {'type': ty, 'touchPoints': [{'x': 60, 'y': 700}] if ty == 'touchStart' else []})
    await pg.evaluate(SAMPLER); await pg.evaluate('__G.god(true); window.__VIB = __G.AUD.vibrate')
    await pg.wait_for_function("__G.AUD.shakeLog.some((e) => e[1] === 'thud')", timeout=400000); await pg.wait_for_timeout(900 / TSF)
    ev = await pg.evaluate("__G.AUD.shakeLog.find((e) => e[1] === 'thud')"); vib = await pg.evaluate('__G.AUD.vibrate - window.__VIB')
    rows = await pg.evaluate('window.__SMP'); i0 = next(i for i, r in enumerate(rows) if r[1] >= ev[0] - 6e-3)
    win = [r for r in rows[i0:] if (r[0] - rows[i0][0]) * TSF <= 450]
    pk = max(r[4] for r in win); pkG = max(r[2] for r in win)
    check('real crate broken by gunfire: gameplay >= 9 px, ground larger, HUD still', pk >= 9 and pkG > pk and max(r[5] for r in win) < 0.3, json.dumps({'t': ev[0], 'gameplay': round(pk, 1), 'ground': round(pkG, 1)}))
    check('real crate: the phone vibrates with the thud (buzz paired)', vib >= 1, f'vibrations {vib}')
    check('crate: no console or page errors', not errs, str(errs[:3]))
    await b.close()

# ------------------------------------------------------------------ the Queen's death: a chain of distinct bursts, then the biggest
async def t_boss(p):
    # The explosions drop headless software rendering to 3 to 7 fps, too coarse to sample 0.3 s bursts, so this check
    # runs the whole game at ts=0.15 (the debug time scale also scales the shake clock): a frame every 20 to 40 ms of shake time.
    b, pg, errs = await open_page(p, '?autoplay&tut=0&warp=66&bosshp=40&drones=6&ts=0.15')
    await pg.evaluate('__G.god(true)'); await pg.evaluate(SAMPLER)
    await pg.wait_for_function("__G.boss && __G.boss.state === 'dying'", timeout=400000)
    await pg.wait_for_function("__G.S.mode === 'win'", timeout=400000); await pg.wait_for_timeout(4000)
    log = await pg.evaluate("__G.AUD.shakeLog.filter((e) => e[1] === 'bomb' || e[1] === 'bossFinal')")
    chain = await pg.evaluate('__G.AUD.bossChain'); rows = await pg.evaluate('window.__SMP')
    idx = [next(i for i, r in enumerate(rows) if r[1] >= e[0] - 6e-3) for e in log]
    bombs = []; bad = []
    for k, e in enumerate(log):
        i0, i1 = idx[k], (idx[k + 1] if k + 1 < len(log) else len(rows))
        w = rows[i0:i1] if i1 > i0 else rows[i0:i0 + 1]
        pk = max(r[4] for r in w[:24]); hud = max(r[5] for r in w[:24])
        tail = [r[4] for r in w if r[0] >= w[0][0] + 0.65 * (w[-1][0] - w[0][0])] if k + 1 < len(log) else [0]
        size = chain[k]['size'] if k < len(chain) else 0
        bombs.append({'kind': e[1], 't': e[0], 'size': size, 'peak': round(pk, 1), 'settle': round(min(tail), 1), 'hud': round(hud, 1)})
    print('   chain', json.dumps(bombs), flush=True)
    B = [x for x in bombs if x['kind'] == 'bomb']; F = [x for x in bombs if x['kind'] == 'bossFinal']
    gaps = [round(B[i + 1]['t'] - B[i]['t'], 2) for i in range(len(B) - 1)]
    check('boss death: at least 4 bombs, then one final blast', len(B) >= 4 and len(F) == 1, f'{len(B)} bombs')
    check('boss death: bombs one after another (every gap >= 0.33 s of game time)', gaps and min(gaps) >= 0.33, f'gaps {gaps}')
    check('boss death: each bomb a burst sized by its explosion (>= 0.65 x 12 px x size / 2.3, <= 15 px)', B and all(x['peak'] >= 0.65 * 12 * x['size'] / 2.3 and x['peak'] <= 15 for x in B),
          str([(x['size'], x['peak']) for x in B]))
    check('boss death: each burst settles before the next bomb (<= 30% of its peak or <= 1.5 px)', B and all(x['settle'] <= max(1.5, 0.3 * x['peak']) for x in B), str([(x['peak'], x['settle']) for x in B]))
    check('boss death: the final blast is the biggest (>= 16 px) with at most a small HUD jolt (<= 7 px)', F and F[0]['peak'] >= 16 and all(F[0]['peak'] > x['peak'] for x in B) and F[0]['hud'] <= 7,
          json.dumps(F[0] if F else None))
    check('boss death: the HUD stays still for the bombs', B and all(x['hud'] < 0.3 for x in B))
    check('boss: no console or page errors', not errs, str(errs[:3]))
    await b.close()

# ------------------------------------------------------------------ gates grow to +50% at MAX
async def t_gate(p):
    b, pg, errs = await open_page(p, '?autoplay&tut=0')
    await pg.wait_for_function('__G.S.t > 1'); await pg.evaluate('__G.god(true); __G.spawnGate(__G.S.px, 990)')
    await pg.wait_for_function('__G.AUD.gateScaleAtMax.length > 0', timeout=90000)
    s = await pg.evaluate('__G.AUD.gateScaleAtMax[0]')
    check('a MAX gate is about 1.5x its base size (gateGrow 0.5)', 1.47 <= s <= 1.53, f'scale {s}')
    check('gate: no console or page errors', not errs, str(errs[:3]))
    await b.close()

# ------------------------------------------------------------------ solid bullets: saturated rounds on screen, every tier
BULLET_JS = """() => new Promise((res) => requestAnimationFrame(() => {
  const gl = document.getElementById('gl'), c = document.createElement('canvas'); c.width = gl.width; c.height = gl.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(gl, 0, 0);
  const k = gl.width / gl.clientWidth, S = __G.S, out = [], H = gl.clientHeight;
  const hr = S.tier === 0 ? [28, 64] : S.tier === 1 ? [0, 40] : [195, 235];
  for (const b of __G.shots) {
    if (b.kind !== 'bullet' || b.drone || b.vz > -40) continue;
    const [x, y] = __G.toScreen(b.x, 0.5, b.z - 0.2 * b.len); if (y < 90 || y > H - 60) continue;
    const hw = Math.max(2, __G.unitPx(b.x, 0.5, b.z) * b.w * 0.5);
    const d = g.getImageData(Math.round((x - hw) * k), Math.round((y - 1) * k), Math.max(1, Math.round(2 * hw * k)), Math.max(1, Math.round(2 * k))).data;
    let best = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], bb = d[i + 2], mx = Math.max(r, gg, bb), mn = Math.min(r, gg, bb); if (mx < 90 || mx === mn) continue;
      let h = mx === r ? 60 * (((gg - bb) / (mx - mn) + 6) % 6) : mx === gg ? 60 * ((bb - r) / (mx - mn) + 2) : 60 * ((r - gg) / (mx - mn) + 4);
      const ch = (mx - mn) / 255; if (h >= hr[0] && h <= hr[1] && ch > best) best = ch;
    }
    out.push(best);
  }
  res({ tier: S.tier, vals: out });
}))"""
async def t_bullets(p):
    for warp, want in ((3, 0), (20, 1), (40, 2)):
        b, pg, errs = await open_page(p, f'?autoplay&tut=0&warp={warp}', A.dpr)
        await pg.evaluate('__G.god(true)'); await pg.wait_for_function(f'__G.S.t > {warp + 2.5}', timeout=60000)
        if A.shots: await pg.screenshot(path=os.path.join(A.shots, f'{A.label}_bullets_warp{warp}.png'))
        vals = []
        for _ in range(6): r = await pg.evaluate(BULLET_JS); vals += r['vals']
        med = statistics.median(vals) if vals else 0
        check(f'bullets tier {want} (warp {warp}): solid saturated rounds on screen (median chroma >= 0.6)', r['tier'] == want and len(vals) >= 5 and med >= 0.6, f'median {med:.2f} over {len(vals)} rounds')
        check(f'bullets warp {warp}: no console or page errors', not errs, str(errs[:3]))
        await b.close()

# ------------------------------------------------------------------ bullet time: the plane, its glow and bars stay in colour
def hsv_stats(img, box, test):
    x0, y0, x1, y1 = [int(round(v)) for v in box]; n = hit = 0; ssum = 0.0
    W, H = img.size; px = img.load()
    for y in range(max(0, y0), min(H, y1)):
        for x in range(max(0, x0), min(W, x1)):
            r, g, b = px[x, y][:3]; mx, mn = max(r, g, b), min(r, g, b); s = 0 if mx == 0 else (mx - mn) / mx; v = mx / 255
            h = 0 if mx == mn else (60 * (((g - b) / (mx - mn)) % 6) if mx == r else 60 * ((b - r) / (mx - mn) + 2) if mx == g else 60 * ((r - g) / (mx - mn) + 4))
            n += 1; ssum += s; hit += 1 if test(h % 360, s, v) else 0
    return (hit / n if n else 0), (ssum / n if n else 0)
GEOM_JS = """() => { const G = __G, S = G.S, d = window.devicePixelRatio;
  const [px, py] = G.planeScreen(), u = G.unitPx(S.px, 0.55, 0), [bx, by] = G.toScreen(S.px, 0.55, 1.15), [nx, ny] = G.toScreen(S.px, 0.62, -1.2);
  return { d, px, py, u, bx, by, nx, ny, hp: S.hp / S.hpMax, omega: S.omega, id: G.TUT.id, p: G.BT.p }; }"""
async def t_bt(p):
    from PIL import Image
    # btbot=999: the bot never answers a tutorial by itself; this check does each gesture once its screenshots are taken
    b, pg, errs = await open_page(p, '?autoplay&tut=1&warp=37&omega=0.99&btbot=999', A.dpr)
    await pg.evaluate('__G.god(true)')
    NEED = {'omega': 'dbltap', 'omegaFill': 'tap', 'beamOn': 'swipe-up', 'beamOff': 'swipe-down', 'beamRisk': 'tap', 'gates': 'tap', 'cans': 'tap'}   # merge: area B2 added gates and cans
    FIVE = {'omega', 'omegaFill', 'beamOn', 'beamOff', 'beamRisk'}
    seen = []; t0 = time.time(); out = {}
    while time.time() - t0 < 600 and not FIVE <= set(seen):
        st = await pg.evaluate('({ id: __G.TUT.id, mode: __G.S.mode })')
        if st['mode'] != 'play': break
        if st['id'] and st['id'] not in seen:
            tid = st['id']; seen.append(tid)
            await pg.wait_for_function('__G.BT.p >= 1', timeout=30000)
            await pg.evaluate('__G.S.barT = 99; __G.S.hp = Math.min(__G.S.hp, 72); __G.S.inv = 0')
            await pg.wait_for_timeout(500)
            for var in ('clean', 'hit'):
                if var == 'hit': await pg.evaluate('__G.S.inv = 0.15'); await pg.wait_for_timeout(400)   # just hit: the flicker is in its see-through phase
                gm = await pg.evaluate(GEOM_JS); png = await pg.screenshot()
                if A.shots: open(os.path.join(A.shots, f'{A.label}_bt_{tid}_{var}.png'), 'wb').write(png)
                img = Image.open(io.BytesIO(png)).convert('RGB'); d = gm['d']
                pw = 2.8 * gm['u'] * 0.42 * d
                plane = hsv_stats(img, (gm['px'] * d - pw, gm['py'] * d - pw * 0.35, gm['px'] * d + pw, gm['py'] * d + pw * 0.45), lambda h, s, v: s > 0.3 and v > 0.35)[0]
                bw = 1.9 * gm['u'] * d; bh = max(5, gm['u'] * 0.16) * d   # the lower half of the filled bar (below its white highlight)
                bar = hsv_stats(img, (gm['bx'] * d - bw * 0.48, gm['by'] * d + bh * 0.5, gm['bx'] * d - bw * 0.1, gm['by'] * d + bh * 0.9), lambda h, s, v: s > 0.35)[0]
                wx = 330 if gm['px'] < 195 else 8   # a patch of world on the side away from the plane
                world = hsv_stats(img, (wx * d, 560 * d, (wx + 52) * d, 660 * d), lambda h, s, v: s > 0.25)[0]
                purple = hsv_stats(img, (gm['nx'] * d - 55 * d, gm['ny'] * d - 55 * d, gm['nx'] * d + 55 * d, gm['ny'] * d + 20 * d), lambda h, s, v: 245 <= h <= 320 and s > 0.2)[0]
                out[(tid, var)] = {'plane': round(plane, 3), 'bar': round(bar, 3), 'world': round(world, 3), 'purple': round(purple, 3)}
                print('   ', tid, var, json.dumps(out[(tid, var)]), flush=True)
            await pg.evaluate(f"__G.S.inv = 0; __G.doGesture('{NEED[tid]}', {{ bot: true }})")
            await pg.wait_for_function('__G.TUT.id === null', timeout=60000)
        await pg.wait_for_timeout(150)
    await pg.wait_for_function('__G.BT.p <= 0', timeout=30000); await pg.wait_for_timeout(500)
    aud = await pg.evaluate('({ t: __G.AUD.btTarget || null, n: __G.AUD.btTargets || 0, freed: __G.AUD.btFreed || 0, tut: __G.AUD.tut.map((e) => e[0] + ":" + e[1]) })')
    print('   bt', json.dumps(aud), flush=True)
    check('bullet time: all five tutorials reproduced', FIVE <= set(seen), str(seen))
    C = [v for (t, var), v in out.items()]
    check("bullet time: the plane's health bar stays in colour in every tutorial", C and all(v['bar'] >= 0.5 for v in C), str([v['bar'] for v in C]))
    check('bullet time: the plane stays in colour even just after a hit (flicker frozen in slow motion)', C and all(out[(t, 'hit')]['plane'] >= 0.85 * out[(t, 'clean')]['plane'] and out[(t, 'hit')]['plane'] >= 0.25 for t in seen),
          str([(t, out[(t, 'clean')]['plane'], out[(t, 'hit')]['plane']) for t in seen]))
    check('bullet time: the Omega charge glow stays purple (omega tutorial)', ('omega', 'clean') in out and out[('omega', 'clean')]['purple'] >= 0.08, str(out.get(('omega', 'clean'))))
    check('bullet time: the world still greys out', C and all(v['world'] <= 0.1 for v in C), str([v['world'] for v in C]))
    ok_t = bool(aud['t']) and aud['t']['bytes'] == aud['t']['w'] * aud['t']['h'] * 4
    check('bullet-time buffer: 8-bit, no MSAA or depth (4 bytes a pixel), and freed once bullet time eases out', ok_t and aud['freed'] >= len(seen) >= 1, json.dumps({**(aud['t'] or {}), 'freed': aud['freed'], 'seen': len(seen), 'targets': aud['n']}))
    check('bt: no console or page errors', not errs, str(errs[:3]))
    await b.close()

# ------------------------------------------------------------------ WebGL context loss never leaves a blank screen
CANVAS_JS = """() => new Promise((res) => requestAnimationFrame(() => { const gl = document.getElementById('gl'), c = document.createElement('canvas');
  c.width = 120; c.height = 260; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(gl, 0, 0, 120, 260);
  const d = g.getImageData(0, 0, 120, 260).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; s += v; s2 += v * v; n++; }
  const m = s / n; res({ mean: m, sd: Math.sqrt(Math.max(0, s2 / n - m * m)) }); }))"""
async def t_ctx(p):
    b, pg, errs = await open_page(p, '?autoplay&tut=0')
    await pg.wait_for_function('__G.S.t > 1.5')
    await pg.evaluate('__G.btEnter()'); await pg.wait_for_function('__G.BT.p >= 1')
    await pg.evaluate("window.__EXT = document.getElementById('gl').getContext('webgl2').getExtension('WEBGL_lose_context'); window.__EXT.loseContext()")
    await pg.wait_for_timeout(600); await pg.evaluate('window.__EXT.restoreContext()'); await pg.wait_for_timeout(1500)
    during = await pg.evaluate(CANVAS_JS); await pg.evaluate('__G.btExit()'); await pg.wait_for_function('__G.BT.p <= 0'); await pg.wait_for_timeout(800)
    after = await pg.evaluate(CANVAS_JS); t1 = await pg.evaluate('__G.S.t'); await pg.wait_for_timeout(800); t2 = await pg.evaluate('__G.S.t')
    check('context lost and restored (in bullet time): the game draws again, in and after bullet time', during['sd'] > 12 and after['sd'] > 12 and t2 > t1, json.dumps({'during': during, 'after': after}))
    real = [e for e in errs if 'CONTEXT_LOST' not in e and 'loseContext' not in e]
    check('context restore: no console or page errors', not real, str(real[:3]))
    # never restored: the page must not stay blank; it reloads (a fresh page view)
    navs = []; pg.on('framenavigated', lambda f: navs.append(f.url) if f == pg.main_frame else None)
    await pg.evaluate("window.__MARK = 1; document.getElementById('gl').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()")
    await pg.wait_for_timeout(8000)
    mark = await pg.evaluate('window.__MARK || 0')
    check('context lost and never restored: the page reloads instead of staying blank', len(navs) >= 1 and mark == 0, f'navigations {len(navs)}')
    await b.close()

async def main():
    if A.shots: os.makedirs(A.shots, exist_ok=True)
    T = {'events': t_events, 'omega': t_omega, 'crate': t_crate, 'boss': t_boss, 'gate': t_gate, 'bullets': t_bullets, 'bt': t_bt, 'ctx': t_ctx}
    async with async_playwright() as p:
        for k in A.only.split(','):
            try: await T[k](p)
            except Exception as e: check(f'{k}: ran to the end', False, repr(e)[:300])
    print('SUMMARY', sum(ok for _, ok in RES), '/', len(RES), 'passed', flush=True)
    sys.exit(0 if all(ok for _, ok in RES) else 1)
asyncio.run(main())
