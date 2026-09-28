#!/usr/bin/env python3
"""Procedurally generates the Grok Demo world textures (terrain, clouds, smoke).
Usage: python3 tools/build_assets.py <out_dir>"""
import os, sys
import numpy as np, cv2
from PIL import Image
from scipy.spatial import cKDTree
OUT = sys.argv[1] if len(sys.argv) > 1 else 'assets'
os.makedirs(OUT, exist_ok=True)

def premul_fix(im):
    a=np.array(im).astype(np.float32); al=a[:,:,3:4]/255
    rgb=a[:,:,:3]
    blur=cv2.GaussianBlur(rgb*al,(0,0),4); bw=cv2.GaussianBlur(al,(0,0),4)+1e-4
    fill=blur/bw[...,None] if bw.ndim==2 else blur/bw
    out=np.where(al>0.5,rgb,fill*(1-al)+rgb*al)
    a[:,:,:3]=out; return Image.fromarray(np.clip(a,0,255).astype(np.uint8))

def save(im,name,maxw=None,q=88):
    if maxw and im.width>maxw: im=im.resize((maxw,int(im.height*maxw/im.width)),Image.LANCZOS)
    im.save(os.path.join(OUT,name+'.webp'),quality=q,method=6); return im

# ------------------------------------------------------------------ terrain
rng=np.random.default_rng(7)
N=2048
def pnoise(scale, seed):
    r=np.random.default_rng(seed); w=r.standard_normal((N,N))
    f=np.fft.fft2(w); kx=np.fft.fftfreq(N)[None,:]; ky=np.fft.fftfreq(N)[:,None]
    k=np.sqrt(kx**2+ky**2)*N
    f*=np.exp(-(k/scale)**2)
    n=np.real(np.fft.ifft2(f)); n=(n-n.mean())/n.std(); return n
yy,xx=np.mgrid[0:N,0:N].astype(np.float32)
# --- sea mask: sea band around x=N*0.25 (left half), land right half
base=np.sin(2*np.pi*(xx/N))  # +1 at x=N/4
n1=pnoise(6,1); n2=pnoise(18,2); n3=pnoise(60,3)
seaf=base*1.0+0.55*n1+0.22*n2+0.06*n3
sea=seaf>0.05
# islands smoothing
sea=cv2.morphologyEx(sea.astype(np.uint8),cv2.MORPH_OPEN,np.ones((9,9),np.uint8)).astype(bool)
land=~sea
def pdist(mask):
    # periodic distance transform: tile 3x3 then crop
    t=np.tile(mask.astype(np.uint8),(3,3))
    d=cv2.distanceTransform(t,cv2.DIST_L2,5)
    return d[N:2*N,N:2*N]
dl=pdist(land)   # distance inside land to sea
ds=pdist(sea)    # distance inside sea to land
# --- fields: warped periodic voronoi on jittered grid
cw,ch=78,58
gx,gy=np.meshgrid(np.arange(0,N,cw),np.arange(0,N,ch))
pts=np.stack([gx.ravel()+rng.uniform(-cw*.35,cw*.35,gx.size), gy.ravel()+rng.uniform(-ch*.35,ch*.35,gy.size)],1)%N
tree=cKDTree(pts,boxsize=N)
wx=xx+pnoise(10,4)*7+pnoise(40,14)*2.5; wy=yy+pnoise(10,5)*7+pnoise(40,15)*2.5
d,idx=tree.query(np.stack([wx.ravel()%N,wy.ravel()%N],1),k=2)
idx0=idx[:,0].reshape(N,N); edge=(d[:,1]-d[:,0]).reshape(N,N)
pal=np.array([(112,142,72),(128,152,78),(98,128,66),(140,160,88),(150,165,96),(208,164,112),(196,150,100),(214,190,132),(176,140,96),(120,150,90),(86,118,64)],np.float32)
wts=np.array([14,12,10,9,6,8,6,6,5,8,5],np.float32); wts/=wts.sum()
cid=rng.choice(len(pal),size=len(pts),p=wts)
col=pal[cid][idx0]
jit=rng.uniform(0.9,1.08,len(pts))[idx0][...,None]
col*=jit
# stripes texture inside fields (ploughed rows)
ang=rng.uniform(0,np.pi,len(pts))[idx0]
stripe=np.sin((xx*np.cos(ang)+yy*np.sin(ang))*0.9)
col*=(1+0.035*stripe)[...,None]
# forest cells
forest=(rng.random(len(pts))<0.1)[idx0]
tn=pnoise(300,9)
fcol=np.stack([70+10*tn,102+14*tn,58+8*tn],-1)
col=np.where(forest[...,None],fcol,col)
# field borders: light paths + darker hedge
e=edge
col=np.where((e<2.2)[...,None], np.array([200,196,160],np.float32), col)
col=np.where(((e>=2.2)&(e<4.0))[...,None], col*0.8, col)
# roads: periodic sinuous
def road(y0, amp, freq, width, phase, vertical=True):
    global col
    if vertical:
        c=N*y0+amp*np.sin(2*np.pi*yy/N*freq+phase)+18*pnoise(8,int(phase*10))
        dd=np.abs(((xx-c+N/2)%N)-N/2)
    else:
        c=N*y0+amp*np.sin(2*np.pi*xx/N*freq+phase)
        dd=np.abs(((yy-c+N/2)%N)-N/2)
    m=dd<width
    col=np.where((m&land)[...,None], np.array([196,194,178],np.float32), col)
    col=np.where(((dd>=width)&(dd<width+1.2)&land)[...,None], col*0.85, col)
road(0.62,60,2,2.2,0.3); road(0.83,90,1,2.0,1.7); road(0.3,40,3,1.8,2.2,vertical=False); road(0.75,70,2,1.8,4.0,vertical=False)
# river
rv=N*0.9+80*np.sin(2*np.pi*yy/N*2+1)+30*pnoise(10,33)
dr=np.abs(((xx-rv+N/2)%N)-N/2)
col=np.where((dr<4)[...,None]&land[...,None], np.array([90,140,165],np.float32), col)
# --- towns
img=col
def town(cx,cy,r,dens,tall=False):
    global img
    bs=14 if tall else 12
    for gy_ in range(-int(r),int(r),bs):
        for gx_ in range(-int(r),int(r),bs):
            if gx_*gx_+gy_*gy_>r*r*(0.6+0.4*rng.random()): continue
            x=int(cx+gx_)%N; y=int(cy+gy_)%N
            if x>N-30 or y>N-30: continue
            if not land[y,x] or dl[y,x]<14: continue
            if rng.random()<0.15: continue
            w=bs-4; h=bs-4
            roof=[(200,200,205),(178,180,188),(222,218,210),(168,118,100),(146,150,160)][rng.integers(5)]
            hgt=int(rng.uniform(1,3)+(rng.uniform(3,12)*(1-np.hypot(gx_,gy_)/r) if tall else 0))
            cv2.rectangle(img,(x+2,y+2),(x+w+hgt,y+h+hgt),(70,76,72),-1)
            cv2.rectangle(img,(x,y),(x+w,y+h),roof,-1)
            cv2.line(img,(x,y),(x+w,y),tuple(min(255,v*1.15) for v in roof),1)
img=np.ascontiguousarray(img)
# find land positions near coast for towns
cand=np.argwhere(land&(dl>30)&(dl<220))
cities=[]
for k,(dens,r,tall) in enumerate([(900,110,True),(260,55,False),(220,50,False),(200,45,False),(180,40,False)]):
    for _ in range(200):
        y,x=cand[rng.integers(len(cand))]
        if all(min(abs(x-cx),N-abs(x-cx))+min(abs(y-cy),N-abs(y-cy))>500 for cx,cy in cities): break
    cities.append((x,y))
    # grey paved area
    cv2.circle(img,(int(x),int(y)),int(r*0.95),(160,160,152),-1,lineType=cv2.LINE_AA)
    town(x,y,r,dens,tall)
# --- sea
seac=np.array([48,92,138],np.float32); shallow=np.array([96,160,178],np.float32); deep=np.array([36,74,122],np.float32)
t=np.clip(ds/140,0,1)[...,None]
wv=pnoise(200,21)[...,None]
seacol=shallow*(1-t)+seac*t
seacol=seacol*(1-np.clip((ds-300)/500,0,1)[...,None])+deep*np.clip((ds-300)/500,0,1)[...,None]
seacol*=1+0.015*wv+0.02*pnoise(700,22)[...,None]
foam=np.clip(1-ds/5,0,1)[...,None]
seacol=seacol*(1-foam*0.8)+np.array([235,240,235])*foam*0.8
sand=np.array([226,206,158],np.float32)
beach=(dl<9)[...,None]
out=np.where(sea[...,None],seacol,np.where(beach,sand*(1+0.03*pnoise(300,8)[...,None]),img))
# cliff shading on land edge
edgeshade=np.clip((dl-9)/6,0,1)
# painterly variation + haze
out*= (1+0.06*pnoise(30,40)+0.03*pnoise(120,41))[...,None]
haze=np.array([170,200,222],np.float32)
out=out*0.86+haze*0.14
# burn scars
scars=[]
for _ in range(7):
    y,x=cand[rng.integers(len(cand))]
    scars.append((int(x),int(y)))
    rr=rng.uniform(10,20)
    m=np.exp(-(((xx-x+N/2)%N-N/2)**2+((yy-y+N/2)%N-N/2)**2)/(2*rr*rr))[...,None]
    out=out*(1-0.6*m)+np.array([50,40,35])*0.6*m
out=np.clip(out,0,255).astype(np.uint8)
out=cv2.GaussianBlur(out,(0,0),0.6)
Image.fromarray(out).save(os.path.join(OUT,'terrain.jpg'),quality=84)

# ------------------------------------------------------------------ clouds & smoke
def fbm(H,W,seed):
    r=np.random.default_rng(seed); out=np.zeros((H,W),np.float32)
    for o,a in [(8,1),(16,.5),(32,.25),(64,.12)]:
        n=r.random((o*H//W+2,o+2)).astype(np.float32)
        out+=a*cv2.resize(n,(W,H),interpolation=cv2.INTER_CUBIC)[:H,:W]
    return out/1.87
def cloud(W,H,nc,seed,name):
    r=np.random.default_rng(seed)
    yy,xx=np.mgrid[0:H,0:W].astype(np.float32)
    m=np.zeros((H,W),np.float32)
    for i in range(nc):
        t=r.uniform(-1,1); sp=1-abs(t)**1.5
        cx=W/2+t*W*0.34; rad=W*r.uniform(0.05,0.11)*(0.5+0.7*sp)
        cy=H*0.66-r.uniform(0,1)*sp*H*0.36
        m=np.maximum(m,np.clip(1-((xx-cx)**2+(yy-cy)**2)/rad**2,0,1))
    m=cv2.GaussianBlur(m,(0,0),W*0.02)
    n=fbm(H,W,seed+100)
    d=m*1.6+(n-0.5)*0.55
    al=np.clip((d-0.18)/0.35,0,1); al=al*al*(3-2*al)
    al*=np.clip((H*0.82-yy)/(H*0.2),0,1)
    # lighting: sample density below vs above
    dens=cv2.GaussianBlur(al,(0,0),W*0.03)
    shift=int(H*0.08)
    above=np.roll(dens,shift,0)
    lit=np.clip(1.0-(dens-above)*2.2,0,1)  # bottom parts darker
    lit=np.clip(lit*0.7+0.3*(1-yy/H)+0.15*(n-0.5),0,1)
    lo=np.array([188,203,224],np.float32); hi=np.array([252,253,255],np.float32)
    col=lo+(hi-lo)*lit[...,None]
    im=np.dstack([col,al*255]).clip(0,255).astype(np.uint8)
    save(premul_fix(Image.fromarray(im)),name)
cloud(512,320,40,1,'cloud1'); cloud(512,320,50,5,'cloud2'); cloud(512,320,34,9,'cloud3')
W,H=128,384
yy,xx=np.mgrid[0:H,0:W].astype(np.float32)
al=np.zeros((H,W),np.float32); col=np.zeros((H,W,3),np.float32)
r=np.random.default_rng(4)
for i in range(90):
    t=i/89; cy=H*(1-t)*0.92+14; cx=W*0.4+np.sin(t*4)*5+t*24+r.uniform(-3,3); rad=6+t*26*r.uniform(0.8,1.2)
    d2=((xx-cx)**2+(yy-cy)**2)/rad**2; mm=np.clip((1-d2)*1.5,0,1)*(0.95-0.55*t)
    g=38+70*t+r.uniform(-10,10)
    col=col*(1-mm[...,None])+np.array([g,g*0.97,g*0.96])*mm[...,None]; al=np.maximum(al,mm)
al=cv2.GaussianBlur(al,(0,0),2.5)
save(premul_fix(Image.fromarray(np.dstack([col,al*255]).clip(0,255).astype(np.uint8))),'smoke')

print('assets written to', OUT)
