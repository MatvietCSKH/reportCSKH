"""Đọc nhanh sheet SN2023 trong CT CRM.2023.xlsx bằng python-calamine (openpyxl quá chậm với file ~100MB)."""
import sys, csv, datetime
from python_calamine import CalamineWorkbook
src, out = sys.argv[1], sys.argv[2]
ws = CalamineWorkbook.from_path(src).get_sheet_by_name("SN2023")
def cv(v):
    if v is None or v == "": return ""
    if isinstance(v, (datetime.datetime, datetime.date)): return v.strftime("%Y-%m-%d")
    if isinstance(v, float) and v.is_integer(): return int(v)
    return v
with open(out, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    for r in ws.iter_rows():
        w.writerow([cv(v) for v in (list(r[:13]) + [None]*13)[:13]])
