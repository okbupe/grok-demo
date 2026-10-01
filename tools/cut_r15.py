#!/usr/bin/env python3
"""Round 15: cuts Bupe's round-15 art (1 Oct 2026) into the repo's art/*.b64 files.
Not run in CI: the source sheets live on the agent box in /workspace/art_inbox/r15/ (not in any repo).
Usage: python3 tools/cut_r15.py /workspace/art_inbox/r15 /workspace/r15/art
Makes: patchwork (the post-crash jet, top view, nose up, gun barrels shortened by about half), lawnmower_dead (the
totalled Lawnmower: the round-2 plane darkened and scorched), wreck (a small scorched drone wreck for Mission 3),
hand (the tutorial glove: stripes removed, cuff filled blue), card_depot / card_hangar / card_workshop (the home
cards), ico_base / ico_shop / ico_settings / ico_help (white glyphs, alpha keyed off the navy). The coin is made by
tools/make_coin_v2.py."""
import os, sys, io, base64
import numpy as np, cv2
from PIL import Image, ImageFilter
sys.path.insert(0, os.path.dirname(__file__))
from cut_art import matte, bleed   # the round-3 matte (paper keying, un-premultiplied edges, colour bleed)

SRC = sys.argv[1] if len(sys.argv) > 1 else '/workspace/art_inbox/r15'
PREV = sys.argv[2] if len(sys.argv) > 2 else '/workspace/r15/art'
ART = os.path.join(os.path.dirname(__file__), '..', 'art')
os.makedirs(PREV, exist_ok=True)

def save(im, name, fmt='WEBP', q=88):
    buf = io.BytesIO()
    if fmt == 'WEBP': im.save(buf, 'WEBP', quality=q, method=6, exact=True)
    else: im.save(buf, 'PNG', optimize=True)
    ext = 'webp' if fmt == 'WEBP' else 'png'
    open(os.path.join(ART, f'{name}.{ext}.b64'), 'w').write(base64.b64encode(buf.getvalue()).decode())
    im.save(os.path.join(PREV, name + '.png'))
    for bgname, col in (('dark', (30, 34, 40)), ('sky', (120, 170, 220))):
        b = Image.new('RGBA', im.size, col + (255,)); b.alpha_composite(im.convert('RGBA')); b.convert('RGB').save(os.path.join(PREV, f'prev_{name}_{bgname}.jpg'), quality=90)
    print(f'{name:16s} {im.size} {len(buf.getvalue()) // 1024} KB')

def fit(im, maxw=None, maxh=None):
    w, h = im.size; s = min((maxw or w) / w, (maxh or h) / h, 1)
    if s < 1: im = im.convert('RGBa').resize((round(w * s), round(h * s)), Image.LANCZOS).convert('RGBA')
    p = Image.new('RGBA', (im.width + 6, im.height + 6), (0, 0, 0, 0)); p.paste(im, (3, 3)); return bleed(p)

# ---------------------------------------------------------------- the Patchwork (top view = in flight)
def patchwork():
    img = np.array(Image.open(os.path.join(SRC, 'patchwork_ref.jpg')).convert('RGB')).astype(np.float32)
    k = 2752 / 1024
    # shorten both wing guns by about half: keep the housing and a stub of the perforated barrel, then the muzzle
    # piece moved in to meet it; everything beyond is paper again (the guns grow back with upgrades later)
    for (y0, y1, x_stub, x_muz, x_end) in ((130 + 40 / k, 130 + 105 / k, 160, 235, 292), (380 + 30 / k, 380 + 100 / k, 160, 240, 298)):
        Y0, Y1 = int(y0 * k), int(y1 * k); ox = int(280 * k)
        xs, xm, xe = ox + x_stub, ox + x_muz, ox + x_end + 6
        band = img[Y0:Y1].copy()
        muz = band[:, xm:xe].copy()
        band[:, xs:] = 255
        band[:, xs:xs + muz.shape[1]] = muz
        img[Y0:Y1] = band
    rgba, _ = matte(img, (0, 0, 0.56, 1), band=3.5)
    im = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), 'RGBA').rotate(90, expand=True, resample=Image.BICUBIC)
    a = np.array(im)[..., 3]; ys, xs = np.where(a > 8); im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    im = fit(im, 400)
    save(im, 'patchwork')
    return im

# ---------------------------------------------------------------- the totalled Lawnmower (darkened, scorched, holed)
def scorch(im, seed, dark=0.42, burn=0.75, holes=3):
    rng = np.random.default_rng(seed)
    a = np.array(im.convert('RGBA')).astype(np.float32); H, W = a.shape[:2]
    rgb = a[..., :3]; al = a[..., 3:]
    g = rgb.mean(2, keepdims=True); rgb = rgb * 0.45 + g * 0.55          # desaturate
    rgb = rgb * dark                                                      # darken
    n = cv2.GaussianBlur(rng.random((H, W)).astype(np.float32), (0, 0), max(W, H) / 22)
    n = (n - n.min()) / (n.max() - n.min() + 1e-6)
    soot = np.clip((n - 0.45) / 0.3, 0, 1)[..., None] * burn
    rgb = rgb * (1 - soot * 0.8) + np.array([28, 16, 8]) * soot * 0.35    # soot blotches, brown-black
    edge = cv2.GaussianBlur((al[..., 0] > 128).astype(np.float32), (0, 0), 3)
    rim = np.clip((0.85 - edge) * 3, 0, 1)[..., None]                     # charred edges
    rgb = rgb * (1 - rim * 0.6)
    for _ in range(holes):                                                # torn holes with glowing ember rims
        cy, cx = rng.integers(H * 0.25, H * 0.75), rng.integers(W * 0.2, W * 0.8); r = rng.uniform(0.035, 0.06) * W
        Y, X = np.mgrid[0:H, 0:W]; d = np.hypot((Y - cy) * 1.2, X - cx) / r + cv2.GaussianBlur(rng.random((H, W)).astype(np.float32), (0, 0), 2) * 0.6
        hole = d < 0.8; ring = (d >= 0.8) & (d < 1.25)
        al[hole] = 0; rgb[ring] = rgb[ring] * 0.35 + np.array([150, 50, 10]) * 0.25
    a[..., :3] = np.clip(rgb, 0, 255); a[..., 3:] = al
    return Image.fromarray(a.astype(np.uint8), 'RGBA')

def lawnmower_dead():
    p = Image.open(io.BytesIO(base64.b64decode(open(os.path.join(ART, 'r2_plane.webp.b64')).read()))).convert('RGBA')
    d = scorch(p, 7)
    save(d, 'lawnmower_dead')
    w = scorch(p, 21, dark=0.5, burn=0.9, holes=2).rotate(-28, expand=True, resample=Image.BICUBIC)   # a downed drone, tilted
    a = np.array(w)[..., 3]; ys, xs = np.where(a > 8); w = w.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    save(fit(w, 240), 'wreck')

# ---------------------------------------------------------------- the tutorial hand
def hand():
    im = Image.open(os.path.join(SRC, 'hand_pointer.png')).convert('RGBA'); a = np.array(im).astype(np.float32)
    H, W = a.shape[:2]; k = W / 874
    rgb = a[..., :3]; al = a[..., 3]
    # the background (outside the outline) is transparent or white: flood from the corners
    dark = (rgb.mean(2) < 110) & (al > 128)
    inside = (~dark).astype(np.uint8)
    n, lab = cv2.connectedComponents(inside, connectivity=4)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border)) & ~dark
    # erase the three stripe strokes on the back of the hand (dark marks fully inside the glove, in that region)
    sx0, sy0, sx1, sy1 = int(470 * k), int(640 * k), int(735 * k), int(870 * k)
    reg = np.zeros_like(dark); reg[sy0:sy1, sx0:sx1] = True
    nd, ld, sd, _ = cv2.connectedComponentsWithStats(dark.astype(np.uint8), connectivity=8)
    gone = np.zeros(dark.shape, np.uint8)
    for i in range(1, nd):
        x, y, w, h, ar = sd[i]
        if x >= sx0 and y >= sy0 and x + w <= sx1 and y + h <= sy1: gone[ld == i] = 1
    gone = cv2.dilate(gone, np.ones((9, 9), np.uint8)).astype(bool)   # take the anti-aliased fringe too
    dark[gone] = False; rgb[gone] = 255
    # any leftover grey fringe in that box that is well away from the glove outline -> white
    near = cv2.dilate(dark.astype(np.uint8), np.ones((25, 25), np.uint8)).astype(bool)
    fr = reg & ~near & (rgb.mean(2) < 252); rgb[fr] = 255
    # the cuff: the closed white region at the bottom (below the wrist line) -> the in-game hand's blue
    reg2 = np.zeros_like(dark); reg2[int(860 * k):, :] = True
    white = (~dark) & (~bg)
    n2, l2, s2, _ = cv2.connectedComponentsWithStats((white & reg2).astype(np.uint8), connectivity=4)
    for i in range(1, n2):
        x, y, w, h, ar = s2[i]
        if ar > 2000 and y > int(870 * k): rgb[l2 == i] = (61, 139, 255)
    # a lighter band at the cuff's top edge, as on the old hand
    al = np.where(bg, 0, 255).astype(np.float32)
    al = cv2.GaussianBlur(al, (0, 0), 0.8)
    out = np.dstack([rgb, al]).astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')
    a2 = np.array(im)[..., 3]; ys, xs = np.where(a2 > 8); im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    im = fit(im, 192)
    save(im, 'hand', 'PNG')

# ---------------------------------------------------------------- the home cards
def cards():
    im = Image.open(os.path.join(SRC, 'cards_chosen.jpg')).convert('RGB'); k = 2752 / 1024
    a = np.array(im).astype(np.float32)
    boxes = {'depot': (22, 33, 340, 532), 'hangar': (354, 33, 672, 532), 'workshop': (686, 33, 1003, 532)}
    for n, (x0, y0, x1, y1) in boxes.items():
        X0, Y0, X1, Y1 = int(x0 * k), int(y0 * k), int(x1 * k), int(y1 * k)
        c = im.crop((X0, Y0, X1, Y1)).convert('RGBA')
        # rounded-rect mask a few px inside the outer frame (the ornate corners stay, the dark backdrop goes)
        w, h = c.size; m = Image.new('L', (w * 4, h * 4), 0)
        from PIL import ImageDraw
        ImageDraw.Draw(m).rounded_rectangle((8, 8, w * 4 - 8, h * 4 - 8), radius=60, fill=255)
        m = m.resize((w, h), Image.LANCZOS); c.putalpha(m)
        save(fit(c, 300, 480), 'card_' + n, q=84)

# ---------------------------------------------------------------- the top-left home icons (white on navy)
def icons():
    im = np.array(Image.open(os.path.join(SRC, 'icons_topleft.jpg')).convert('RGB')).astype(np.float32)
    bgc = np.median(np.concatenate([im[:20].reshape(-1, 3), im[-20:].reshape(-1, 3)]), 0)
    # alpha = how far each pixel is from navy towards white
    alpha = np.clip(((im - bgc) / (255 - bgc)).min(2), 0, 1)
    alpha = np.clip((alpha - 0.08) / 0.84, 0, 1)
    H, W = alpha.shape
    q = {'shop': (0, 0), 'settings': (1, 0), 'base': (0, 1), 'help': (1, 1)}
    for n, (cx, cy) in q.items():
        sub = alpha[cy * H // 2:(cy + 1) * H // 2, cx * W // 2:(cx + 1) * W // 2]
        ys, xs = np.where(sub > 0.05); sub = sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        s = max(sub.shape); pad = np.zeros((s, s), np.float32); oy, ox = (s - sub.shape[0]) // 2, (s - sub.shape[1]) // 2; pad[oy:oy + sub.shape[0], ox:ox + sub.shape[1]] = sub
        g = Image.fromarray((pad * 255).astype(np.uint8), 'L').resize((128, 128), Image.LANCZOS)
        out = Image.new('RGBA', (136, 136), (255, 255, 255, 0)); white = Image.new('RGBA', (128, 128), (255, 255, 255, 255)); white.putalpha(g); out.paste(white, (4, 4), white)
        save(out, 'ico_' + n, 'PNG')

if __name__ == '__main__':
    what = sys.argv[3:] or ['patchwork', 'dead', 'hand', 'cards', 'icons']
    if 'patchwork' in what: patchwork()
    if 'dead' in what: lawnmower_dead()
    if 'hand' in what: hand()
    if 'cards' in what: cards()
    if 'icons' in what: icons()
