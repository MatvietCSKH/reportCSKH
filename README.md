# Báo cáo CSKH Mắt Việt

Dashboard báo cáo CSKH: **Phân tích KH 12M** (KH mới / Quay lại ≤12T / KH cũ >12T / Buyer), **Thẻ thành viên**, **Sinh nhật KH** và **Cửa hàng liên hệ KH sinh nhật**. Giao diện theo Mắt Việt Design System. Bộ lọc: Kỳ (Tháng / Quý / Năm / MTD / YTD), Cửa hàng, Model.

| Thư mục | Nội dung |
|---|---|
| `site/` | Trang web deploy lên Netlify (`index.html` một file, đã chặn Google index) |
| `src/` | `template.html` + `app.js` — giao diện, dùng để ghép lại `site/index.html` |
| `scripts/` | Script đọc file gốc trên OneDrive và dựng số liệu |
| `.work/` | Dữ liệu trung gian trên máy — **không** đưa lên GitHub / Netlify |

> ⚠️ `site/index.html` có doanh số theo cửa hàng và tên nhân viên CH: ai có link Netlify đều xem được.

## Deploy Netlify
- Nối site Netlify với repo này: Netlify tự đọc `netlify.toml` (publish = `site`, không cần build).
- Hoặc kéo thả **thư mục `site/`** (không phải cả repo) vào app.netlify.com/drop.

## Cập nhật số liệu
`python scripts/update_dashboard.py all` — dò file mới trên OneDrive (BC21 `Data 2026`, `CT CRM.2023.xlsx`, `Store - Data CSKH/2024`), tính lại, ghi `site/index.html`, chép bản HTML sang OneDrive `Báo cáo/Dashboard CSKH`, rồi git commit. Tác vụ định kỳ chạy lúc 9h sáng mỗi ngày.

## Định nghĩa
- **Customer** = bill có SĐT; **Buyer** = bill khách lẻ (Mã KH = KL).
- **KH mới**: chưa từng mua (lịch sử từ 2018). **Quay lại ≤12T**: 2 đơn gần nhất cách ≤ 12 tháng. **KH cũ >12T**: cách > 12 tháng.
- **CR sinh nhật** = KH dùng voucher / KH được gửi. **CH liên hệ** = dòng có ghi NV / ngày / hình thức trong file CH.

## CTKM / AWO (tab "CTKM" và "CTKM AWO tại CH")
- `scripts/ctkm_extract.py`: trích các cột CTKM cấp dòng hàng từ file BC21 → `.work/ctkm/lines_<YYYY-MM>.csv` (tự chạy trong bước `extract`).
- `scripts/ctkm.py`: gán 1 CTKM/dòng hàng (MUĐ > Ontop tổng > Ontop > Combo > CSGG/Thẻ TV > Nguyên giá), tổng hợp theo ngày × cửa hàng và tháng × cửa hàng × CTKM, ghi vào khoá `ctkm` của `dash.json` (tự chạy trong bước `compute`).
- Nhóm CT AWO (Follow MV, CSKH sau mua, Đăng ký đo khám mắt, HSSV, Thu kính cũ, CP2, Bảo hành, Welcome, ZMA) nhận diện theo từ khoá trong tên CT — sửa danh sách `AWO` trong `ctkm.py` khi có CT mới. KPI % bill AWO: `awo_kpi` (mặc định 14).
