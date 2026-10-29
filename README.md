# Báo cáo CSKH Mắt Việt

Dashboard báo cáo CSKH: **Phân tích KH 12M** (KH mới / Quay lại ≤12T / KH cũ >12T / Buyer), **Thẻ thành viên**, **Sinh nhật KH**, **Cửa hàng liên hệ KH sinh nhật**, **CTKM / AWO**, **Hàng hóa**, **XNBH** và **Phản hồi KH**. Giao diện theo Mắt Việt Design System. Bộ lọc: Kỳ (Tháng / Quý / Năm / MTD / YTD), Cửa hàng, Model.

| Thư mục | Nội dung |
|---|---|
| `report/` | `index.html` — trang báo cáo đầy đủ do script build ra; **không** publish trực tiếp, function đọc và lọc theo quyền |
| `site/` | Thư mục publish của Netlify (chỉ còn `robots.txt`; mọi đường dẫn được rewrite vào function) |
| `netlify/functions/app.mjs` | Đăng nhập, phân quyền, quản lý tài khoản (Netlify Blobs), trả trang báo cáo đã lọc |
| `src/` | `template.html` + `app.js` — giao diện, dùng để ghép lại `site/index.html` |
| `scripts/` | Script đọc file gốc trên OneDrive và dựng số liệu |
| `.work/` | Dữ liệu trung gian trên máy — **không** đưa lên GitHub / Netlify |

> Từ 29/10/2026 trang nằm sau đăng nhập (xem mục **Đăng nhập & phân quyền**). Bản HTML đầy đủ vẫn được chép sang OneDrive `Báo cáo/Dashboard CSKH`.

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

## XNBH (tab "XNBH")
- Nguồn: `BNR*.xlsx` đặt cùng cấp với thư mục repo (`C:\CRM\CRM\BNR T8.26.xlsx`), sheet `BNR`. File được `scan` theo dõi như các nguồn khác.
- `scripts/xnbh.py`: tổng hợp theo tháng × cửa hàng → khoá `xnbh` của `dash.json` (tự chạy trong bước `compute`). Chỉ ghi số tổng hợp, không đưa Mã KH (SĐT) vào dashboard.
- **Ngữ nghĩa cột XNBH đổi theo tháng** — script tự nhận diện và ghi vào `xnbh.mode`: `flag` (T8/2026: Yes/No = đã xác nhận bảo hành chưa) và `grant` (từ T9/2026: mọi dòng có SL KH đều Yes, dòng No là người trả lời NPS mà không nhận BNR). Vì vậy chỉ số chuyển đổi của tab dùng **NPS / KH nhận BNR**, so sánh được giữa mọi tháng.
- Tier / Khu vực / AM lấy theo giá trị xuất hiện nhiều nhất của từng cửa hàng trong file BNR (chống dòng điền sai).
- Tab có khung **Đọc nhanh** tự sinh từ số liệu (không viết tay): quy mô kỳ, so với tháng liền trước (hệ thống / AM / tier / nhóm địa lý, biên độ theo cửa hàng), trật tự tier, giả thuyết "khách quốc tế" (5 CH `X_INTL` trong `app.js`), AM cần lưu ý, cửa hàng dưới 25% hai tháng liên tiếp, XNBH lẻ và chất lượng dữ liệu. Nhóm địa lý là giả thuyết phân tích, chỉnh trong `X_INTL` / `X_NORTH`.
- Kỳ chọn chưa có file BNR (vd T10 khi file mới tới T9) thì tab tự hiện tháng gần nhất có dữ liệu và ghi rõ. `xnbh.bad[m]` = số dòng có Tier / Khu vực / AM lệch với chính CH đó (file nguồn điền sai).

## Phản hồi KH (tab "Phản hồi KH")
- Nguồn: OneDrive › Báo cáo › CS report › `Phản hồi của KH.xlsx` (sheet "Phản hồi"). Bước `scan` theo dõi file này (khoá `fb:`), bước `compute` chạy `scripts/feedback.py`.
- `feedback.py` gắn "vấn đề cụ thể" theo từ khoá (danh sách `TAGS`) và mức độ (Nghiêm trọng / Không hài lòng / Góp ý); che SĐT và tên KH trong nội dung, không đưa Mã KH / Tên KH lên trang.
- Khung "Nhận định & đề xuất" trong `src/template.html` là nhận xét viết tay theo dữ liệu đến 08/10/2026 — cập nhật lại khi cần.

## Hàng hóa (tab "Hàng hóa")
- Nguồn: cùng file dòng hàng `.work/ctkm/lines_<YYYY-MM>.csv` (từ T10/2025). `ctkm_extract.py` trích thêm cột `cat` (Nhóm category), `loai` (Loại hàng), `dvt` (ĐVT), `com` (Commodity — ERP phân loại bill: COMPLETE OPTICAL PAIR / LENS ONLY / FRAME ONLY / SUN ONLY / COMPLETE PAIR SUN / CONTACT LENSES ONLY / OTHERS).
- `scripts/hanghoa.py` (được `ctkm.py` gọi kèm ở cuối — đặt biến môi trường `SKIP_HH=1` nếu muốn bỏ; dùng chung quy tắc gán CTKM trong `scripts/ctkm_rules.py`) ghi khoá `hh` của `dash.json`: tháng × cửa hàng × hạng thẻ × CTKM × nhóm hàng (SL, NetSale, CK, bill) và tháng × cửa hàng × hạng thẻ × CTKM(bill) × loại giỏ hàng (bill, NetSale, CK, cặp tròng / gọng / kính mát), kèm top 12 "Loại hàng" mỗi nhóm.
- Quy ước: **bỏ dòng OTHERS 0đ** (và bill chỉ có các dòng đó); **SL tròng = số miếng ÷ 2** (cặp); CTKM của bill = chiến dịch có doanh số lớn nhất trong bill; chiến dịch ngoài top 45 gom vào "CTKM khác"; NetSale trước VAT như tab CTKM.
- Bộ lọc riêng của tab: CTKM (chiến dịch) và Hạng thẻ; bảng cuối đổi được chiều Cửa hàng / Model / Tier / AM.

## Đăng nhập & phân quyền (từ 29/10/2026)
- Mọi đường dẫn đi qua `netlify/functions/app.mjs` (rewrite trong `netlify.toml`): `/login`, `/logout`, `/password` (đổi mật khẩu), `/admin` (quản trị tài khoản), `/` (báo cáo). Trang báo cáo đầy đủ nằm ở `report/index.html` (đóng gói vào function qua `included_files`), server đọc file này, **lọc dữ liệu theo quyền** rồi mới trả về, nên người dùng không thể xem dữ liệu ngoài quyền bằng cách xem mã nguồn.
- Tài khoản lưu trong Netlify Blobs (store `cskh-auth`, khoá `users`): tên, email, mật khẩu (scrypt), quyền, cửa hàng. Phiên đăng nhập = cookie HttpOnly ký HMAC, 7 ngày; khoá ký tự sinh và lưu trong Blobs. Không cần biến môi trường.
- Quyền: **Quản trị (admin)** xem tất cả + tạo/xoá tài khoản; **Quản lý / Ops (manager)** xem mọi cửa hàng, chọn được cửa hàng & model, **không** có tab Hàng hóa và SMS/ZNS; **Cửa hàng (store)** chỉ nhận dữ liệu của đúng cửa hàng mình (server lọc mọi bảng có cột cửa hàng, bỏ các bảng toàn hệ thống như giới tính / độ tuổi / nguồn voucher), chỉ chọn được kỳ, không có tab Hàng hóa & SMS/ZNS.
- Tài khoản quản trị đầu tiên được tạo tự động từ `SEED_ADMIN` trong `app.mjs` (email matvietdesignteam@gmail.com); mật khẩu tạm ghi ở `.work/admin-first-login.txt` trên máy — đăng nhập xong đổi ngay tại `/password`.
- Mở `report/index.html` trực tiếp trên máy (hoặc bản OneDrive) thì không có `window.USER` → hiển thị đầy đủ như quản trị.
