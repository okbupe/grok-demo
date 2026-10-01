#!/usr/bin/env python3
"""Round 15: the new coin (Bupe's coin_v2.jpg: a front view and two angled views on a blue gradient).
Makes art/coin.png.b64 (front, 192 px) and art/coin_spin.png.b64 (a 12-frame half turn, 80 px frames, glint across
the face). The art has no edge-on view, so near-edge frames are the angled view squashed. Keys the blue with an
orange-minus-blue colour difference (the coin is all orange/brown, the backdrop all blue).
Usage: python3 tools/make_coin_v2.py /workspace/art_inbox/r15/coin_v2.jpg /workspace/r15/art"""
import sys, os, io, math, base64
import numpy as np, cv2
from PIL import Image, ImageFilter, ImageChops
SRC = sys.argv[1] if len(sys.argv) > 1 else '/workspace/art_inbox/r15/coin_v2.jpg'
PREV = sys.argv[2] if len(sys.argv) > 2 else '/workspace/r15/art'
ART = os.path.join(os.path.dirname(__file__), '..', 'art')
im = np.array(Image.open(SRC).convert('RGB')).astype(np.float32)
R, G, B = im[..., 0], im[..., 1], im[..., 2]
d = R - B
a = np.clip((d - 10) / 50, 0, 1)
a = cv2.GaussianBlur(a, (0, 0), 0.7)
solid = (a > 0.5).astype(np.uint8)
solid = cv2.morphologyEx(solid, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(solid)
big = sorted([i for i in range(1, n)], key=lambda i: -st[i][4])[:3]
big.sort(key=lambda i: st[i][0])
def cut(i):
    x, y, w, h, _ = st[i]
    m = (lab == i).astype(np.uint8)
    m = cv2.dilate(m, np.ones((7, 7), np.uint8))
    fill = m.copy(); ff = np.zeros((m.shape[0] + 2, m.shape[1] + 2), np.uint8); cv2.floodFill(fill, ff, (0, 0), 1); holes = (fill == 0)
    al = np.where(holes | (lab == i), 1.0, a * m)                     # inside: solid; edge: keyed
    al = cv2.erode(al, np.ones((3, 3), np.uint8))                     # pull in a px so no blue fringe
    rgb = im.copy()
    # despill: the anti-aliased edge picks up blue; push it toward the coin's edge orange
    spill = np.clip(B - R * 0.6, 0, None); rgb[..., 2] -= spill * (1 - al) * 0.9
    out = np.dstack([np.clip(rgb, 0, 255), al * 255]).astype(np.uint8)[y - 4:y + h + 4, x - 4:x + w + 4]
    return Image.fromarray(out, 'RGBA')
front, S1, S2 = (cut(i) for i in big)
def rim(im, px):
    a = im.split()[3]; inner = a.filter(ImageFilter.MinFilter(px * 2 + 1))
    ring = ImageChops.subtract(a, inner).point(lambda v: int(v * 0.55))
    col = Image.new('RGBA', im.size, (150, 70, 0, 255)); col.putalpha(ring); out = im.copy(); out.alpha_composite(col); return out
def glint(im, pos, strength, width=0.16):
    w, h = im.size; Y, X = np.mgrid[0:h, 0:w].astype(float); u = (X / w) + (Y / h - 0.5) * 0.55
    band = np.clip(1 - np.abs(u - pos) / width, 0, 1) ** 1.6 * strength
    arr = np.array(im).astype(float); al = arr[..., 3:4] / 255; arr[..., :3] = arr[..., :3] + (255 - arr[..., :3]) * band[..., None] * al
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')
def sq(im):  # square the front view
    s = max(im.size); p = Image.new('RGBA', (s, s), (0, 0, 0, 0)); p.paste(im, ((s - im.width) // 2, (s - im.height) // 2)); return p
coin = rim(sq(front).resize((192, 192), Image.LANCZOS), 1)
N, FS = 12, 80; strip = Image.new('RGBA', (FS * N, FS), (0, 0, 0, 0)); H = int(FS * 0.94)
Smir = S1.transpose(Image.FLIP_LEFT_RIGHT)   # the angled views both show the left edge; mirror one for the far half
for i in range(N):
    th = math.pi * i / N; sx = abs(math.cos(th))
    if sx >= 0.88: src = sq(front); tw = max(int(round(H * sx)), 2)
    else:
        src = S1 if th < math.pi / 2 else Smir
        tw = int(round(H * src.width / src.height * max(sx / 0.75, 0.22))) if sx < 0.75 else int(round(H * src.width / src.height))
    fr = src.resize((max(tw, 4), H), Image.LANCZOS)
    fr = glint(fr, -0.2 + 1.4 * ((i / N * 2) % 1), 0.6)
    strip.alpha_composite(rim(fr, 1), (i * FS + (FS - fr.width) // 2, (FS - H) // 2))
for name, img in (('coin', coin), ('coin_spin', strip)):
    buf = io.BytesIO(); img.save(buf, 'PNG', optimize=True)
    open(os.path.join(ART, name + '.png.b64'), 'w').write(base64.b64encode(buf.getvalue()).decode())
    img.save(os.path.join(PREV, name + '.png')); print(name, img.size, len(buf.getvalue()) // 1024, 'KB')
bg = Image.new('RGBA', (strip.width, FS * 2 + 200), (60, 110, 60, 255)); bg.alpha_composite(strip); bg.alpha_composite(coin, (0, FS + 4))
d2 = Image.new('RGBA', (200, 196), (30, 34, 40, 255)); d2.alpha_composite(coin, (4, 2)); bg.alpha_composite(d2, (200, FS + 4))
bg.convert('RGB').save(os.path.join(PREV, 'prev_coin.jpg'), quality=90)
