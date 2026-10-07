import openpyxl, sys, os, re, csv, datetime, warnings, time, unicodedata
warnings.filterwarnings("ignore")
BASE=os.path.expanduser("~/mnt/OneDrive - Mat Viet Group/Store - Data CSKH/2024")
OUT=os.path.join(os.getcwd(),"store")
def norm(s): return unicodedata.normalize("NFC",str(s)).strip().lower() if s is not None else ""
BASECOLS={"khách hàng","mã kh","sdt","tên","tên kh","thẻ thành viên","thẻ thành viên","mệnh giá voucher","điều kiện","giới tính","độ tuổi","ngày sinh","doanh số","điểm","ch","ngày áp dụng","hạn sử dụng","mã ưu đãi","loại thẻ","\\'","'"}
PHONECOLS=["khách hàng","mã kh","sdt"]
def parse_sheet(name):
    n=name.upper().replace(" ","")
    if not n.startswith("SNKH"): return None
    m=re.match(r"SNKH(\d{2})(\d{2})$",n)   # SNKH0125
    if m: return (int(m.group(1)),2000+int(m.group(2)))
    m=re.match(r"SNKH?T?(\d{1,2})(?:[.\-](\d{2,4}))?$",n)
    if m:
        mo=int(m.group(1)); y=m.group(2)
        if y: y=int(y); y = y+2000 if y<100 else y
        return (mo,y)
    return None
def assign_years(titles):
    ps=[parse_sheet(t) for t in titles]; out=[None]*len(ps)
    known=[(i,p) for i,p in enumerate(ps) if p and p[1]]
    for i,p in enumerate(ps):
        if not p: continue
        if p[1]: out[i]=(p[1],p[0]); continue
        nxt=[(j,q) for j,q in known if j>i]; prv=[(j,q) for j,q in known if j<i]
        if nxt: j,q=nxt[0]; y=q[1] if p[0]<q[0] else q[1]-1
        elif prv: j,q=prv[-1]; y=q[1] if p[0]>q[0] else q[1]+1
        else: y=2024
        out[i]=(y,p[0])
    # enforce monotonic for unsuffixed sequence
    return out
def is_phone(v): return bool(re.fullmatch(r"\d{9,12}",re.sub(r"\D","",str(v)))) if v is not None else False
for f in sys.argv[1:]:
    p=os.path.join(BASE,f); t=time.time()
    store=re.match(r"(\d{3})",f).group(1)
    try: wb=openpyxl.load_workbook(p,read_only=True,data_only=True)
    except Exception as e: print("ERR",f,str(e)[:60]); continue
    rows=[]; log=[]
    yms=assign_years([ws.title for ws in wb.worksheets])
    for ws,ym in zip(wb.worksheets,yms):
        if not ym: continue
        month=f"{ym[0]}-{ym[1]:02d}"
        it=ws.iter_rows(values_only=True); hdr=None; hrow=0
        for i,r in enumerate(it):
            if i>6: break
            ns=[norm(c) for c in r]
            if any(x in ns for x in PHONECOLS+["tên","tên kh"]): hdr=ns; hrow=i; break
        if hdr is None: log.append(f"{ws.title}:nohdr"); continue
        # phone col
        pc=next((hdr.index(x) for x in PHONECOLS if x in hdr),None)
        if pc is None: pc=0
        ncols=[j for j,h in enumerate(hdr) if j>pc and h not in BASECOLS and not re.match(r"^\d{4}-\d{2}-\d{2}",h) and h not in ("q1.2025",)]
        # note columns = non-base headers OR empty headers (but only after base block)
        n=0; noted=0; empty=0
        for r in it:
            if all(c is None or str(c).strip()=="" for c in r[:8]):
                empty+=1
                if empty>300: break
                continue
            empty=0
            ph=re.sub(r"\D","",str(r[pc])) if r[pc] is not None else ""
            if not is_phone(ph): continue
            n+=1
            vals=[(hdr[j] if j<len(hdr) else "",str(r[j]).strip()) for j in ncols if j<len(r) and r[j] is not None and str(r[j]).strip()!=""]
            staff="";date="";method="";note=""
            for h,v in vals:
                vl=v.lower()
                if re.match(r"^\d{4}-\d{2}-\d{2}",v) or re.match(r"^\d{1,2}/\d{1,2}/\d{4}",v): date=date or v[:10]
                elif vl in ("zalo","sms","mess","messenger","call","gọi","goi","zns","fb","tin nhắn","nhắn tin","điện thoại","phone","email","zalo + sms","sms + zalo"): method=method or vl
                elif h in ("nhân viên gọi","nv","nv gọi","staff","nhân viên","nv ","người gọi"): staff=staff or v
                else: note=(note+" | " if note else "")+v[:60]
            if vals: noted+=1
            rows.append([store,month,ws.title,ph,bool(vals),staff[:40],date,method,note[:120]])
        log.append(f"{ws.title}→{month}:{n}/{noted}")
    with open(os.path.join(OUT,f"store_{store}.csv"),"w",newline="",encoding="utf-8") as fo:
        w=csv.writer(fo); w.writerow(["store","month","sheet","phone","noted","staff","date","method","note"]); w.writerows(rows)
    print(f"{f}: {len(rows)} rows [{time.time()-t:.0f}s] "+" ".join(log))
