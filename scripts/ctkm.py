"""Tổng hợp CTKM từ .work/ctkm/lines_<YYYY-MM>.csv -> khoá "ctkm" trong .work/dash.json
Mỗi dòng hàng được gán 1 CTKM theo thứ tự ưu tiên: MUĐ > Ontop tổng > Ontop > Combo > CSGG/Thẻ TV (có CK) > Nguyên giá.
Chỉ tính cơ chế khi cột MÃ có giá trị (ERP đôi khi điền tên CT mà không có mã -> bỏ qua)."""
import pandas as pd, glob, os, re, json, unicodedata, time
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__))); WORK=os.path.join(ROOT,".work")
t0=time.time()
GROUP={"BD":"CS.SN","LKMall":"MKT.KMMall","ECOM":"MKT.ECOM","EMPLOYEE":"HR.NV","(MKT.AWO)":"MKT.AWO","CSKH":"CS.MB","MCD":"MCD.DMGG","PO":"MKT.KM"}
AWO=[("Checkin MV (Follow MV)",r"follow mv"),("Xác nhận bảo hành nhận (CSKH sau mua)",r"cskh sau mua"),("Đăng ký đo khám mắt",r"đo khám mắt"),("HSSV",r"hssv"),
     ("Thu kính cũ",r"kính cũ"),("CP2",r"cp thứ 2|complete pair thứ 2|\bcp2\b"),("Bảo hành sản phẩm",r"bảo hành"),
     ("Welcome KH mới",r"welcome"),("Đăng ký ZMA",r"\bzma\b")]
nfc=lambda s: unicodedata.normalize("NFC",re.sub(r"\s+"," ",str(s or "")).strip())
def card_name(c):
    c=re.sub(r"^\d\.\s*","",c); m=re.match(r"([A-Za-z]+)(\d+)?",c)
    return "Thẻ thành viên "+(m.group(1).capitalize()+(" "+m.group(2)+"%" if m.group(2) else "") if m else c)
def assign(r):
    for code,name,grp in (("mud","mud_n","mud_ct"),("ott","ott_n","ott_ct"),("ot","ot_n","ot_ct"),("combo","combo_n","combo_ct")):
        if r[code] and r[name]: return GROUP.get(r[grp],r[grp] or "Khác"), nfc(r[name])
    if r["ck"]!=0:
        if r["csgg"]:
            n=nfc(r["csgg_n"] or r["csgg"])
            return ("CS.MB" if n.lower().startswith("thẻ thành viên") else "MCD.DMGG"), n
        if r["card"]: return "CS.MB", card_name(r["card"])
        return "Khác", "CK khác (không mã CTKM)"
    return "Full Price", "Nguyên giá (không CTKM)"
def regroup(grp,name):
    if re.search(r"kính cũ",name,re.I) and grp=="MKT.KM": return "MKT.TKC"
    if grp=="BOD": return "BOD.H" if re.search(r"\bC\.? ?Hà\b",name) else "BOD.T"
    return grp
GENERIC_HEAD=r"(giảm|voucher|vc|tặng|awo|approval|aproval|ecom|bảo hành|cashvoucher|b2b|saleevent)\b"
def ct_base(name):
    """Tên CT gốc — gom các mức giảm của cùng 1 CTKM (VD 'Follow MV - Giảm 100K…' và '… 300K…' -> 'Follow MV')."""
    n=re.sub(r"^P\d+\s+","",name.strip())
    m=re.match(r"(HSSV\d*)\b",n,re.I)
    if m: return m.group(1).upper()
    parts=re.split(r"\s+[-–]\s+|\s*:\s+",n,maxsplit=1)
    head=parts[0].strip()
    if len(parts)>1 and len(head)>=3 and not re.match(GENERIC_HEAD,head,re.I): return head
    return n
def campaign(name,grp):
    if grp=="Full Price": return "Nguyên giá"
    if grp=="CS.MB": return "Thẻ thành viên"
    if grp=="CS.SN" or re.search(r"snkh|sinh nhật kh",name,re.I): return "Sinh nhật KH"
    for fam,pat in AWO:
        if re.search(pat,name,re.I): return "AWO · "+fam
    if grp=="MCD.DMGG": return "Chính sách giá (MCD)"
    if grp=="HR.NV": return "Mua hàng nội bộ"
    if grp in("BOD.H","BOD.T","AM"): return "Duyệt giá ("+grp+")"
    parts=re.split(r"\s+[-–:]\s+",name)
    c=parts[0] if parts and not re.match(r"(giảm|voucher|vc|tặng)\b",parts[0],re.I) else name
    c=re.sub(r"^P\d+\s+","",c)               # "P4 Customer Week" -> "Customer Week"
    return c[:60]
def awo(name,grp):
    if grp=="CS.BH": return "Bảo hành sản phẩm"
    for fam,pat in AWO:
        if re.search(pat,name,re.I): return fam
    return ""
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
