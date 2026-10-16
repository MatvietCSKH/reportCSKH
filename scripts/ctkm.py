"""Tổng hợp CTKM từ .work/ctkm/lines_<YYYY-MM>.csv -> khoá "ctkm" trong .work/dash.json
Mỗi dòng hàng được gán 1 CTKM theo thứ tự ưu tiên: MUĐ > Ontop tổng > Ontop > Combo > CSGG/Thẻ TV (có CK) > Nguyên giá.
Chỉ tính cơ chế khi cột MÃ có giá trị (ERP đôi khi điền tên CT mà không có mã -> bỏ qua)."""
import pandas as pd, glob, os, re, json, unicodedata, time
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__))); WORK=os.path.join(ROOT,".work")
t0=time.time()
from ctkm_rules import *   # GROUP, AWO, nfc, assign, regroup, ct_base, campaign, awo
frames=[]
for f in sorted(glob.glob(os.path.join(WORK,"ctkm","lines_????-??.csv"))):
    d=pd.read_csv(f,dtype=str,keep_default_na=False)
    for c in ("tt","ck","truocvat"):
        if c not in d: d[c]=d["tt"] if c=="truocvat" else 0
        d[c]=pd.to_numeric(d[c],errors="coerce").fillna(0)
    for c in ("mud","mud_n","mud_ct","ott","ott_n","ott_ct","ot","ot_n","ot_ct","combo","combo_n","combo_ct","csgg","csgg_n","card"):
        if c not in d: d[c]=""
    a=d.apply(assign,axis=1,result_type="expand"); d["grp"]=[regroup(g,n) for g,n in zip(a[0],a[1])]; d["prog"]=a[1]
    # NetSale = Số tiền trước VAT; chiết khấu quy về trước VAT theo tỷ lệ của từng dòng
    d["ck"]=d["ck"]*(d["truocvat"]/d["tt"]).where(d["tt"]!=0,1/1.08); d["tt"]=d["truocvat"]
    frames.append(d[["date","bill","kho","grp","prog","tt","ck"]])
d=pd.concat(frames,ignore_index=True); d=d[d.date.str.match(r"\d{4}-\d{2}-\d{2}")]
d["month"]=d.date.str[:7]; d["kho"]=d.kho.map(nfc)
P=d[["prog","grp"]].drop_duplicates().reset_index(drop=True)
P["camp"]=[campaign(n,g) for n,g in zip(P.prog,P.grp)]; P["awo"]=[awo(n,g) for n,g in zip(P.prog,P.grp)]
_disp={}
P["ct"]=[_disp.setdefault((g,ct_base(n).lower()),ct_base(n)) for n,g in zip(P.prog,P.grp)]
pidx={(p,g):i for i,(p,g) in enumerate(zip(P.prog,P.grp))}
d["pi"]=[pidx[(p,g)] for p,g in zip(d.prog,d.grp)]
d["is_awo"]=d.pi.map(dict(enumerate(P.awo!="")))
d["is_promo"]=d.grp!="Full Price"
KHO=sorted(d.kho.unique()); kidx={k:i for i,k in enumerate(KHO)}; d["ki"]=d.kho.map(kidx)
k=lambda v: int(round(v/1000))
# theo ngày x cửa hàng
g=d.groupby(["date","ki"])
day=pd.DataFrame({"ns":g.tt.sum(),"ck":g.ck.sum(),"b":g.bill.nunique(),
   "bp":d[d.is_promo].groupby(["date","ki"]).bill.nunique(),"ba":d[d.is_awo].groupby(["date","ki"]).bill.nunique(),
   "nsp":d[d.is_promo].groupby(["date","ki"]).tt.sum()}).fillna(0).reset_index()
day_rows=[[r.date,int(r.ki),k(r.ns),k(r.ck),int(r.b),int(r.bp),int(r.ba),k(r.nsp)] for r in day.itertuples()]
# theo tháng x cửa hàng x CTKM
g=d.groupby(["month","ki","pi"]); pr=pd.DataFrame({"ns":g.tt.sum(),"ck":g.ck.sum(),"b":g.bill.nunique()}).reset_index()
prog_rows=[[r.month,int(r.ki),int(r.pi),k(r.ns),k(r.ck),int(r.b)] for r in pr.itertuples()]
out={"kho":KHO,"progs":[[p,g,c,a,t] for p,g,c,a,t in zip(P.prog,P.grp,P.camp,P.awo,P.ct)],"day":day_rows,"prog":prog_rows,
     "months":sorted(d.month.unique()),"awo_kpi":14,
     "rule":"Gán 1 CTKM/dòng hàng: MUĐ > Ontop tổng > Ontop > Combo > CSGG/Thẻ TV > Nguyên giá. NetSale = Số tiền trước VAT (sau CK); Discount = CK+CKHD quy về trước VAT; %CK = CK/(DS+CK)."}
dp=os.path.join(WORK,"dash.json"); D=json.load(open(dp,encoding="utf-8")); D["ctkm"]=out
json.dump(D,open(dp,"w",encoding="utf-8"),ensure_ascii=False,separators=(",",":"))
print(f"ctkm: {len(d)} dòng, {len(P)} CTKM, day={len(day_rows)} prog={len(prog_rows)} [{time.time()-t0:.0f}s]")
print(P.groupby("grp").size().to_dict())
print(P[P.awo!=""].groupby("awo").size().to_dict())
m=d[d.month=="2026-03"]; print("T3: ns",round(m.tt.sum()/1e6),"ck",round(m.ck.sum()/1e6))
print((m.groupby("grp").tt.sum()/1e6).round(0).sort_values(ascending=False).to_dict())

# Tab Hàng hóa dùng cùng dữ liệu dòng hàng -> chạy kèm để tác vụ định kỳ (vòng lặp contact/ctkm/xnbh/feedback) không cần sửa.
if not os.environ.get("SKIP_HH"):
    import runpy; runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)),"hanghoa.py"),run_name="__main__")
