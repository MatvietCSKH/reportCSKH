#!/usr/bin/env python3
"""Tab "Cuộc gọi ra" — cuộc gọi ra của CSKH (line 1002): KPI ngày, mục đích gọi, kết quả gọi CSKH sau mua, khảo sát.

Nguồn (OneDrive › Báo cáo):
  CS report › Daily Report - Q4.2026.xlsx   sheet "2026" (target ngày) + "Chi tiết Outbound" (log tổng đài từ 19/10/2026)
  CS report › 01.Rawdata Outbound.xlsx       sheet "Rawdata" (log 2024 → 9/2026, cột DID = mục đích) + "Daily" (target ngày 2026)
  Data CSKH cũ › 2026 Q4 › Call after buying Q4.2026.xlsx   sheet "Call" (danh sách KH sau mua + kết quả gọi + khảo sát),
        "Dky đo mắt", "NPS" — tên sheet = mục đích gọi; số bị gọi không có trong file = "Tư vấn khách hàng"
Ghi vào khoá "call" của .work/dash.json: chỉ số gộp theo ngày / tháng / cửa hàng, KHÔNG có SĐT, tên KH hay nội dung.

Quy ước: cuộc gọi hiệu quả = đàm thoại ≥ 20 giây (cột Done trong log; Core KPI C1 ≥ 100/ngày). Rawdata có nhiều dòng đảo
ngày/tháng (10/04 ghi thành 04/10) → sửa theo thứ tự dòng (file xếp theo thời gian). Mã KH trong Excel bị mất số 0 đầu → chuẩn về 10 số.
"""
import os, re, glob, json, datetime, collections, unicodedata, warnings
import pandas as pd, numpy as np
warnings.filterwarnings("ignore")

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
WORK = os.path.join(ROOT, ".work"); DASH = os.path.join(WORK, "dash.json")
_od = glob.glob(os.path.expanduser("~/mnt/OneDrive - Mat Viet Group")); OD = _od[0] if _od else ""
_bc = glob.glob(os.path.join(OD, "B*o c*o")) if OD else []; BAOCAO = _bc[0] if _bc else ""
KPI_LINE = "1002"

def find(*patterns):
    for pat in patterns:
        hits = [f for f in glob.glob(os.path.join(BAOCAO, pat)) if not os.path.basename(f).startswith("~$")]
        if hits: return sorted(hits, key=os.path.getmtime)[-1]
    return None

def norm_phone(v):
    if v is None or (isinstance(v, float) and np.isnan(v)): return ""
    s = re.sub(r"\D", "", str(v).split(".")[0] if isinstance(v, (int, float)) else str(v))
    s = s.lstrip("0") if len(s) > 10 else s
    if s.startswith("84") and len(s) == 11: s = s[2:]
    return "0" + s if len(s) == 9 else s

def to_sec(v):
    if v is None or (isinstance(v, float) and np.isnan(v)): return 0.0
    if isinstance(v, datetime.time): return v.hour * 3600 + v.minute * 60 + v.second
    if isinstance(v, datetime.timedelta): return v.total_seconds()
    if isinstance(v, (int, float)): return float(v)
    try:
        p = [float(x) for x in str(v).strip().split(":")]
        return p[0] * 60 + p[1] if len(p) == 2 else p[0] * 3600 + p[1] * 60 + p[2] if len(p) == 3 else p[0]
    except Exception: return 0.0

def fix_swapped(ts):
    """File xếp theo thời gian; với mỗi dòng chọn giữa (ngày đọc được, ngày đảo) cái không lùi quá 1 ngày và gần dòng trước nhất."""
    out = []; last = None; n = 0
    for t in ts:
        c = [t]
        if t.day <= 12 and t.day != t.month:
            try: c.append(t.replace(month=t.day, day=t.month))
            except ValueError: pass
        pick = t
        if last is not None:
            ok = [x for x in c if x >= last - pd.Timedelta(days=1)]
            if ok: pick = min(ok, key=lambda x: x - last)
        if pick != t: n += 1
        out.append(pick); last = pick
    return out, n

BINS = [-1, 0, 20, 60, 120, 300, 10 ** 9]; BIN_LBL = ["0 giây", "1–20 giây", "21–60 giây", "1–2 phút", "2–5 phút", ">5 phút"]
RAW_PURP = {"CSKH sau mua": "CSKH sau mua", "NPS": "Gọi lại KH NPS thấp", "ĐK đo mắt": "Xác nhận lịch đo mắt"}

def day_rows(df, src, full_fn, tcol="talk_s"):
    out = {}
    for d, g in df.groupby("d"):
        hrs = {int(h): [int(len(x)), int(x["eff"].sum())] for h, x in g.groupby(g["t"].dt.hour)}
        b = pd.cut(g[tcol], bins=BINS, labels=BIN_LBL).value_counts().reindex(BIN_LBL).fillna(0).astype(int).tolist()
        out[d] = {"d": d.isoformat(), "src": src, "calls": int(len(g)), "ans": int((g["status"] == "ANSWERED").sum()), "eff": int(g["eff"].sum()),
                  "talk": int(g[tcol].sum()), "uniq": int(g["phone"].nunique()), "full": bool(full_fn(g)),
                  "p": {p: int(v) for p, v in g["purpose"].value_counts().items()}, "h": hrs, "b": b}
    return out

def read_raw(path):
    """Log cũ 2024→9/2026: gộp theo ngày, cache theo (mtime, size) vì file ~47 MB."""
    cache = os.path.join(WORK, "outbound_raw_daily.json"); st = os.stat(path); key = [int(st.st_mtime), st.st_size]
    try:
        c = json.load(open(cache, encoding="utf-8"))
        if c.get("sig") == key: return c["days"], c["targets"], c["fixed"]
    except Exception: pass
    raw = pd.read_excel(path, sheet_name="Rawdata", usecols="A,B,C,D,E,H,J")
    raw.columns = ["t", "line", "phone", "status", "talk", "did", "flag"]
    raw["t"] = pd.to_datetime(raw["t"], errors="coerce"); raw = raw[raw["t"].notna()].copy()
    raw["t"], fixed = fix_swapped(list(raw["t"]))
    raw = raw[raw["line"].astype(str).str.replace(r"\.0$", "", regex=True) == KPI_LINE]
    raw["talk_s"] = raw["talk"].map(to_sec); raw["phone"] = raw["phone"].map(norm_phone)
    raw["purpose"] = raw["did"].map(lambda v: RAW_PURP.get(str(v).strip(), "Tư vấn khách hàng"))
    raw["eff"] = raw["flag"].isin(["Done", "Pass"]); raw["d"] = raw["t"].dt.date
    days = {d.isoformat(): r for d, r in day_rows(raw, "raw", lambda g: True).items()}
    tg = {}
    try:
        rd = pd.read_excel(path, sheet_name="Daily", header=None, skiprows=2).iloc[:, :9]
        rd.columns = ["week", "day", "wd", "dom", "month", "target", "done", "pass", "note"]
        rd["day"] = pd.to_datetime(rd["day"], errors="coerce", dayfirst=True)
        for d, t in zip(rd["day"], rd["target"]):
            if pd.notna(d) and pd.notna(t): tg[d.date().isoformat()] = int(t)
    except Exception as e: print("outbound: không đọc được sheet Daily của Rawdata:", e)
    json.dump({"sig": key, "days": days, "targets": tg, "fixed": fixed}, open(cache, "w", encoding="utf-8"), ensure_ascii=False)
    return days, tg, fixed

def read_q4_log(path):
    lg = pd.read_excel(path, sheet_name="Chi tiết Outbound")
    lg = lg.iloc[:, :13]; lg.columns = ["t", "line", "phone", "status", "talk", "wait", "dur", "talk2", "wait2", "dur2", "day", "sec", "done"][:len(lg.columns)]
    lg["t"] = pd.to_datetime(lg["t"], errors="coerce"); lg = lg[lg["t"].notna()].copy()
    lg["phone"] = lg["phone"].map(norm_phone); lg["talk_s"] = pd.to_numeric(lg["sec"], errors="coerce").fillna(0)
    lg["eff"] = lg["talk_s"] >= 20; lg["d"] = lg["t"].dt.date
    k = pd.read_excel(path, sheet_name="2026", header=None, skiprows=2).iloc[:, :8]
    k.columns = ["week", "day", "wd", "dom", "target", "done", "pass", "note"]
    k["day"] = pd.to_datetime(k["day"], errors="coerce")
    tg = {d.date().isoformat(): int(t) for d, t in zip(k["day"], k["target"]) if pd.notna(d) and pd.notna(t)}
    return lg, tg

KQ_GROUP = {"KH trả lời cuộc gọi": "Nói chuyện được", "Phàn nàn/Khiếu nại/Góp ý": "Nói chuyện được",
            "KH bận": "Gặp nhưng KH bận", "KH từ chối trao đổi vì bận": "Gặp nhưng KH bận",
            "KH từ chối trao đổi": "Gặp nhưng từ chối", "KH cúp máy ngang": "Gặp nhưng từ chối", "KH không có nhu cầu nhận cg KSSM": "Gặp nhưng từ chối",
            "Người nhà mua/KH đăng ký dùm": "Gặp người khác / sai số", "Số không đúng": "Gặp người khác / sai số", "KH không đúng": "Gặp người khác / sai số",
            "KBM": "Không bắt máy", "ĐT reo nhưng không nhấc máy": "Không bắt máy",
            "Thuê bao/KLLĐ": "Thuê bao / tắt máy / không tồn tại", "Thuê bao": "Thuê bao / tắt máy / không tồn tại", "ĐT tắt máy": "Thuê bao / tắt máy / không tồn tại", "ĐT không tồn tại": "Thuê bao / tắt máy / không tồn tại"}
ISSUE_TAGS = [("Thái độ / cách phục vụ", r"thái độ|không thoải mái|tiếp đón|cộc|khó chịu|phục vụ"),
              ("Không được tư vấn CTKM / ưu đãi", r"ctkm|ưu đãi|khuyến mãi|quà|sinh nhật|voucher"),
              ("Tròng kính / độ / chất lượng", r"tròng|độ|mờ|bám nước|mẻ|choáng|nhức|sắc"), ("Gọng / cân chỉnh", r"gọng|tụt|cân chỉnh|lỏng"),
              ("Thiếu phụ kiện (bao / hộp)", r"bao kính|hộp|khăn|phụ kiện"), ("Giao hàng / thời gian chờ", r"giao|lâu|chờ|hẹn"), ("Bảo hành", r"bảo hành"),
              ("Không muốn nhận cuộc gọi khảo sát", r"không có nhu cầu|không nhận")]

def read_call_list(path, log_phones):
    """Sheet Call + Dky đo mắt + NPS + Sheet1 → chỉ số gộp (không SĐT). Trả về (stats, phones theo mục đích)."""
    xl = pd.ExcelFile(path); sheets = xl.sheet_names
    call = pd.read_excel(path, sheet_name="Call"); call.columns = [str(c).strip() for c in call.columns]
    call = call[call["Mã KH"].notna()].copy(); call["phone"] = call["Mã KH"].map(norm_phone)
    call["kq"] = call["Kết quả cuộc gọi"].fillna("").astype(str).str.strip() if "Kết quả cuộc gọi" in call else ""
    call["grp"] = call["kq"].map(lambda s: "Chưa gọi" if not s else KQ_GROUP.get(s, "Khác"))
    col = lambda pre: next((c for c in call.columns if c.startswith(pre)), None)
    sat_c, wait_c, fit_c, comf_c, ctkm_c, issue_c = col("Anh chị có hài lòng"), col("Thời gian chờ"), col("Sản phẩm được"), col("Anh/Chị có thoải mái"), next((c for c in call.columns if "CTKM" in c), None), col("Các vấn đề")
    call["sat"] = call[sat_c].fillna("").astype(str).str.strip() if sat_c else ""
    rev = pd.to_numeric(call.get("Doanh số"), errors="coerce").fillna(0) if "Doanh số" in call else pd.Series(0, index=call.index)
    called = call[call["kq"] != ""]; not_called = call[call["kq"] == ""]
    S = {"n": int(len(call)), "uniq": int(call["phone"].nunique()), "called": int(len(called)), "not_called": int(len(not_called)),
         "kq": {k: int(v) for k, v in called["kq"].value_counts().items()}, "grp": {k: int(v) for k, v in call["grp"].value_counts().items()},
         "rev_total": float(rev.sum()), "rev_called": float(rev[called.index].sum()),
         "rev_called_avg": float(rev[called.index].mean()) if len(called) else 0, "rev_not_called_avg": float(rev[not_called.index].mean()) if len(not_called) else 0,
         "in_log": int(call["phone"].isin(log_phones).sum()), "called_in_log": int(called["phone"].isin(log_phones).sum()),
         "not_in_log_by_grp": {k: int(v) for k, v in called[~called["phone"].isin(log_phones)]["grp"].value_counts().items()}}
    sv = {"sat": {k: int(v) for k, v in call[call["sat"] != ""]["sat"].value_counts().items()}, "n_sat": int((call["sat"] != "").sum())}
    for name, c in [("wait", wait_c), ("fit", fit_c), ("comfort", comf_c)]:
        v = pd.to_numeric(call[c], errors="coerce").dropna() if c else pd.Series(dtype=float)
        sv[name] = {"n": int(len(v)), "mean": float(v.mean()) if len(v) else 0, "dist": {int(a): int(b) for a, b in v.value_counts().sort_index().items()}, "low": int((v <= 3).sum())}
    if ctkm_c:
        ct = call[ctkm_c].astype(str).str.strip().str.title().replace({"Nan": ""}); sv["ctkm"] = {k: int(v) for k, v in ct[ct != ""].value_counts().items()}
    issues = call[call[issue_c].notna()] if issue_c else call.iloc[0:0]
    tags = collections.Counter()
    for s in issues[issue_c] if issue_c else []:
        low = str(s).lower(); t = [n for n, p in ISSUE_TAGS if re.search(p, low)]; tags.update(t or ["Khác"])
    sv["issues_n"] = int(len(issues)); sv["issue_tags"] = dict(tags); sv["issue_by_store"] = {k: int(v) for k, v in issues["CH"].value_counts().items()} if len(issues) else {}
    bs = []
    for ch, g in call.groupby("CH"):
        s = g["sat"]
        bs.append({"ch": str(ch), "code": str(ch)[:3], "n": int(len(g)), "called": int((g["kq"] != "").sum()), "talked": int((g["grp"] == "Nói chuyện được").sum()),
                   "noanswer": int(g["grp"].isin(["Không bắt máy", "Thuê bao / tắt máy / không tồn tại"]).sum()),
                   "sat_pos": int(s.isin(["Hài lòng", "Rất hài lòng"]).sum()), "sat_neg": int(s.isin(["Không hài lòng", "Rất không hài lòng"]).sum()), "sat_n": int((s != "").sum()),
                   "issues": int(g[issue_c].notna().sum()) if issue_c else 0, "rev": float(rev[g.index].sum())})
    bs.sort(key=lambda r: -r["n"])
    # mục đích khác theo tên sheet
    dk_phones, nps_phones = set(), set()
    dk_n = 0
    if "Dky đo mắt" in sheets:
        dk = pd.read_excel(path, sheet_name="Dky đo mắt", header=None)
        hdr = dk.index[dk[0].astype(str).str.contains("Dấu thời gian")].tolist()
        if hdr:
            rows = dk.iloc[hdr[0] + 1:].dropna(how="all"); dk_n = int(len(rows)); dk_phones = {p for p in rows[2].map(norm_phone) if len(p) == 10}
    if "NPS" in sheets:
        nps = pd.read_excel(path, sheet_name="NPS", header=None)
        if len(nps.columns) > 3: nps_phones = {p for p in nps[3].dropna().map(norm_phone) if len(p) == 10}
    S["dk"] = {"n": dk_n, "in_log": int(len(dk_phones & log_phones))}; S["nps_n"] = int(len(nps_phones))
    S["survey"] = sv; S["by_store"] = bs; S["src"] = os.path.basename(path)
    S["mtime"] = datetime.datetime.fromtimestamp(os.path.getmtime(path)).strftime("%Y-%m-%d %H:%M")
    return S, {"CSKH sau mua": set(call["phone"]) - {""}, "Xác nhận lịch đo mắt": dk_phones, "Gọi lại KH NPS thấp": nps_phones}

def main():
    if not BAOCAO: print("outbound: không có OneDrive — bỏ qua"); return
    f_daily = os.environ.get("OUTBOUND_DAILY") or find("CS report/Daily Report - Q4*.xlsx"); f_raw = find("CS report/01.Rawdata Outbound.xlsx")   # OUTBOUND_DAILY: đường dẫn thay thế khi file gốc đang bị khoá
    f_call = find("Data CSKH c*/2026 Q4/Call after buying*.xlsx")
    if not f_daily: print("outbound: không thấy Daily Report - Q4 — bỏ qua"); return
    lg, tg_q4 = read_q4_log(f_daily)
    lg = lg[lg["line"].astype(str).str.replace(r"\.0$", "", regex=True) == KPI_LINE]
    log_phones = set(lg["phone"]) - {""}
    lists = {}; purp_phones = {}
    if f_call:
        S, purp_phones = read_call_list(f_call, log_phones)
        # gắn danh sách vào tháng có nhiều cuộc gọi tới KH trong danh sách nhất
        hit = lg[lg["phone"].isin(purp_phones["CSKH sau mua"])]["t"].dt.strftime("%Y-%m")
        m = hit.mode().iloc[0] if len(hit) else datetime.datetime.fromtimestamp(os.path.getmtime(f_call)).strftime("%Y-%m")
        lists[m] = S
    def purpose(p):
        for k in ("Gọi lại KH NPS thấp", "Xác nhận lịch đo mắt", "CSKH sau mua"):
            if p in purp_phones.get(k, ()): return k
        return "Tư vấn khách hàng"
    lg["purpose"] = lg["phone"].map(purpose)
    q4_days = day_rows(lg, "q4", lambda g: (g["status"] != "ANSWERED").any())
    days = {}; targets = {}; fixed = 0
    if f_raw and os.path.exists(f_raw):
        rdays, rtg, fixed = read_raw(f_raw)
        q4_first = min(q4_days) if q4_days else datetime.date(2100, 1, 1)
        for d, r in rdays.items():
            if datetime.date.fromisoformat(d) < q4_first.replace(day=1): days[d] = r      # tháng có file Q4 thì lấy file Q4
        for d, t in rtg.items():
            if datetime.date.fromisoformat(d) < q4_first.replace(day=1): targets[d] = t
    for d, r in q4_days.items(): days[d.isoformat()] = r
    targets.update(tg_q4)
    days = {d: r for d, r in days.items() if d >= "2026-01-01"}        # trang chỉ theo dõi từ 2026
    last = max(days) if days else datetime.date.today().isoformat()
    for d in set(targets) | set(days):
        if d < "2026-01-01" or d > last: continue
        r = days.setdefault(d, {"d": d, "src": "none", "calls": 0, "ans": 0, "eff": 0, "talk": 0, "uniq": 0, "full": False, "p": {}, "h": {}, "b": [0] * 6})
        r["target"] = targets.get(d, 0)
    daily = [days[d] for d in sorted(days)]
    rep = {}
    for m, g in lg.groupby(lg["t"].dt.strftime("%Y-%m")):
        rc = g.groupby("phone").size().value_counts().sort_index(); rep[m] = {int(a): int(b) for a, b in rc.items()}
    D = json.load(open(DASH, encoding="utf-8"))
    D["call"] = {"line": KPI_LINE, "daily": daily, "lists": lists, "repeat": rep, "bins": BIN_LBL, "raw_fixed": int(fixed),
                 "answered_only_from": next((r["d"] for r in daily if r["src"] == "q4" and r["calls"] and not r["full"]), ""),
                 "last": last, "last_time": lg["t"].max().strftime("%H:%M") if len(lg) else "",
                 "src": {"daily": os.path.basename(f_daily), "daily_mtime": datetime.datetime.fromtimestamp(os.path.getmtime(f_daily)).strftime("%Y-%m-%d %H:%M"),
                         "raw": os.path.basename(f_raw) if f_raw else "", "call": os.path.basename(f_call) if f_call else ""}}
    json.dump(D, open(DASH, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"outbound: {len(daily)} ngày, log Q4 {len(lg)} cuộc đến {last}, {len(lists)} danh sách gọi {list(lists)}, raw sửa {fixed} dòng đảo ngày/tháng")

if __name__ == "__main__":
    try: main()
    except PermissionError as e:   # file đang mở trong Excel / OneDrive đang đồng bộ → giữ nguyên khoá "call" của lần trước
        print("outbound: không đọc được file nguồn (đang bị khoá?):", e); print("outbound: giữ số liệu lần trước")
