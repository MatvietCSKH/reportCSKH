import pandas as pd, glob, json, re
st=pd.concat([pd.read_csv(f,dtype=str,keep_default_na=False) for f in glob.glob("store/store_*.csv")],ignore_index=True)
st["noted"]=st.noted=="True"
st["phone"]=st.phone.str.lstrip("0").str.zfill(0)
st=st[(st.month>="2024-06")&(st.month<="2026-10")]
# normalize phone: keep digits, strip leading zeros for join
def np_(s): return s.str.replace(r"\D","",regex=True).str.lstrip("0")
st["key"]=np_(st.phone)
st=st.sort_values("noted",ascending=False).drop_duplicates(["store","month","key"])
def meth(m):
    m=m.lower()
    if "zalo" in m or "zns" in m: return "Zalo"
    if "sms" in m or "tin nhắn" in m: return "SMS"
    if "mess" in m or "fb" in m: return "Messenger"
    if re.search(r"\b(call|gọi|goi|điện thoại|phone|nghe máy|không nghe|thuê bao|ko nghe|bận)\b",m): return "Gọi điện"
    return "Khác/không ghi" 
st["meth"]=(st.method+" "+st.note+" "+st.staff).map(meth)
st.loc[~st.noted,"meth"]="Không liên hệ"
d=pd.read_csv("sn2023.csv",dtype=str,keep_default_na=False); d.columns=[c.strip() for c in d.columns]
import sn_redeem; d=sn_redeem.attach_auto_tt(d,verbose=False); d["month"]=d.Month.str[:7]
d["key"]=np_(d.SDT.where(d.SDT.str.strip()!="",d["Mã KH"]))
d["store_sn"]=d["Cửa hàng"].str.extract(r"^(\d{3})")[0]
d=d.groupby(["month","key"]).agg(tt=("tt","sum"),red=("tt",lambda s:(s>0).sum()),store_sn=("store_sn","first")).reset_index()
d["red"]=(d.red>0).astype(int)
m=st.merge(d,on=["month","key"],how="left")
m["matched"]=m.tt.notna(); m["tt"]=m.tt.fillna(0); m["red"]=m.red.fillna(0).astype(int)
print("rows",len(m),"matched to SN list",m.matched.mean().round(3))
print(m.groupby("noted").agg(n=("key","count"),red=("red","sum"),rev=("tt","sum")).assign(cr=lambda x:(100*x.red/x.n).round(2)))
g=m.groupby(["store","month"]).agg(listed=("key","count"),noted=("noted","sum"),red_n=("red",lambda s:int(s[m.loc[s.index,"noted"]].sum())),red_u=("red",lambda s:int(s[~m.loc[s.index,"noted"]].sum())),rev_n=("tt",lambda s:float(s[m.loc[s.index,"noted"]].sum())),rev_u=("tt",lambda s:float(s[~m.loc[s.index,"noted"]].sum()))).reset_index()
g["noted"]=g.noted.astype(int)
gm=m.groupby(["month","store","meth"]).agg(n=("key","count"),red=("red","sum"),rev=("tt","sum")).reset_index()
# Gom tên NV trùng: chỉ gộp khi là họ tên đầy đủ (>= 2 chữ) và trùng khớp từng chữ, chỉ khác hoa/thường hoặc khoảng trắng, trong cùng CH.
# Tên 1 chữ (vd "Mỹ", "TRÚC") giữ nguyên. Tên hiển thị: cách viết thường/hoa chuẩn dùng nhiều nhất, không có thì cách viết dùng nhiều nhất.
import unicodedata
def unify_staff(df):
    nm=df.staff.map(lambda x: re.sub(r"\s+"," ",unicodedata.normalize("NFC",x)).strip())
    k=nm.str.lower(); full=nm.str.count(" ")>=1
    cnt=pd.DataFrame({"store":df.store,"k":k,"nm":nm})[full].groupby(["store","k","nm"]).size().reset_index(name="c")
    cnt["mixed"]=cnt.nm.map(lambda x: x!=x.upper() and x!=x.lower())
    best=cnt.sort_values(["mixed","c"],ascending=False).drop_duplicates(["store","k"]).set_index(["store","k"]).nm
    disp=[best.get((st,kk),n) if f else n for st,kk,n,f in zip(df.store,k,nm,full)]
    return df.assign(staff=disp)
m=unify_staff(m)
gs=m.groupby(["month","store","staff"]).agg(n=("key","count"),red=("red","sum"),rev=("tt","sum")).reset_index()
gs=gs[gs.staff!=""].sort_values("n",ascending=False)
out={"contact_month":g.round(0).to_dict("records"),"contact_method":gm.round(0).to_dict("records"),"contact_staff":gs.round(0).to_dict("records"),
     "contact_meta":{"stores":sorted(st.store.unique().tolist()),"missing_stores":["220","226","311","403"],"months":sorted(st.month.unique().tolist())}}
json.dump(out,open("contact.json","w",encoding="utf-8"),ensure_ascii=False)
dash=json.load(open("dash.json",encoding="utf-8")); dash.update(out); json.dump(dash,open("dash.json","w",encoding="utf-8"),ensure_ascii=False)
print(g[g.month>="2026-01"].groupby("store")[["listed","noted","red_n","red_u"]].sum().assign(pct=lambda x:(100*x.noted/x.listed).round(0)).sort_values("pct",ascending=False))
print(gm)
