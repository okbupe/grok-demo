# Round 14: builds assets/coin.png (the front view, 192 px) and assets/coin_spin.png (a 12-frame half turn, 80 px frames,
# with a glint sweeping across the face) from Bupe's coin art. Run it in a folder that holds the cut-outs: front_full.png
# (the front view on a transparent background: an anti-aliased ellipse mask fitted to the coin, pulled in 5 px so no
# blue is left) and sheet0.png, sheet1.png, sheet2.png (the two angled views and the edge view from the second image,
# keyed out of the blue by unmixing against an inpainted background). Then base64 the two PNGs into art/*.png.b64.
from PIL import Image, ImageFilter, ImageChops
import numpy as np, math, os
front=Image.open('front_full.png'); S0=Image.open('sheet0.png'); S1=Image.open('sheet1.png'); E=Image.open('sheet2.png')
a=np.array(E)[...,3]; cov=(a>128).sum(0); cols=np.nonzero(cov>0.8*cov.max())[0]; E=E.crop((max(cols.min()-4,0),0,cols.max()+5,E.height))
def rim(im, px):
    a=im.split()[3]; inner=a.filter(ImageFilter.MinFilter(px*2+1))
    ring=ImageChops.subtract(a,inner).point(lambda v:int(v*0.55))
    col=Image.new('RGBA',im.size,(176,92,0,255)); col.putalpha(ring); out=im.copy(); out.alpha_composite(col); return out
def glint(im, pos, strength, width=0.16):
    w,h=im.size; Y,X=np.mgrid[0:h,0:w].astype(float); u=(X/w)+(Y/h-0.5)*0.55
    band=np.clip(1-np.abs(u-pos)/width,0,1)**1.6*strength
    arr=np.array(im).astype(float); al=arr[...,3:4]/255; arr[...,:3]=arr[...,:3]+(255-arr[...,:3])*band[...,None]*al
    return Image.fromarray(np.clip(arr,0,255).astype(np.uint8),'RGBA')
rim(front.resize((192,192),Image.LANCZOS),1).save('coin.png',optimize=True)
N,FS=12,80; strip=Image.new('RGBA',(FS*N,FS),(0,0,0,0)); H=int(FS*0.94)
for i in range(N):
    th=math.pi*i/N; sx=abs(math.cos(th))
    if sx>=0.88: src=front; tw=max(int(round(H*sx)),2)
    elif sx>=0.2: src=S1 if th<math.pi/2 else S0; tw=int(round(H*max(sx,0.34)*1.02))
    else: src=E; tw=max(int(round(H*E.width/E.height)),4)
    fr=src.resize((tw,H),Image.LANCZOS)
    fr=glint(fr,0.5,0.35,0.5) if src is E else glint(fr,-0.2+1.4*((i/N*2)%1),0.75)
    strip.alpha_composite(rim(fr,1),(i*FS+(FS-tw)//2,(FS-H)//2))
strip.save('coin_spin.png',optimize=True)
print(os.path.getsize('coin.png'),os.path.getsize('coin_spin.png'))
bg=Image.new('RGBA',strip.size,(60,110,60,255)); bg.alpha_composite(strip); bg.resize((strip.width*2,FS*2)).save('spin_chk.png')
