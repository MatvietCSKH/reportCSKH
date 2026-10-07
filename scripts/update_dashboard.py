#!/usr/bin/env python3
"""Cập nhật Dashboard CSKH Mắt Việt từ file gốc trên OneDrive.

Chạy từng bước (mỗi bước < 3 phút):
  python scripts/update_dashboard.py scan      # liệt kê file nguồn mới/đổi so với lần trước
  python scripts/update_dashboard.py extract   # đọc lại file BC21 / CT CRM / file CH đã đổi
  python scripts/update_dashboard.py compute   # tính số liệu (chạy nền, xem .work/compute.status)
  python scripts/update_dashboard.py build     # ghép index.html, chép sang OneDrive, git commit
  python scripts/update_dashboard.py all       # scan + extract + compute(đợi) + build
State lưu trong .work/state.json; chỉ cập nhật state khi build xong.
"""
import os, sys, re, json, glob, csv, time, subprocess, datetime, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                       # bao-cao-cskh/ (gốc repo)
WORK = os.path.join(ROOT, ".work")
STATE = os.path.join(WORK, "state.json")
OD = glob.glob(os.path.expanduser("~/mnt/OneDrive - Mat Viet Group"))[0]
BAOCAO = glob.glob(os.path.join(OD, "B*o c*o"))[0]
BC21 = os.path.join(BAOCAO, "Data BC21")
STORE_DIR = os.path.join(OD, "Store - Data CSKH", "2024")
CTCRM = os.path.join(BAOCAO, "CT CRM.2023.xlsx")
SKIP_STORES = {"220", "226", "311", "403"}  # CH bỏ qua (file chỉ trên cloud)
MONTH_FILE = re.compile(r"^T\d{1,2}(\.\d{2,4})?( ?\d)?\.(xlsx|xls)$", re.I)

def sources():
    out = {}
    for d in sorted(glob.glob(os.path.join(BC21, "Data 20[2-9][0-9]"))):
        if int(d[-4:]) < 2026: continue          # 2025-T9 trở về trước đã có trong V8
        for f in sorted(os.listdir(d)):
            if MONTH_FILE.match(f):
                out["bc21:" + os.path.relpath(os.path.join(d, f), BC21)] = os.path.join(d, f)
    for f in ("Data 2025/T10.xlsx", "Data 2025/T11.xlsx", "Data 2025/T12 1.xlsx"):
        p = os.path.join(BC21, f)
        if os.path.exists(p): out["bc21:" + f] = p
    out["sn:CT CRM.2023.xlsx"] = CTCRM
    for f in sorted(glob.glob(os.path.join(STORE_DIR, "[0-9][0-9][0-9] - *.xlsx"))):
        if "DESKTOP" in f or os.path.basename(f)[:3] in SKIP_STORES or os.path.basename(f) == "302 - MV183.xlsx": continue  # bỏ qua theo yêu cầu / bản trùng
        out["store:" + os.path.basename(f)] = f
    return out

def sig(p):
    try: st = os.stat(p); return [int(st.st_mtime), st.st_size]
    except OSError: return None

def readable(p):
    try: open(p, "rb").read(4); return True
    except OSError: return False

def load_state():
    try: return json.load(open(STATE))
    except Exception: return {"files": {}}

def scan(verbose=True):
    st = load_state(); src = sources(); changed = []; cloud = []
    for k, p in src.items():
        s = sig(p)
        if s is None: continue
        if st["files"].get(k) != s:
            (changed if readable(p) else cloud).append(k)
    json.dump({"changed": changed, "cloud_only": cloud, "at": datetime.datetime.now().isoformat(timespec="seconds")},
              open(os.path.join(WORK, "scan.json"), "w"), ensure_ascii=False, indent=1)
    if verbose:
        print(f"CHANGED {len(changed)}"); [print("  +", c) for c in changed]
        if cloud: print(f"CLOUD_ONLY {len(cloud)} (cần 'Always keep on this device')"); [print("  ?", c) for c in cloud]
    return changed, cloud

def month_of_csv(path):
    with open(path, encoding="utf-8") as f:
        c = collections.Counter(r["date"][:7] for r in csv.DictReader(f) if r.get("date"))
    return c.most_common(1)[0][0] if c else None

def extract_xls(path, out):
    import xlrd
    wb = xlrd.open_workbook(path, on_demand=True); s = wb.sheet_by_index(0)
    norm = lambda h: re.sub(r"\s+", " ", str(h or "")).strip().lower()
    hdr = [norm(h) for h in s.row_values(0)]; H = {}
    for i, h in enumerate(hdr): H.setdefault(h, i)
    def g(k):
        k = k.lower()
        if k in H: return H[k]
        for kk in H:
            if kk.startswith(k): return H[kk]
    I = {k: g(k) for k in ["Số CT bán/trả","Ngày CT","Mã kho","Cửa hàng","Giới tính","độ tuổi","Mã KH","Tên KH","Thanh toán","CK+CKHD","Thành tiền","Mã loại thẻ thành viên","Mã thẻ thành viên","Mã khuyến mãi (Mã ưu đãi)","Mã Ontop Tổng","Nhóm hàng","Ngày sinh"]}
    def xd(v):
        try: return datetime.datetime(*xlrd.xldate_as_tuple(float(v), wb.datemode))
        except Exception: return None
    def fl(v):
        try: return float(v or 0)
        except Exception: return 0.0
    val = lambda r, k: r[I[k]] if I[k] is not None else ""
    bills = collections.OrderedDict()
    for ri in range(1, s.nrows):
        r = s.row_values(ri); b = val(r, "Số CT bán/trả")
        if not b: continue
        d = bills.get(b)
        if d is None:
            dt = xd(val(r, "Ngày CT")); ns = xd(val(r, "Ngày sinh")) if I["Ngày sinh"] is not None else None
            d = bills[b] = dict(PBH=b, date=dt.strftime("%Y-%m-%d") if dt else "", kho=val(r,"Mã kho"), store=val(r,"Cửa hàng"),
                gt=val(r,"Giới tính"), age=val(r,"độ tuổi"), makh=str(val(r,"Mã KH")).strip(), ten=val(r,"Tên KH"),
                tt=0.0, ck=0.0, tien=0.0, card="", mathe="", sn="", km=set(), ontop=set(), nhom=set(), ns=ns.strftime("%Y-%m-%d") if ns else "")
        d["tt"] += fl(val(r,"Thanh toán")); d["ck"] += fl(val(r,"CK+CKHD")); d["tien"] += fl(val(r,"Thành tiền"))
        c = val(r,"Mã loại thẻ thành viên"); d["card"] = d["card"] or (str(c).strip() if c else "")
        m = val(r,"Mã thẻ thành viên"); d["mathe"] = d["mathe"] or (str(m).strip() if m else "")
        km = val(r,"Mã khuyến mãi (Mã ưu đãi)")
        if km:
            code = str(km).strip(); d["km"].add(code)
            if code.upper().startswith("SN"): d["sn"] = code
        o = val(r,"Mã Ontop Tổng"); o and d["ontop"].add(str(o).strip())
        n = val(r,"Nhóm hàng"); n and d["nhom"].add(str(n).strip())
    with open(out, "w", newline="", encoding="utf-8") as fo:
        w = csv.writer(fo); w.writerow(["PBH","date","kho","store","gt","age","makh","ten","tt","ck","tien","card","mathe","sn","km","ontop","nhom","ns"])
        for d in bills.values():
            w.writerow([d["PBH"],d["date"],d["kho"],d["store"],d["gt"],d["age"],d["makh"],d["ten"],round(d["tt"]),round(d["ck"]),round(d["tien"]),d["card"],d["mathe"],d["sn"],"|".join(sorted(d["km"])),"|".join(sorted(d["ontop"])),"|".join(sorted(d["nhom"])),d["ns"]])

def extract(changed=None):
    if changed is None: changed = json.load(open(os.path.join(WORK, "scan.json")))["changed"]
    src = sources(); done = []
    for k in changed:
        p = src.get(k)
        if not p: continue
        t = time.time()
        if k.startswith("bc21:"):
            tmp = os.path.join(WORK, "raw_tmp.csv")
            if p.lower().endswith(".xls"): extract_xls(p, tmp)
            else:
                rel = os.path.relpath(p, BC21)
                subprocess.run([sys.executable, os.path.join(HERE, "extract_raw.py"), rel], cwd=WORK, check=True, capture_output=True)
                tag = re.sub(r"[^0-9A-Za-z]+", "_", rel); os.replace(os.path.join(WORK, f"raw_{tag}.csv"), tmp)
            m = month_of_csv(tmp)
            if not m: os.remove(tmp); print("  skip (rỗng)", k); continue
            if m < "2025-10": os.remove(tmp); print("  skip (tháng cũ)", k, m); continue
            os.replace(tmp, os.path.join(WORK, f"raw_{m}.csv")); print(f"  {k} -> raw_{m}.csv [{time.time()-t:.0f}s]")
        elif k.startswith("sn:"):
            import openpyxl
            wb = openpyxl.load_workbook(p, read_only=True, data_only=True); ws = wb["SN2023"]
            with open(os.path.join(WORK, "sn2023.csv"), "w", newline="", encoding="utf-8") as f:
                w = csv.writer(f)
                for r in ws.iter_rows(values_only=True):
                    w.writerow(["" if v is None else (v.strftime("%Y-%m-%d") if isinstance(v, datetime.datetime) else v) for v in r[:13]])
            print(f"  {k} -> sn2023.csv [{time.time()-t:.0f}s]")
        elif k.startswith("store:"):
            subprocess.run([sys.executable, os.path.join(HERE, "store_extract.py"), os.path.basename(p)], cwd=WORK, check=True, capture_output=True)
            print(f"  {k} [{time.time()-t:.0f}s]")
        done.append(k)
    json.dump(done, open(os.path.join(WORK, "extracted.json"), "w"))
    print(f"EXTRACTED {len(done)}")

def compute(wait=False):
    status = os.path.join(WORK, "compute.status")
    cmd = f'cd "{WORK}" && echo running > compute.status && python3 "{HERE}/compute.py" > compute.log 2>&1 && python3 "{HERE}/contact.py" >> compute.log 2>&1 && echo done > compute.status || echo failed > compute.status'
    subprocess.Popen(["bash", "-c", cmd], start_new_session=True)
    print("COMPUTE started (xem .work/compute.status)")
    if wait:
        time.sleep(2)
        while open(status).read().strip() == "running": time.sleep(5)
        print("COMPUTE", open(status).read().strip())

def clear_locks(repo, min_age=600):
    """Thư mục kết nối không cho git tự xoá file .lock -> đổi tên chúng sang .git/stale-*."""
    for lk in (".git/index.lock", ".git/HEAD.lock", ".git/objects/maintenance.lock", ".git/refs/heads/main.lock"):
        lp = os.path.join(repo, lk)
        if os.path.exists(lp) and time.time() - os.path.getmtime(lp) >= min_age:
            dst = os.path.join(repo, ".git", f"stale-{os.path.basename(lp)}-{int(time.time()*1000)}")
            try: os.remove(lp)
            except OSError: os.replace(lp, dst)

def build():
    st = open(os.path.join(WORK, "compute.status")).read().strip() if os.path.exists(os.path.join(WORK, "compute.status")) else "done"
    if st != "done": print("BUILD skipped: compute", st); return False
    d = json.load(open(os.path.join(WORK, "dash.json"), encoding="utf-8"))
    for k, v in d.items():
        if isinstance(v, list):
            for r in v:
                for kk in ("rev", "rev_n", "rev_u"):
                    if kk in r and r[kk] is not None: r[kk] = int(round(r[kk]))
    data = json.dumps(d, ensure_ascii=False, separators=(",", ":")).replace("</script", "<\\/script")
    t = open(os.path.join(ROOT, "src", "template.html"), encoding="utf-8").read()
    app = open(os.path.join(ROOT, "src", "app.js"), encoding="utf-8").read()
    html = t.replace("__DATA__", data, 1).replace("/* __APP__ */", app, 1)
    os.makedirs(os.path.join(ROOT, "site"), exist_ok=True)
    open(os.path.join(ROOT, "site", "index.html"), "w", encoding="utf-8").write(
        '<!doctype html>\n<html lang="vi">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="robots" content="noindex, nofollow">\n</head>\n<body>\n' + html + '\n</body>\n</html>\n')   # trang Netlify
    od_dir = os.path.join(BAOCAO, "Dashboard CSKH"); os.makedirs(od_dir, exist_ok=True)
    open(os.path.join(od_dir, "Dashboard CSKH Mat Viet.html"), "w", encoding="utf-8").write(html)
    # save state for all sources currently readable
    stt = load_state()
    for k, p in sources().items():
        s = sig(p)
        if s and readable(p): stt["files"][k] = s
    stt["built"] = datetime.datetime.now().isoformat(timespec="seconds"); stt["last_month"] = d["meta"]["months"][-1]
    json.dump(stt, open(STATE, "w"), ensure_ascii=False, indent=1)
    repo = ROOT
    clear_locks(repo, min_age=600)
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
    diff = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=repo).returncode
    if diff == 0: print("BUILD ok — không có thay đổi để commit"); return True
    msg = f"Cập nhật báo cáo CSKH: dữ liệu đến {d['meta']['months'][-1]} ({d['meta']['generated']})"
    subprocess.run(["git", "-c", "user.name=Mat Viet CSKH", "-c", "user.email=matvietdesignteam@gmail.com", "commit", "-q", "-m", msg,
                    "-m", "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"], cwd=repo, check=True)
    clear_locks(repo, min_age=0)   # git đã chạy xong; lock còn lại là do thư mục không cho xoá
    print("COMMITTED", msg); return True

if __name__ == "__main__":
    os.makedirs(WORK, exist_ok=True)
    step = sys.argv[1] if len(sys.argv) > 1 else "scan"
    if step == "scan": scan()
    elif step == "extract": extract()
    elif step == "compute": compute(wait="--wait" in sys.argv)
    elif step == "build": build()
    elif step == "all":
        ch, _ = scan()
        if ch: extract(ch); compute(wait=True); build()
        else: print("Không có dữ liệu mới.")
