"""Tự tính 'Thanh toán' sinh nhật từ BC21: mã MUD (cột mud trong ctkm/lines_*.csv) = Mã voucher trong SN2023.
tt = tổng 'tt' các dòng hàng của bill dùng mã đó. Có số BC21 thì lấy BC21, không có thì giữ số nhập tay trong SN2023
(BC21 chi tiết chỉ có từ 2025-10). Mã trùng ở nhiều tháng -> gán cho tháng gửi gần nhất trước ngày dùng."""
import glob, re, os
import pandas as pd

def _norm(s):
    return s.astype(str).str.upper().str.replace(r"\(.*$", "", regex=True).str.strip()

def attach_auto_tt(d, lines_glob="ctkm/lines_*.csv", verbose=True):
    """d: DataFrame đọc từ sn2023.csv (đã strip tên cột). Trả về d có cột tt (số dùng), tt_man, tt_auto, tt_src."""
    d = d.copy()
    d["tt_man"] = pd.to_numeric(d["Thanh toán"], errors="coerce").fillna(0)
    d["_code"] = _norm(d["Mã voucher"])
    d["_m"] = d["Month"].astype(str).str[:7]
    d["tt_auto"] = 0.0
    files = sorted(glob.glob(lines_glob))
    if not files:
        d["tt"] = d.tt_man; d["tt_src"] = "tay"; return d.drop(columns=["_code", "_m"])
    L = pd.concat([pd.read_csv(f, dtype=str, keep_default_na=False, usecols=["date", "bill", "mud", "tt"]) for f in files], ignore_index=True)
    L["code"] = _norm(L.mud); L["tt"] = pd.to_numeric(L.tt, errors="coerce").fillna(0)
    codes = set(d._code) - {""}
    # mã có hậu tố kiểu ...V2 -> bỏ hậu tố nếu bản gốc có trong SN2023
    miss = ~L.code.isin(codes) & L.code.str.match(r"^SN\w+V\d+$")
    L.loc[miss, "code"] = L.loc[miss, "code"].str.replace(r"V\d+$", "", regex=True)
    L = L[L.code.isin(codes)]
    u = L.groupby(["code", "bill"]).agg(tt=("tt", "sum"), date=("date", "min")).reset_index()
    u["um"] = u.date.astype(str).str[:7]
    first_month = min(re.search(r"(\d{4}-\d{2})", os.path.basename(f)).group(1) for f in files)
    # gán mỗi lần dùng cho dòng SN có cùng mã, tháng gửi <= tháng dùng và gần nhất (không có thì tháng sớm nhất)
    cand = d.loc[d._code != "", ["_code", "_m"]].reset_index().rename(columns={"index": "row", "_code": "code"})
    j = u.merge(cand, on="code")
    j["ok"] = j._m <= j.um
    j = j.sort_values(["ok", "_m"], ascending=[False, False]).drop_duplicates(["code", "bill"])
    auto = j.groupby("row").tt.sum()
    d.loc[auto.index, "tt_auto"] = auto.values
    d["tt"] = d.tt_auto.where(d.tt_auto > 0, d.tt_man)
    d["tt_src"] = "tay"; d.loc[d.tt_auto > 0, "tt_src"] = "BC21"
    if verbose:
        r = d[d._m >= first_month]
        print(f"SN auto (BC21 MUD): {len(u)} bill dùng mã SN; từ {first_month}: "
              f"BC21 {int((r.tt_auto>0).sum())} KH / {r.tt_auto.sum()/1e6:.0f}tr, nhập tay {int((r.tt_man>0).sum())} KH / {r.tt_man.sum()/1e6:.0f}tr, "
              f"chỉ có số tay {int(((r.tt_man>0)&(r.tt_auto==0)).sum())}")
    return d.drop(columns=["_code", "_m"])
