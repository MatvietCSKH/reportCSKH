"""Tab Hàng hóa — phân tích nhóm hàng & giỏ hàng từ .work/ctkm/lines_<YYYY-MM>.csv -> khoá "hh" trong .work/dash.json
Quy ước:
  - Nhóm hàng theo cột "Nhóm hàng" BC21: LENS / OPT (gọng) / SUN (kính mát) / CONTACLENS / OTHERS.
  - Bỏ dòng OTHERS có giá trị 0đ (dịch vụ, phụ kiện tặng kèm) và bill chỉ gồm các dòng đó.
  - SL LENS trên BC21 là số MIẾNG -> chia 2 = số CẶP tròng.
  - Loại giỏ hàng theo cột "Commodity" của ERP (COMPLETE OPTICAL PAIR / LENS ONLY / FRAME ONLY / SUN ONLY / COMPLETE PAIR SUN /
    CONTACT LENSES ONLY / OTHERS); thiếu thì suy từ tập nhóm hàng của bill.
  - CTKM của dòng hàng gán theo ctkm_rules (như tab CTKM) rồi quy về CTKM CHÍNH của bill = chiến dịch có doanh số lớn nhất
    trong bill (không tính Nguyên giá), bill không có CTKM nào = Nguyên giá. Mọi số liệu (nhóm hàng, giỏ hàng) đều theo CTKM chính của bill.
  - NetSale = Số tiền trước VAT; CK quy về trước VAT (giống tab CTKM).
"""
import pandas as pd, numpy as np, glob, os, json, time, collections
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__))); WORK=os.path.join(ROOT,".work")
from ctkm_rules import *
t0=time.time()
NHOM=["LENS","OPT","SUN","CONTACLENS","OTHERS"]
COM=["COMPLETE OPTICAL PAIR","LENS ONLY","FRAME ONLY","SUN ONLY","COMPLETE PAIR SUN","CONTACT LENSES ONLY","OTHERS"]
CARDS=["1. Diamond15","2. Platinum10","3. Gold7","4. Silver5","5. Member","6. Non-MB"]
def card(c):
    c=str(c).lower()
    for k,v in (("diamond",0),("platinum",1),("gold",2),("silver",3),("member",4)):
        if k in c: return v
    return 5
frames=[]
for f in sorted(glob.glob(os.path.join(WORK,"ctkm","lines_????-??.csv"))):
    d=pd.read_csv(f,dtype=str,keep_default_na=False)
    for c in ("sl","tt","ck","truocvat"):
        if c not in d: d[c]=d["tt"] if c=="truocvat" else 0
        d[c]=pd.to_numeric(d[c],errors="coerce").fillna(0)
    for c in ("mud","mud_n","mud_ct","ott","ott_n","ott_ct","ot","ot_n","ot_ct","combo","combo_n","combo_ct","csgg","csgg_n","card","com","nhom","loai"):
        if c not in d: d[c]=""
    a=d.apply(assign,axis=1,result_type="expand"); d["grp"]=[regroup(g,n) for g,n in zip(a[0],a[1])]; d["prog"]=a[1]
    d["ck"]=d["ck"]*(d["truocvat"]/d["tt"]).where(d["tt"]!=0,1/1.08); d["ns"]=d["truocvat"]
    frames.append(d[["date","bill","kho","nhom","sl","ns","ck","card","com","grp","prog","loai"]])
d=pd.concat(frames,ignore_index=True); d=d[d.date.str.match(r"\d{4}-\d{2}-\d{2}")].copy()
d["month"]=d.date.str[:7]; d["kho"]=d.kho.map(nfc)
nh=d.nhom.str.upper().str.strip(); d["nhom"]=nh.where(nh.isin(NHOM),"OTHERS")
d["camp"]=[campaign(n,g) for n,g in zip(d.prog,d.grp)]
n0=len(d); b0=d.bill.nunique()
d=d[~((d.nhom=="OTHERS")&(d.ns<=0))].copy()                       # bỏ OTHERS 0đ
print(f"hh: {n0} dòng / {b0} bill -> bỏ OTHERS 0đ còn {len(d)} dòng / {d.bill.nunique()} bill")
d["qty"]=np.where(d.nhom=="LENS",d.sl/2.0,d.sl)                      # tròng: miếng -> cặp
# ----- thuộc tính bill: hạng thẻ, loại giỏ hàng, CTKM chính -----
bc=d.groupby("bill").card.agg(lambda s: next((x for x in s if x),""))
def derive(ns):
    s=set(ns)-{"OTHERS"}
    if {"LENS","OPT"}<=s: return "COMPLETE OPTICAL PAIR"
    if {"LENS","SUN"}<=s: return "COMPLETE PAIR SUN"
    if s=={"LENS"}: return "LENS ONLY"
    if s=={"OPT"} or s=={"OPT","SUN"}: return "FRAME ONLY"
    if s=={"SUN"}: return "SUN ONLY"
    if "CONTACLENS" in s and not s-{"CONTACLENS"}: return "CONTACT LENSES ONLY"
    if "LENS" in s: return "LENS ONLY"
    if "OPT" in s: return "FRAME ONLY"
    if "SUN" in s: return "SUN ONLY"
    if "CONTACLENS" in s: return "CONTACT LENSES ONLY"
    return "OTHERS"
g=d.groupby("bill")
com_erp=g.com.agg(lambda s: collections.Counter(x.strip().upper() for x in s if x.strip()).most_common(1)[0][0] if any(x.strip() for x in s) else "")
com_der=g.nhom.agg(derive)
has=com_erp.isin(COM)
com=com_erp.where(has,com_der)
agree=(com_erp[has]==com_der[has]).mean() if has.any() else float("nan")
print(f"hh: Commodity ERP có ở {has.mean():.1%} bill; khớp suy luận từ nhóm hàng {agree:.1%}")
pc=d[d.camp!="Nguyên giá"].groupby(["bill","camp"]).ns.sum().reset_index().sort_values(["bill","ns"],ascending=[True,False]).drop_duplicates("bill").set_index("bill").camp
B=pd.DataFrame({"card":bc,"com":com}); B["camp"]=pc.reindex(B.index).fillna("Nguyên giá")
B["ci"]=B.card.map(card); B["coi"]=B.com.map({c:i for i,c in enumerate(COM)})
d["ci"]=d.bill.map(B.ci); d["bcamp"]=d.bill.map(B.camp); d["coi"]=d.bill.map(B.coi)
# ----- danh mục chiến dịch: gom CT nhỏ thành "CTKM khác" để file gọn -----
cs=d.groupby("camp").ns.sum().sort_values(ascending=False)
TOP=45
keep=list(cs.index[:TOP])
for must in ("Nguyên giá","Thẻ thành viên","Sinh nhật KH"):
    if must in cs.index and must not in keep: keep.append(must)
CAMPS=["Nguyên giá"]+[c for c in keep if c!="Nguyên giá"]
if len(cs)>len(CAMPS): CAMPS.append("CTKM khác")
cidx={c:i for i,c in enumerate(CAMPS)}; other=cidx.get("CTKM khác")
d["pi"]=d.camp.map(lambda c: cidx.get(c,other)); d["bpi"]=d.bcamp.map(lambda c: cidx.get(c,other))
MONTHS=sorted(d.month.unique()); midx={m:i for i,m in enumerate(MONTHS)}
KHO=sorted(d.kho.unique()); kidx={k:i for i,k in enumerate(KHO)}
nidx={n:i for i,n in enumerate(NHOM)}
d["mi"]=d.month.map(midx); d["ki"]=d.kho.map(kidx); d["ni"]=d.nhom.map(nidx)
k=lambda v: int(round(v/1000))
# ----- dòng hàng: tháng × CH × thẻ × CTKM(dòng) × nhóm hàng -----
g=d.groupby(["mi","ki","ci","bpi","ni"]); L=pd.DataFrame({"q":g.qty.sum(),"ns":g.ns.sum(),"ck":g.ck.sum(),"b":g.bill.nunique()}).reset_index()
lines=[[int(r.mi),int(r.ki),int(r.ci),int(r.bpi),int(r.ni),round(float(r.q),1),k(r.ns),k(r.ck),int(r.b)] for r in L.itertuples()]
# ----- bill: tháng × CH × thẻ × CTKM(bill) × loại giỏ hàng -----
bl=d.groupby("bill").agg(mi=("mi","first"),ki=("ki","first"),ci=("ci","first"),bpi=("bpi","first"),coi=("coi","first"),ns=("ns","sum"),ck=("ck","sum")).reset_index()
qn=d.pivot_table(index="bill",columns="nhom",values="qty",aggfunc="sum",fill_value=0.0)
for c in ("LENS","OPT","SUN"):
    if c not in qn: qn[c]=0.0
bl=bl.join(qn[["LENS","OPT","SUN"]],on="bill")
g=bl.groupby(["mi","ki","ci","bpi","coi"]); Bg=pd.DataFrame({"b":g.bill.count(),"ns":g.ns.sum(),"ck":g.ck.sum(),"l":g.LENS.sum(),"o":g.OPT.sum(),"s":g.SUN.sum()}).reset_index()
bills=[[int(r.mi),int(r.ki),int(r.ci),int(r.bpi),int(r.coi),int(r.b),k(r.ns),k(r.ck),round(float(r.l),1),int(round(r.o)),int(round(r.s))] for r in Bg.itertuples()]
# ----- loại hàng (cột Loại hàng BC21): top 12 mỗi nhóm theo doanh số -----
d["loai"]=d.loai.map(nfc).replace("","(không ghi)")
tl=d.groupby(["nhom","loai"]).agg(ns=("ns","sum"),q=("qty","sum"),b=("bill","nunique")).reset_index().sort_values("ns",ascending=False)
LOAI=[]
for n in NHOM:
    for r in tl[tl.nhom==n].head(12).itertuples(): LOAI.append(r.loai)
lidx={l:i for i,l in enumerate(LOAI)}; d["li"]=d.loai.map(lambda l: lidx.get(l,-1))
g=d[d.li>=0].groupby(["mi","ki","ci","ni","li"]); T=pd.DataFrame({"q":g.qty.sum(),"ns":g.ns.sum(),"b":g.bill.nunique()}).reset_index()   # không có chiều CTKM cho gọn file
loai_rows=[[int(r.mi),int(r.ki),int(r.ci),int(r.ni),int(r.li),round(float(r.q),1),k(r.ns),int(r.b)] for r in T.itertuples()]
out={"months":MONTHS,"kho":KHO,"cards":CARDS,"camps":CAMPS,"nhom":NHOM,"com":COM,"loai":LOAI,"lines":lines,"bills":bills,"loai_rows":loai_rows,
     "dropped_zero_bills":int(b0-d.bill.nunique()),"com_erp_share":round(float(has.mean()),4),"com_agree":round(float(agree),4) if agree==agree else None,
     "rule":"Nhóm hàng theo cột Nhóm hàng BC21; bỏ dòng OTHERS 0đ; SL tròng = số miếng / 2 (cặp); loại giỏ hàng theo cột Commodity (ERP), thiếu thì suy từ nhóm hàng; CTKM = CTKM chính của bill (chiến dịch có doanh số lớn nhất trong bill, không có CTKM = Nguyên giá) áp cho cả nhóm hàng lẫn giỏ hàng; NetSale trước VAT."}
dp=os.path.join(WORK,"dash.json"); D=json.load(open(dp,encoding="utf-8")); D["hh"]=out
json.dump(D,open(dp,"w",encoding="utf-8"),ensure_ascii=False,separators=(",",":"))
sz=len(json.dumps(out,ensure_ascii=False,separators=(",",":")))/1e6
print(f"hh: lines={len(lines)} bills={len(bills)} loai_rows={len(loai_rows)} camps={len(CAMPS)} kho={len(KHO)} json~{sz:.2f}MB [{time.time()-t0:.0f}s]")
print("Loại giỏ hàng:", B.com.value_counts().to_dict())
m=d[d.month==MONTHS[-2]] if len(MONTHS)>1 else d
print(f"Tháng {m.month.iloc[0]}:", m.groupby("nhom").agg(q=("qty","sum"),ns=("ns","sum"),b=("bill","nunique")).assign(ns=lambda x:(x.ns/1e6).round(0)).to_dict("index"))
