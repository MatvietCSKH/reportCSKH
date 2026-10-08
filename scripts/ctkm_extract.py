"""Trích dữ liệu CTKM cấp dòng hàng từ file BC21 (Sheet1) -> .work/ctkm/lines_<file>.csv
Dùng: python ctkm_extract.py [--out file.csv] <đường dẫn file BC21> [...]"""
import openpyxl, os, sys, csv, datetime, re, time
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(ROOT,".work","ctkm"); os.makedirs(OUT,exist_ok=True)
COLS={"date":1,"bill":2,"kho":7,"makh":14,"nhom":24,"sl":31,"slt":32,"tien":34,"ck":35,"tt":36,"giamhd":50,"km":51,
 "ctkm_t":52,"ctkm_tn":53,"nhom_t":54,"ctkm":56,"ctkm_n":57,"ctkm_d":58,"csgg":64,"csgg_n":65,
 "mud":69,"mud_n":70,"mud_ct":71,"mud_pct":73,"mud_amt":74,"ot":86,"ot_n":87,"ot_ct":88,"ott":95,"ott_n":96,"ott_ct":97,"ott_amt":100,
 "combo":104,"combo_n":105,"combo_ct":106,"card":116,"card_amt":123,"vc":126,"vc_n":127,"qt":135,"qt_n":136,"qt_ct":137,"dctk":144,"dctk_n":145,"dctk_ct":146,
 "mud_from":78,"mud_to":79,"ot_amt":91,"ot_from":93,"ot_to":94,"ott_pct":99,"ott_from":102,"ott_to":103,"ckvc":161,"net":162}
def val(v):
    if v is None: return ""
    if isinstance(v,datetime.datetime): return v.strftime("%Y-%m-%d")
    if isinstance(v,float) and v.is_integer(): return int(v)
    return re.sub(r"\s+"," ",str(v)).strip() if isinstance(v,str) else v
def run_rows(rows,out):
    keys=list(COLS); n=0
    with open(out,"w",newline="",encoding="utf-8") as fo:
        w=csv.writer(fo); w.writerow(keys)
        for r in rows:
            if len(r)<163 or not r[2]: continue
            w.writerow([val(r[COLS[k]]) for k in keys]); n+=1
    return n
args=sys.argv[1:]; force_out=None
if args[:1]==["--out"]: force_out=args[1]; args=args[2:]
for p in args:
    t=time.time(); tag=re.sub(r"[^0-9A-Za-z]+","_",os.path.relpath(p,os.path.dirname(os.path.dirname(p))))
    out=force_out or os.path.join(OUT,f"lines_{tag}.csv")
    if p.lower().endswith(".xls"):
        import xlrd; sh=xlrd.open_workbook(p,on_demand=True).sheet_by_name("Sheet1")
        def gen():
            for i in range(1,sh.nrows):
                r=[]
                for c,cell in enumerate(sh.row(i)):
                    v=cell.value
                    if cell.ctype==3: v=xlrd.xldate.xldate_as_datetime(v,0)
                    elif v=="": v=None
                    r.append(v)
                yield r
        n=run_rows(gen(),out)
    else:
        wb=openpyxl.load_workbook(p,read_only=True,data_only=True); it=wb["Sheet1"].iter_rows(values_only=True); next(it)
        n=run_rows(it,out)
    print(f"{p}: {n} dòng -> {out} [{time.time()-t:.0f}s]",flush=True)
