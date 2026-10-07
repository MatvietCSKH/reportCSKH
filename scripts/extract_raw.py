import openpyxl, glob, os, csv, sys, time, datetime, re, collections
base=glob.glob(os.path.expanduser("~/mnt/OneDrive - Mat Viet Group/B*o c*o"))[0]
def norm(h): return re.sub(r"\s+"," ",str(h or "")).strip()
for f in sys.argv[1:]:
    tag=re.sub(r"[^0-9A-Za-z]+","_",f)
    p=glob.glob(base+"/Data BC21/"+f)
    if not p: print("MISSING",f); continue
    t=time.time(); wb=openpyxl.load_workbook(p[0],read_only=True,data_only=True)
    ws=wb["Sheet1"]; it=ws.iter_rows(values_only=True); hdr=[norm(h) for h in next(it)]
    H={}
    for i,h in enumerate(hdr): H.setdefault(h.lower(),i)
    class _D(dict):
        def __getitem__(s,k):
            k=k.lower()
            if k in s: return dict.__getitem__(s,k)
            for kk in s:
                if kk.startswith(k): return dict.__getitem__(s,kk)
            print("  !! missing col",k,"-> None"); return None
        def get(s,k,d=None):
            v=s[k]; return d if v is None else v
    H=_D(H)
    iBill=H["Số CT bán/trả"]; iDate=H["Ngày CT"]; iKho=H["Mã kho"]; iStore=H["Cửa hàng"]
    iGT=H["Giới tính"]; iAge=H["độ tuổi"]; iKH=H["Mã KH"]; iTen=H["Tên KH"]; iTT=H["Thanh toán"]; iCK=H["CK+CKHD"]; iTien=H["Thành tiền"]
    iCard=H.get("Mã loại thẻ thành viên"); iMathe=H.get("Mã thẻ thành viên"); iKM=H.get("Mã khuyến mãi (Mã ưu đãi)"); iOntop=H.get("Mã Ontop Tổng"); iNhom=H.get("Nhóm hàng"); iNS=H.get("Ngày sinh")
    bills=collections.OrderedDict(); n=0
    for r in it:
        b=r[iBill]
        if not b: continue
        n+=1
        d=bills.get(b)
        if d is None:
            dt=r[iDate]
            d=bills[b]={"PBH":b,"date":dt.strftime("%Y-%m-%d") if isinstance(dt,datetime.datetime) else str(dt)[:10],
                "kho":r[iKho],"store":r[iStore],"gt":r[iGT] if iGT is not None else "","age":r[iAge] if iAge is not None else "","makh":str(r[iKH]).strip() if r[iKH] is not None else "","ten":r[iTen],
                "tt":0.0,"ck":0.0,"tien":0.0,"card":"","mathe":"","sn":"","km":set(),"ontop":set(),"nhom":set(),"ns":""}
            if iNS is not None and isinstance(r[iNS],datetime.datetime): d["ns"]=r[iNS].strftime("%Y-%m-%d")
        d["tt"]+=float(r[iTT] or 0); d["ck"]+=float(r[iCK] or 0); d["tien"]+=float(r[iTien] or 0)
        if iCard is not None and r[iCard] and not d["card"]: d["card"]=str(r[iCard]).strip()
        if iMathe is not None and r[iMathe] and not d["mathe"]: d["mathe"]=str(r[iMathe]).strip()
        if iKM is not None and r[iKM]:
            code=str(r[iKM]).strip(); d["km"].add(code)
            if code.upper().startswith("SN"): d["sn"]=code
        if iOntop is not None and r[iOntop]: d["ontop"].add(str(r[iOntop]).strip())
        if iNhom is not None and r[iNhom]: d["nhom"].add(str(r[iNhom]).strip())
    out=f"raw_{tag}.csv"
    with open(out,"w",newline="",encoding="utf-8") as fo:
        w=csv.writer(fo); w.writerow(["PBH","date","kho","store","gt","age","makh","ten","tt","ck","tien","card","mathe","sn","km","ontop","nhom","ns"])
        for d in bills.values():
            w.writerow([d["PBH"],d["date"],d["kho"],d["store"],d["gt"],d["age"],d["makh"],d["ten"],round(d["tt"]),round(d["ck"]),round(d["tien"]),d["card"],d["mathe"],d["sn"],"|".join(sorted(d["km"])),"|".join(sorted(d["ontop"])),"|".join(sorted(d["nhom"])),d["ns"]])
    months=collections.Counter(d["date"][:7] for d in bills.values())
    print(f"{f}: lines={n} bills={len(bills)} tt={sum(d['tt'] for d in bills.values())/1e9:.3f}B months={dict(months.most_common(3))} card_col={iCard} km_col={iKM} [{time.time()-t:.0f}s]")
