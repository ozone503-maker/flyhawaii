import json,re,sys,numpy as np,wave
spec=json.load(open('spec.json')); SR=48000; DUR=4.0
def syl(w): return max(1,len(re.findall(r'[aeiouy]+',w.lower())))
def env(n,a,r):
    e=np.ones(n);ai=int(a*SR);ri=int(r*SR)
    e[:ai]=np.linspace(0,1,ai); e[-ri:]=np.linspace(1,0,ri)[:len(e[-ri:])]; return e
out={}
for s in spec:
    words=s['cap'].split(); sy=[syl(w)+ (0.6 if re.search(r'[,.!?]$',w) else 0) for w in words]
    a0,a1=0.45,2.75; tot=sum(sy); t=a0; W=[]
    for w,k in zip(words,sy):
        d=(a1-a0)*k/tot; W.append((round(t,3),round(t+d*0.86,3))); t+=d
    ki=[i for i,w in enumerate(words) if re.search('kudoken',w,re.I)][0]
    burst=round(W[ki][0]+0.12,3)
    out[s['id']]={'words':W,'burst':burst}
    # audio
    rng=np.random.default_rng(len(s['id'])*31)
    L=np.zeros(int(SR*DUR))
    def add(x,at,g=1.0):
        i=int(at*SR); L[i:i+len(x)]+=g*x[:len(L)-i]
    n=int(0.45*SR); tt=np.arange(n)/SR; f=200+1400*(tt/0.45)**2
    wn=rng.standard_normal(n); ph=np.cumsum(2*np.pi*f/SR); add(np.convolve(wn,np.ones(24)/24,'same')*np.sin(ph)*0.5*env(n,0.05,0.3),0.02,0.35)
    for (a,b),w in zip(W,words):
        k=syl(w); step=(b-a)/k
        for j in range(k):
            d=min(0.11,step*0.8); n=int(d*SR); tt=np.arange(n)/SR
            f0=s['pitch']*rng.uniform(0.85,1.3)*(1.12 if w.endswith(('!','?')) and j==k-1 else 1)
            x=np.sign(np.sin(2*np.pi*f0*tt))*0.5+np.sin(2*np.pi*f0*2*tt)*0.3+np.sin(2*np.pi*f0*3.01*tt)*0.15
            x=np.convolve(x,np.ones(6)/6,'same')*env(n,0.008,0.04)
            add(x,a+j*step,0.22)
    notes=[1318.5,1568,1975.5,2637,3136]
    for i,fq in enumerate(notes):
        n=int(0.35*SR); tt=np.arange(n)/SR; x=(np.sin(2*np.pi*fq*tt)+0.4*np.sin(2*np.pi*fq*2*tt))*np.exp(-tt*9)
        add(x,burst+i*0.07,0.22)
    for i in range(14):
        fq=rng.uniform(2200,4200); n=int(0.12*SR); tt=np.arange(n)/SR
        add(np.sin(2*np.pi*fq*tt)*np.exp(-tt*35),burst+0.75+i*0.055+rng.uniform(0,0.02),0.12)
    L=L/max(1e-6,np.abs(L).max())*0.8
    st=np.stack([L,L],1); st[:,1]=np.roll(L,int(0.004*SR))
    with wave.open(f"vo/{s['id']}.wav",'wb') as w: w.setnchannels(2);w.setsampwidth(2);w.setframerate(SR);w.writeframes((st*32767).astype('<i2').tobytes())
json.dump(out,open('timing.json','w'),indent=1); print('ok',len(out))
