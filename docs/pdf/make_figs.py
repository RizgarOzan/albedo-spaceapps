import json, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
D="../../data/"
L=lambda f: json.load(open(D+f))
BG="#0b1020"; FG="#e8ecf5"; GR="#2a3350"
plt.rcParams.update({"figure.facecolor":BG,"axes.facecolor":BG,"savefig.facecolor":BG,"text.color":FG,"axes.labelcolor":FG,
 "xtick.color":FG,"ytick.color":FG,"axes.edgecolor":GR,"font.size":15,"axes.grid":True,"grid.color":GR,"grid.linewidth":.6})
names={"shackleton":"Shackleton rim","nobile":"Nobile rim","malapert":"Malapert summit"}
SUN="#ffc857"; EARTH="#5fb4ff"; NASA="#9aa5c4"

# Fig1: ours vs NASA
v=L("validation.json")["comparisons"]
fig,axs=plt.subplots(1,2,figsize=(11,5.6),sharey=True)
for ax,q,t,c in ((axs[0],"illumination_fraction","Sun visible (fraction of time)",SUN),(axs[1],"earth_visible_fraction","Earth visible (fraction of time)",EARTH)):
    rows=[r for r in v if r["quantity"]==q]; x=np.arange(3); w=.36
    ax.bar(x-w/2,[r["modelled"]*100 for r in rows],w,color=c,label="Ours (2027, 2 m, 30 km)")
    ax.bar(x+w/2,[r["published_at_poi"]*100 for r in rows],w,color=NASA,label="NASA/LOLA average map")
    for i,r in enumerate(rows):
        ax.text(i-w/2,r["modelled"]*100+1.5,f'{r["modelled"]*100:.0f}',ha="center",fontsize=13)
        ax.text(i+w/2,r["published_at_poi"]*100+1.5,f'{r["published_at_poi"]*100:.0f}',ha="center",fontsize=13,color=NASA)
        ax.text(i,4,f'{r["abs_err"]*100:+.1f}',ha="center",fontsize=13,color=BG,fontweight="bold")
    ax.set_xticks(x,["Shackleton","Nobile","Malapert"]); ax.set_title(t,fontsize=15); ax.set_ylim(0,120); ax.set_yticks(range(0,101,20)); ax.legend(loc="upper center",ncol=1,fontsize=11,facecolor=BG,edgecolor=GR)
axs[0].set_ylabel("%"); 
plt.tight_layout(); plt.savefig("fig_validation.png",dpi=130); plt.close()

# Fig2: horizon + sun/earth tracks
fig,axs=plt.subplots(1,3,figsize=(14,3.9),sharey=True)
for ax,k in zip(axs,names):
    h=L(f"horizon/{k}.json")["horizon_deg"]; e=L(f"ephemeris/{k}.json")
    sa,se,ea,ee=map(np.array,(e["sun_az"],e["sun_el"],e["earth_az"],e["earth_el"]))
    m=(ee>-3)&(ee<8)
    ax.scatter(ea[m],ee[m],s=1.5,color=EARTH,alpha=.35,label="Earth, hourly 2027")
    m=(se>-3)&(se<8)
    ax.scatter(sa[m],se[m],s=1.5,color=SUN,alpha=.35,label="Sun, hourly 2027")
    az=np.arange(len(h)); ax.fill_between(az,-6,h,color="#3b4468"); ax.plot(az,h,color="#ffffff",lw=1.6,label="Horizon (30 km ray march)")
    ax.set_title(names[k],fontsize=15); ax.set_xlim(0,360); ax.set_ylim(-6,10); ax.set_xticks(range(0,361,90)); ax.set_xlabel("azimuth (deg)")
axs[0].set_ylabel("elevation (deg)")
hh,ll=axs[0].get_legend_handles_labels()
axs[0].legend(hh,ll,loc="upper left",fontsize=10,facecolor=BG,edgecolor=GR,markerscale=6)
plt.tight_layout(); plt.savefig("fig_horizon.png",dpi=130); plt.close()

# Fig3: 19-year Sun fraction spread
m=L("multiyear.json")["sites"]
fig,axs=plt.subplots(1,2,figsize=(11,3.6))
cols={"shackleton":"#ffc857","nobile":"#ff8a5c","malapert":"#c792ea"}
for k in names:
    ys=sorted(m[k]["years"]); 
    axs[0].plot([int(y) for y in ys],[m[k]["years"][y]["sun_frac"]*100 for y in ys],"-o",ms=4,color=cols[k],label=names[k])
    axs[1].plot([int(y) for y in ys],[m[k]["years"][y]["earth_frac"]*100 for y in ys],"-o",ms=4,color=cols[k],label=names[k])
axs[0].set_title("Sun visible (%), 2026-2044",fontsize=14); axs[1].set_title("Earth visible (%), 2026-2044",fontsize=14)
axs[0].set_ylim(55,95); axs[1].set_ylim(35,90); axs[0].legend(fontsize=10,facecolor=BG,edgecolor=GR,loc="center right")
plt.tight_layout(); plt.savefig("fig_multiyear.png",dpi=130); plt.close()
