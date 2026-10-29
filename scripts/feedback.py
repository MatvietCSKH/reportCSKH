#!/usr/bin/env python3
"""Tab "Phản hồi KH" — phân tích phản ánh / review của khách hàng.

Nguồn: OneDrive › Báo cáo › CS report › "Phản hồi của KH.xlsx", sheet "Phản hồi"
(cột: Ngày, Tuần, Tháng, Kênh tương tác, Mã KH, Tên KH, Cửa hàng, Model, Note, Content, Group, Phản hồi của CS, Startus).
Ghi vào khoá "fb" của .work/dash.json. KHÔNG đưa Mã KH / Tên KH vào; số điện thoại và tên KH trong nội dung được che.

Ngoài các cột có sẵn, script tự gắn:
  tags  = vấn đề cụ thể (theo từ khoá trong nội dung KH phản ánh) — 1 phản hồi có thể nhiều vấn đề
  sev   = mức độ: 3 Nghiêm trọng (KH nói bỏ đi / 1 sao / nghi gian lận…), 2 Không hài lòng, 1 Góp ý (KH có khen kèm góp ý)
  cs    = 1 nếu cột "Phản hồi của CS" đã có nội dung
"""
import os, re, glob, json, datetime, unicodedata
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
DASH = os.path.join(ROOT, ".work", "dash.json")

TAGS = [   # (nhãn, regex trên nội dung KH) — sửa/thêm khi xuất hiện nhóm vấn đề mới
 ("Thái độ / giao tiếp NV", r"thái độ|thô bạo|tôn trọng|né tránh|đổ thừa|không tin|giọng điệu|phát ngôn|đòi hỏi quá|không lắng nghe|chưa lắng nghe|thiếu hợp tác|chưa niềm nở|không quan tâm|chưa quan tâm|thế chị|\dí\|cách các bạn giải quyết|ganh tị|không (được )?thoải mái|thái độ khó chịu|tỏ (ra|thái độ) khó chịu|(nhân viên|nvbh|ktv|người đo|bạn nv|bạn nhân viên)[^.;,]{0,30}khó chịu|hơi ẩu|đi theo sát|chỉ nói là không có|tiếp đón|làm việc kiểu gì|kiểu gì vậy|nói chuyện khó nghe|(chậm|không|không chịu) nhận lỗi"),
 ("Quyền lợi thẻ TV / ưu đãi chưa áp dụng", r"hạng thành viên|quyền lợi|không kiểm tra kỹ|chỉ được ưu đãi|không được tư vấn (các )?(thông tin )?(ưu đãi|ctkm|chương trình)|không tư vấn chương trình|chỉ có chương trình đánh giá"),
 ("Tư vấn chưa rõ / chưa đúng", r"tư vấn (chưa|không|sai|thiếu)|chưa tư vấn|không tư vấn|minh bạch|giải thích chưa|chẩn đoán sai|mẫu kính nữ|chưa chủ động"),
 ("Thiếu KTV / chờ lâu", r"không có (kỹ thuật viên|ng(ười)? đo)|ko có ng|chờ (khá )?lâu|đợi lâu|quá lâu|thiếu nhân sự|lâu hơn dự kiến|chờ đo kính|lấy kính cũng lâu"),
 ("Đo mắt / sai độ", r"đo (mắt|kính) (sai|nhanh|ẩu|qua loa|không chính xác|chênh|lệch)|đo (sai|lệch|chênh)|lệch độ|chấm lệch|kết quả đo|sai độ|số độ|độ kính|cắt sai|tức mắt|nhìn còn mờ|váng đầu|kính nhìn gần|choáng|chóng mặt|mỏi mắt|giảm độ|tăng độ|mờ một bên|nhìn (sang|xa|gần) .{0,12}bị"),
 ("Giao sai sản phẩm / sai đơn", r"giao (nhầm|sai)|đặt .{0,40}nhưng (được )?giao|giao .{0,20}(khác|không đúng) (với )?(sản phẩm|mẫu|loại|chiết suất)|sai (sản phẩm|mẫu|chiết suất|loại tròng)"),
 ("Giữ kết quả đo / ép mua", r"không cho biết kết quả|phải mua kính mới đo|\ép\|chưa gì đã"),
 ("Từ chối phục vụ / không nhận gia công", r"không dám (nhận|cắt|làm)|không (nhận|chịu) (cắt|làm|gia công)|từ chối (cắt|nhận|phục vụ|làm|hỗ trợ)|kêu không làm được|không hỗ trợ (thay|cắt|đổi)|không (thể|được) hỗ trợ"),
 ("Lỗi / độ bền sản phẩm", r"trầy|bong tróc|gãy|nứt|vỡ|rỉ|gỉ|ngoạc|xuống cấp|không cảm nhận được sự thay đổi màu|logo trên tròng|lớp váng|bành|chất lượng (kém|k tốt|tệ)|cực kỳ tệ|oxy hóa|rơi ra|chống trầy|vết mẻ|mẻ|sắc/bén|bám nước|hơi nước|gây mờ|dễ (bị )?tụt|cân chỉnh nhiều lần|xước|bám bẩn|đốm|chấm nhỏ|phải nhô|nhô ra|lỗi sản phẩm"),
 ("Bảo hành / sửa chữa", r"bảo hành|không thuộc phạm vi|sửa chữa|chỉnh (gọng|kính|lại)|hết thời gian"),
 ("Chi phí phát sinh", r"chi phí|phát sinh phí"),
 ("Đổi trả / hoàn tiền", r"đổi hàng|đổi trả|trả hàng|trả lại|hoàn tiền|hoàn lại|(tiền|giá|mất|bù|phí) chênh lệch|chênh lệch (tiền|giá)|đổi sang mẫu khác|đổi sản phẩm"),
 ("Hàng trưng bày / không mới", r"hàng trưng bày|là hàng trưng bày|seal|không còn mới|đã qua sử dụng"),
 ("Giá cao", r"quá (mắc|đắt)|(mắc|đắt) (quá|hơn|ghê|vậy|thế)|càng (ngày càng )?(mắc|đắt)|(?<!đánh )(?<!không phải là )(?<!không phải )giá (cao|mắc|đắt|chát)|so với giá tiền|giá thấp hơn|chưa đồng nhất về giá|> ?2 triệu|giàu ghê|tương xứng với giá tiền"),
 ("Tồn kho / thông báo đơn hàng", r"hết tròng|tồn kho|chờ hàng"),
 ("Thanh toán / hóa đơn bất thường", r"tk cá nhân|tài khoản cá nhân|quẹt thẻ của nv|\hdd\|không thể cung cấp cho chúng tôi hóa đơn|hóa đơn không ghi rõ|phát s[ia]nh tăng giá|tính tiền .{0,15}tăng giá|niêm yết .{0,30}tính tiền"),
 ("Quà tặng / CTKM / phụ kiện", r"quà tặng|khuyến mãi|ctkm|bao kính|hộp kính|phần quà|mã giảm|voucher|mã sinh nhật|ưu đãi sinh nhật"),
 ("Khen / không phản ánh", r"(?s)^(?=.*(khen|(?<!không )(?<!chưa )(?<!k )(?<!ko )hài lòng|không có nhu cầu|không có bất kỳ phản ánh))(?!.*(tuy nhiên|nhưng|không (được )?thoải mái|bực|khó chịu|(?<!bất kỳ )phản ánh)).*$"),
 ("Cơ sở vật chất / thông tin CH", r"giữ xe|\map\|đóng cửa|mặt bằng"),
 ("Thương hiệu / truyền thông", r"đại sứ|lưỡi bò|nhãn hàng"),
 ("Review ngắn, chưa rõ vấn đề", r"^$"),
]
SEV3 = r"không bao giờ quay lại|ko bao giờ|sẽ không (tiếp tục|quay lại)|không có ý định quay lại|tránh xa|bị lừa|lừa|1 sao|từ chối mua|chuyển sang mua|tồi tệ|tiền mất tật mang|phá đi danh tiếng|lưỡi bò|tk cá nhân"
SEV1 = r"đánh giá (tốt|cao|hài lòng)|hài lòng về|không có bất kỳ phản ánh|rất thân thiện|đề xuất|góp ý|chỉ muốn góp ý|vẫn đang hài lòng|kh khen"

def nfc(s): return unicodedata.normalize("NFC", re.sub(r"[ \t]+", " ", str(s))).strip() if s is not None and str(s) != "nan" else ""
def redact(s):
    s = re.sub(r"0\d{8,10}|\d{9,11}", "[SĐT]", s)
    s = re.sub(r"(Khách hàng|KH|Khách)\s+((?:[A-ZĐ][a-zà-ỹđ]+\s+){1,3})(phản|cho|mua|đã|sử)", r"\1 \3", s)   # "Khách hàng Phúc Phùng phản ánh" -> "Khách hàng phản ánh"
    return s
def find_src():
    hits = glob.glob(os.path.expanduser("~/mnt/OneDrive - Mat Viet Group/B*o c*o/CS report/Ph*n h*i c*a KH.xlsx"))
    return [h for h in hits if not os.path.basename(h).startswith("~$")][:1]

def parse_date(v, month):
    d = None
    if isinstance(v, (datetime.datetime, pd.Timestamp)): d = pd.Timestamp(v)
    elif isinstance(v, str) and v.strip():
        d = pd.to_datetime(v.strip(), dayfirst=True, errors="coerce")
    if d is None or pd.isna(d): return None
    try: m = int(month)
    except (TypeError, ValueError): m = None
    if m and d.month != m and d.day == m and d.day <= 12:    # nhập nhầm ngày/tháng (VD 07/01 thay vì 01/07)
        d = d.replace(month=m, day=d.month)
    return d.strftime("%Y-%m-%d")

def main():
    src = find_src()
    if not src: print("feedback: không thấy file Phản hồi của KH.xlsx — bỏ qua"); return
    import warnings; warnings.filterwarnings("ignore")
    d = pd.read_excel(src[0], sheet_name="Phản hồi")
    d = d[d["Ngày"].notna() | d["Note"].notna()]
    rows = []
    for _, r in d.iterrows():
        note = redact(nfc(r.get("Note"))); cs = redact(nfc(r.get("Phản hồi của CS")))
        ds = parse_date(r.get("Ngày"), r.get("Tháng"))
        low = note.lower()
        tags = [t for t, p in TAGS if p != r"^$" and re.search(p, low)]
        if len(tags) > 1 and "Khen / không phản ánh" in tags: tags.remove("Khen / không phản ánh")   # có vấn đề khác thì không phải lời khen
        if note and len(note) < 60 and not tags: tags = ["Review ngắn, chưa rõ vấn đề"]
        if not note: sev = 0
        elif re.search(SEV3, low): sev = 3
        elif re.search(SEV1, low): sev = 1
        else: sev = 2
        rows.append({"d": ds or "", "m": (ds or "")[:7], "ch": nfc(r.get("Kênh tương tác")) or "(Chưa ghi)", "kho": nfc(r.get("Cửa hàng")),
                     "model": nfc(r.get("Model")), "ct": nfc(r.get("Content")) or "(Chưa phân loại)", "grp": nfc(r.get("Group")) or "(Chưa ghi)",
                     "st": nfc(r.get("Startus")), "note": note, "rep": cs, "cs": 1 if cs else 0, "tags": tags, "sev": sev})
    D = json.load(open(DASH, encoding="utf-8"))
    D["fb"] = {"rows": rows, "src": os.path.basename(src[0]), "tags": [t for t, _ in TAGS],
               "mtime": datetime.datetime.fromtimestamp(os.path.getmtime(src[0])).strftime("%Y-%m-%d %H:%M")}
    json.dump(D, open(DASH, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"feedback: {len(rows)} phản hồi, {sum(1 for r in rows if not r['tags'])} chưa gắn được vấn đề, {sum(r['cs'] for r in rows)} đã có phản hồi CS")

if __name__ == "__main__": main()
