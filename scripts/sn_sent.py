import openpyxl, glob, os, re, csv, collections
base=glob.glob(os.path.expanduser("~/mnt/OneDrive - Mat Viet Group/B*o c*o"))[0]
out=collections.defaultdict(set); src={}
for p in sorted(glob.glob(base+"/SNKH/2026/SNKH T*.xlsx")):
    fn=os.path.basename(p); mm=re.search(r"T(\d+)",fn)
    if not mm: continue
    month=f"2026-{int(mm.group(1)):02d}"
    try: wb=openpyxl.load_workbook(p,read_only=True,data_only=True)
    except OSError: print("CLOUD",fn); continue
    best=None
    for ws in wb.worksheets:
        it=ws.iter_rows(values_only=True)
        try: hdr=[str(c).strip() if c else "" for c in next(it)]
        except StopIteration: continue
        if "Khách hàng" in hdr and "Mã ưu đãi" in hdr:
            ik=hdr.index("Khách hàng"); ic=hdr.index("Mã ưu đãi"); phones=set(); codes=set()
            for r in it:
                if r[ik]: phones.add(re.sub(r"\D","",str(r[ik])))
                if r[ic]: codes.add(str(r[ic]).strip())
            if best is None or len(phones)>len(best[0]): best=(phones,codes,ws.title)
    if best:
        if len(best[0])>len(out[month]): out[month]=best[0]; src[month]=fn+"/"+best[2]
        print(fn, month, "phones",len(best[0]),"codes",len(best[1]),best[2])
with open("sn_sent.csv","w",newline="",encoding="utf-8") as f:
    w=csv.writer(f); w.writerow(["month","phone"])
    for m,ph in out.items():
        for p in ph: w.writerow([m,p])
print({m:len(v) for m,v in out.items()}, src)
