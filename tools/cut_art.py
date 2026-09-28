#!/usr/bin/env python3
"""Cuts the round-3 sprites out of Bupe's concept sheets (white backgrounds).
Not run in CI: the source sheets are not in the repo. The results live in art/*.webp.b64.
Usage: python3 tools/cut_art.py <attachments_dir> <out_dir_for_previews>

Matte: distance from the (uniform) paper colour gives a soft alpha at the edges; big
paper-coloured regions (including holes between legs) are background, small near-white
specks inside an object (highlights) stay opaque. Edge colours are un-premultiplied
against the paper so there is no white halo, and colours are bled into the transparent
area so GPU filtering never pulls in white or black."""
import os, sys, glob, base64, io
import numpy as np, cv2
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
PREV = sys.argv[2] if len(sys.argv) > 2 else 'src_art/r3'
ART = os.path.join(os.path.dirname(__file__), '..', 'art')
os.makedirs(PREV, exist_ok=True)

def load(prefix):
    p = glob.glob(os.path.join(SRC, prefix + '*'))[0]
    return np.array(Image.open(p).convert('RGB')).astype(np.float32)

def matte(img, region, mode='solid', t_bg=0.07, t_full=0.26, glass_floor=0.4, erase=(), min_hole=120, keep_frac=0.03, join=5, band=3.5):
    H, W = img.shape[:2]
    img = img.copy()
    b = np.concatenate([img[:6].reshape(-1, 3), img[-6:].reshape(-1, 3), img[:, :6].reshape(-1, 3), img[:, -6:].reshape(-1, 3)])
    B = np.median(b, 0)
    for (x0, y0, x1, y1) in erase:
        img[int(y0):int(y1), int(x0):int(x1)] = B
    d = np.abs(img - B).max(2) / 255.0
    near = (d < t_bg).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(near, connectivity=4)
    bg = np.zeros((H, W), bool)
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if a >= min_hole or x == 0 or y == 0 or x + w >= W or y + h >= H:
            bg |= lab == i
    ac = np.clip((d - t_bg * 0.6) / (t_full - t_bg * 0.6), 0, 1)
    if mode == 'glass':
        alpha = np.maximum(ac, glass_floor)
        dist = cv2.distanceTransform((~bg).astype(np.uint8), cv2.DIST_L2, 3)
        alpha = np.where(dist < 2.5, ac, alpha)
    else:
        dist = cv2.distanceTransform((~bg).astype(np.uint8), cv2.DIST_L2, 3)
        alpha = np.where(dist < band, ac, 1.0)
    alpha[bg] = 0
    # choose the components of the wanted view (drops titles, the other view, puddles)
    rx0, ry0, rx1, ry1 = region
    m = (alpha > 0.4).astype(np.uint8)
    mj = cv2.dilate(m, np.ones((join, join), np.uint8))
    n, lab, st, cen = cv2.connectedComponentsWithStats(mj, connectivity=8)
    cand = [i for i in range(1, n) if rx0 * W <= cen[i][0] <= rx1 * W and ry0 * H <= cen[i][1] <= ry1 * H]
    big = max(st[i][4] for i in cand)
    keep = np.isin(lab, [i for i in cand if st[i][4] >= keep_frac * big])
    keep = cv2.dilate(keep.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    alpha = alpha * keep
    # un-premultiply against the paper colour to remove the halo
    a3 = np.maximum(alpha, 1e-3)[..., None]
    F = np.clip(B + (img - B) / a3, 0, 255)
    F = np.where(alpha[..., None] > 0.97, img, F)
    # low alpha pixels: take colour from the nearby solid interior
    solid = (alpha > 0.6).astype(np.float32)
    blur = cv2.GaussianBlur(img * solid[..., None], (0, 0), 3); bw = cv2.GaussianBlur(solid, (0, 0), 3)[..., None] + 1e-5
    fill = blur / bw
    w = np.clip((alpha - 0.15) / 0.45, 0, 1)[..., None]
    F = F * w + fill * (1 - w)
    if mode == 'solid':
        # colour decontamination: edge pixels take the colour of the nearest opaque interior
        inner = (alpha >= 0.95).astype(np.float32)
        acc = np.zeros_like(img); got = np.zeros(alpha.shape, bool)
        for sg in (1.2, 2.5, 5):
            bl = cv2.GaussianBlur(img * inner[..., None], (0, 0), sg); bw2 = cv2.GaussianBlur(inner, (0, 0), sg)
            m = (~got) & (bw2 > 0.02)
            acc[m] = bl[m] / bw2[m][..., None]; got |= m
        edge = (alpha < 0.95) & got
        F[edge] = acc[edge]
    alpha = np.clip((alpha - 0.04) / 0.96, 0, 1)
    ys, xs = np.where(alpha > 0.02)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    rgba = np.dstack([F, alpha * 255])[max(0, y0 - 2):y1 + 2, max(0, x0 - 2):x1 + 2]
    return rgba, (max(0, x0 - 2), max(0, y0 - 2))

def bleed(im):
    a = np.array(im).astype(np.float32); al = a[..., 3] / 255
    rgb = a[..., :3]; acc = np.zeros_like(rgb); wacc = np.zeros(al.shape, np.float32)
    for s in (2, 6, 16):
        acc_s = cv2.GaussianBlur(rgb * al[..., None], (0, 0), s); w_s = cv2.GaussianBlur(al, (0, 0), s)
        m = (wacc < 1e-3) & (w_s > 1e-3)
        acc[m] = acc_s[m] / w_s[m][..., None]; wacc[m] = 1
    out = np.where((al > 0.02)[..., None], rgb, np.where((wacc > 0)[..., None], acc, rgb))
    a[..., :3] = out
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')

def finish(rgba, name, maxw, q=90):
    im = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), 'RGBA')
    if im.width > maxw:
        h = round(im.height * maxw / im.width)
        im = im.convert('RGBa').resize((maxw, h), Image.LANCZOS).convert('RGBA')
    padded = Image.new('RGBA', (im.width + 6, im.height + 6), (0, 0, 0, 0)); padded.paste(im, (3, 3)); im = padded
    im = bleed(im)
    buf = io.BytesIO(); im.save(buf, 'WEBP', quality=q, method=6, exact=True)
    open(os.path.join(ART, name + '.webp.b64'), 'w').write(base64.b64encode(buf.getvalue()).decode())
    im.save(os.path.join(PREV, name + '.png'))
    # previews on dark, checker and sky to inspect halos
    for bgname, col in (('dark', (30, 34, 40)), ('sky', (120, 170, 110))):
        bgi = Image.new('RGBA', im.size, col + (255,)); bgi.alpha_composite(im); bgi.convert('RGB').save(os.path.join(PREV, f'prev_{name}_{bgname}.jpg'), quality=92)
    print(f'{name:14s} {im.size} {len(buf.getvalue())//1024} KB')
    return im

if __name__ == '__main__':
    P = load('69cf3181')  # new player plane, top view (left); propeller blades erased (spun in code)
    finish(matte(P, (0, 0, 0.56, 1), erase=[(200, 110, 343, 151), (413, 110, 560, 151)])[0], 'plane', 420)
    finish(matte(P, (0, 0, 0.56, 1), erase=[(200, 110, 343, 151), (413, 110, 560, 151)])[0], 'icon_drone', 72)
    finish(matte(load('62bf31dd'), (0, 0, 0.49, 1), band=9)[0], 'spider', 240)
    finish(matte(load('4b0450b6'), (0, 0.13, 0.5, 1))[0], 'beetle', 320)
    finish(matte(load('a49050c8'), (0, 0.13, 0.5, 1), mode='glass', t_full=0.42, glass_floor=0.0)[0], 'wasp', 560, q=82)
    finish(matte(load('bb22a56d'), (0, 0.13, 0.5, 1), keep_frac=0.05)[0], 'spitter', 320)
    G = load('534bb3a6')
    for k, name in enumerate(['gate_red', 'gate_gold', 'gate_blue']):
        ox = k * G.shape[1] / 3
        # blades erased above the mast tops; masts kept (props are drawn spinning in code)
        er = [(ox, 0, ox + G.shape[1] / 3, 119)]
        finish(matte(G, (k / 3, 0, (k + 1) / 3, 1), erase=er)[0], name, 560)
    finish(matte(load('3e08f6f0'), (0, 0, 1, 1))[0], 'badge_complete', 820)
    finish(matte(load('f18b3972'), (0, 0, 0.55, 1))[0], 'crate1', 300)
    finish(matte(load('85e6a7e8'), (0, 0, 0.55, 1))[0], 'crate2', 300)
    finish(matte(load('a6e8a046'), (0, 0, 0.58, 1))[0], 'crate_hazard', 360)
    finish(matte(load('4d395972'), (0, 0, 0.42, 1), mode='glass', t_full=0.35, glass_floor=0.35)[0], 'capsule', 280)
    I = load('a9180c05')
    names = ['minigun', 'pistol2', 'grenade', 'revolver', 'laser', 'rockets', 'drumgl', 'bazooka']
    for k, nm in enumerate(names):
        c, r = k % 4, k // 4
        if nm in ('pistol2', 'revolver', 'drumgl', 'grenade', 'laser'): continue  # extras not used yet
        finish(matte(I, (c / 4, r / 2, (c + 1) / 4, (r + 1) / 2))[0], 'icon_' + nm, 220)
    finish(matte(load('cf42cc4b'), (0, 0, 0.5, 1), mode='glass', t_full=0.35, glass_floor=0.45)[0], 'cocoon', 220)
