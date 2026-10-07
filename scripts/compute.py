import pandas as pd, numpy as np, glob, re, json, datetime, collections, time, sys
T0=time.time()
def lap(m): print(f"[{time.time()-T0:.0f}s] {m}",flush=True)
# ---------- load ----------
h=pd.read_csv("hist_bills.csv",dtype=str,keep_default_na=False)
h["ds"]=pd.to_numeric(h.ds,errors="coerce").fillna(0); h["ck"]=pd.to_numeric(h.ck,errors="coerce").fillna(0)
h=h[h.ds>0].copy()
h["date"]=pd.to_datetime(h.date,errors="coerce"); h=h[h.date.notna()]
hist=pd.DataFrame({"PBH":h.PBH,"date":h.date,"makh":h.makh.str.strip(),"kho":h.ch,"gt":h.gioitinh,"age":h.dotuoi,"rev":h.ds,"ck":h.ck,"card":h.loaithe,"sn":"","ns":"","src":"hist"})
r=pd.concat([pd.read_csv(f,dtype=str,keep_default_na=False) for f in glob.glob("raw_*.csv")],ignore_index=True)
r["tt"]=pd.to_numeric(r.tt); r["ck"]=pd.to_numeric(r.ck); r=r[r.tt>0].copy(); r["date"]=pd.to_datetime(r.date)
raw=pd.DataFrame({"PBH":r.PBH,"date":r.date,"makh":r.makh.str.strip(),"kho":r.kho,"gt":r["gt"],"age":r["age"],"rev":r.tt,"ck":r.ck,"card":r.card,"sn":r.sn,"ns":r.ns,"src":"raw"})
# avoid overlap: raw months override hist months
raw_months=set(raw.date.dt.strftime("%Y-%m")); hist=hist[~hist.date.dt.strftime("%Y-%m").isin(raw_months)]
b=pd.concat([hist,raw],ignore_index=True)
b["month"]=b.date.dt.strftime("%Y-%m"); b["year"]=b.date.dt.year
lap("# ---------- identit")
# ---------- identity ----------
def is_phone(m): return bool(re.fullmatch(r"\d{9,12}",m))
b["is_cust"]=b.makh.map(is_phone)
b["group"]=np.where(b.is_cust,"Customer","Buyer")
lap("# ---------- store m")
# ---------- store map ----------
sm=pd.read_csv("store_map_2026.csv",dtype=str,keep_default_na=False).drop_duplicates("kho").set_index("kho")
sm0=pd.read_csv("store_map.csv",dtype=str,keep_default_na=False).drop_duplicates("macH").set_index("macH")
def mapstore(k):
    if k in sm.index: 
        v=sm.loc[k]; return v.am,v.model,v.khuvuc,v.tier
    if k in sm0.index:
        v=sm0.loc[k]; model={"Mall":"1. Boutique","Street":"3. Street","Online":"5. Online","Event":"4. Event"}.get(v.model,v.model)
        return v.am,model,v.khuvuc,v.tier
    if k.startswith("902"): return "-","5. Online","Online","Online"
    if k.startswith("901"): return "-","4. Event","Event","Event"
    return "-","#N/A","-","-"
mp={k:mapstore(k) for k in b.kho.unique()}
b["am"]=b.kho.map(lambda k:mp[k][0]); b["model"]=b.kho.map(lambda k:mp[k][1]); b["khuvuc"]=b.kho.map(lambda k:mp[k][2]); b["tier"]=b.kho.map(lambda k:mp[k][3])
b["model"]=b.model.replace({"#N/A":"6. Khác","":"6. Khác","-":"6. Khác","Counter w R":"2. Counter w R"})
lap("# ---------- card --")
# ---------- card ----------
def card(c):
    c=str(c).lower()
    if "diamond" in c: return "1. Diamond15"
    if "platinum" in c: return "2. Platinum10"
    if "gold" in c: return "3. Gold7"
    if "silver" in c: return "4. Silver5"
    if "member" in c: return "5. Member"
    return "6. Non-MB"
b["card"]=b.card.map(card)
lap("# ---------- age / g")
# ---------- age / gender ----------
def agegrp(a):
    if a<18: return "1. Dưới 17"
    if a<25: return "2. Từ 18 - 24"
    if a<35: return "3. Từ 25 - 34"
    if a<45: return "4. Từ 35 - 44"
    if a<55: return "5. Từ 45 - 54"
    if a<65: return "6. Từ 55 - 64"
    return "7. Từ 65"
ns=pd.to_datetime(b.ns.where(b.ns.str.match(r"^\d{4}-\d{2}-\d{2}$"),None),format="%Y-%m-%d",errors="coerce")
agecalc=((b.date-ns).dt.days/365.25)
calc=agecalc.map(lambda a: agegrp(a) if pd.notna(a) and 0<a<110 else "8. không xác định")
age=b.age.str.strip()
age=age.where(age.str.match(r"^[1-7]\."),calc)
AGE_CANON={"1":"1. Dưới 17","2":"2. Từ 18 - 24","3":"3. Từ 25 - 34","4":"4. Từ 35 - 44","5":"5. Từ 45 - 54","6":"6. Từ 55 - 64","7":"7. Từ 65","8":"8. không xác định"}
def canon_age(v):
    m=re.match(r"^\s*([1-8])\.",str(v)); return AGE_CANON[m.group(1)] if m else "8. không xác định"
b["age"]=age.map(canon_age)
import unicodedata
b["gt"]=b["gt"].map(lambda x: unicodedata.normalize("NFC",str(x)).strip()).replace({"":"Khác","#N/A":"Khác"})
b.loc[~b["gt"].isin(["Nam","Nữ"]),"gt"]="Khác"
lap("# ---------- recency")
# ---------- recency classification ----------
cust=b[b.is_cust].sort_values(["makh","date"]).copy()
kh=pd.read_csv("hist_kh.csv",dtype=str,keep_default_na=False)
kh["makh"]=kh.makh.str.strip()
kh["ngaydau"]=pd.to_datetime(kh.ngaydau,errors="coerce",dayfirst=True); kh["ngaycuoi"]=pd.to_datetime(kh.ngaycuoi,errors="coerce",dayfirst=True)
lap("cut=pd.Timestamp")
cut=pd.Timestamp("2022-01-01")
pre=kh[(kh.ngaydau<cut)][["makh","ngaydau","ngaycuoi"]]
# synthetic pre-2022 purchase events (first and last purchase before 2022)
ev=[pre[["makh","ngaydau"]].rename(columns={"ngaydau":"date"})]
last=pre[pre.ngaycuoi<cut][["makh","ngaycuoi"]].rename(columns={"ngaycuoi":"date"}); ev.append(last)
# also hist 'nam' numeric <2022 → ensure an event at 1 Jan of that year if customer not in KH sheet
hn=h[["makh","nam"]].copy(); hn["nam"]=pd.to_numeric(hn.nam,errors="coerce")
hn=hn[(hn.nam<2022)].drop_duplicates("makh"); hn=hn[~hn.makh.isin(pre.makh)]
hn["date"]=pd.to_datetime(hn.nam.astype(int).astype(str)+"-07-01"); ev.append(hn[["makh","date"]])
lap("synth=pd.concat")
synth=pd.concat(ev,ignore_index=True).dropna(); synth["rev"]=0.0
allev=pd.concat([cust[["makh","date"]].assign(real=True,idx=cust.index),synth.assign(real=False,idx=-1)],ignore_index=True).sort_values(["makh","date","real"])
allev["prev"]=allev.groupby("makh").date.shift(1)
lap("real=allev[allev.rea")
real=allev[allev.real].copy()
gap=(real.date-real.prev).dt.days
real["seg"]=np.select([real.prev.isna(),gap<=365],["1. KH mới","2. Quay lại ≤12T"],"3. KH cũ >12T")
cust["seg"]=real.set_index("idx").seg.reindex(cust.index)
lap("seg assign")
b["seg"]="4. Buyer (khách lẻ)"
b.loc[cust.index,"seg"]=cust.seg
b["seg_simple"]=np.select([b.seg=="1. KH mới",b.seg=="4. Buyer (khách lẻ)"],["KH mới","Buyer"],"KH cũ")
lap("classified")
# ---------- aggregations ----------
b["ph"]=b.makh.where(b.is_cust)
def agg(df,keys):
    g=df.groupby(keys).agg(bills=("PBH","count"),cust=("ph","nunique"),rev=("rev","sum")).reset_index()
    g["rev"]=g.rev.round(0); return g
out={}
out["meta"]={"generated":datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),"months":sorted(b.month.unique()),"raw_from":min(raw_months),"models":sorted(b.model.unique()),"cards":sorted(b.card.unique()),"segs":sorted(b.seg.unique())}
out["seg_month"]=agg(b,["month","kho","model","seg"]).to_dict("records")
out["seg_store"]=agg(b[b.year>=2025],["year","kho","model","seg"]).to_dict("records")
out["seg_demo_gt"]=agg(b[b.year>=2025],["year","seg","gt"]).to_dict("records")
out["seg_demo_age"]=agg(b[b.year>=2025],["year","seg","age"]).to_dict("records")
out["ttv_month"]=agg(b,["month","kho","model","card"]).to_dict("records")
out["ttv_store"]=agg(b[b.year>=2025],["year","kho","model","card"]).to_dict("records")
out["ttv_gt"]=agg(b[b.year>=2025],["year","card","gt"]).to_dict("records")
out["ttv_age"]=agg(b[b.year>=2025],["year","card","age"]).to_dict("records")
# membership x segment
out["ttv_seg"]=agg(b[b.year>=2025],["year","card","seg"]).to_dict("records")
lap("agg done")
# ---------- birthday (SN2023 sheet, CT CRM.2023.xlsx) ----------
d=pd.read_csv("sn2023.csv",dtype=str,keep_default_na=False); d.columns=[c.strip() for c in d.columns]
d["tt"]=pd.to_numeric(d["Thanh toán"],errors="coerce").fillna(0)
d["month"]=d.Month.str[:7]; d=d[d.month.str.match(r"^20\d\d-\d\d$")]
d["year"]=d.month.str[:4].astype(int); d["kho"]=d["Cửa hàng"].str.strip()
d["model"]=d.kho.map(lambda k: mapstore(k)[1] if k else "6. Khác").replace({"#N/A":"6. Khác","":"6. Khác","-":"6. Khác","Counter w R":"2. Counter w R"})
d["am"]=d.kho.map(lambda k: mapstore(k)[0] if k else "-")
d["gt"]=d["giới tính"].map(lambda x: unicodedata.normalize("NFC",str(x)).strip()); d.loc[~d["gt"].isin(["Nam","Nữ"]),"gt"]="Khác"
d["age"]=d["độ tuổi"].map(canon_age)
d["nguon"]=d["Nguồn"].str.strip().replace({"":"Khác"})
d["phone"]=d.SDT.str.strip().where(d.SDT.str.strip()!="",d["Mã KH"].str.strip())
def snagg(df,keys):
    g=df.groupby(keys).agg(sent=("phone","nunique"),redeemed=("tt",lambda s:(s>0).sum()),rev=("tt","sum")).reset_index()
    g["rev"]=g.rev.round(0); return g
out["sn_month"]=snagg(d,["month","kho","model"]).to_dict("records")
out["sn_am"]=snagg(d[d.year>=2024],["year","am"]).to_dict("records")
out["sn_store"]=snagg(d[d.year>=2024],["year","kho","model"]).to_dict("records")
out["sn_gt"]=snagg(d[d.year>=2024],["year","gt"]).to_dict("records")
out["sn_age"]=snagg(d[d.year>=2024],["year","age"]).to_dict("records")
out["sn_nguon"]=snagg(d[d.year>=2024],["year","nguon"]).to_dict("records")
out["sn_voucher"]=snagg(d[d.year>=2024],["year","Mệnh giá Voucher"]).rename(columns={"Mệnh giá Voucher":"voucher"}).to_dict("records")
print("SN nguon",d.nguon.value_counts().head(6).to_dict()); print("SN months",d.month.min(),d.month.max())
lap("sn done")
# store names
out["stores"]=[{"kho":k,"am":v[0],"model":v[1],"khuvuc":v[2],"tier":v[3]} for k,v in mp.items()]
# monthly totals
out["tot_month"]=agg(b,["month"]).to_dict("records")
json.dump(out,open("dash.json","w",encoding="utf-8"),ensure_ascii=False,default=str)
# ---------- checks ----------
print("bills",len(b)," months",out["meta"]["months"][0],"→",out["meta"]["months"][-1])
print(b.groupby("year").agg(bills=("PBH","count"),rev=("rev","sum")).assign(rev=lambda d:(d.rev/1e9).round(2)))
m26=b[b.year==2026]
print(m26.groupby("seg").agg(bills=("PBH","count"),cust=("makh","nunique"),rev=("rev","sum")).assign(rev=lambda d:(d.rev/1e9).round(2)))
print(m26.groupby("card").agg(bills=("PBH","count"),rev=("rev","sum")).assign(rev=lambda d:(d.rev/1e9).round(2)))
print("age unknown share",(b["age"]=="8. không xác định").mean().round(3), "gt khác", (b["gt"]=="Khác").mean().round(3))
import os; print("json MB",os.path.getsize("dash.json")/1e6)
