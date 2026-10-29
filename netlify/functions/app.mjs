// Báo cáo CSKH Mắt Việt — đăng nhập & phân quyền.
// Mọi đường dẫn của site đi qua function này (netlify.toml): /login, /logout, /admin, /password và / (trang báo cáo).
// Tài khoản lưu trong Netlify Blobs (store "cskh-auth", khoá "users"); mật khẩu băm scrypt; phiên = cookie HMAC 7 ngày.
// Quyền:  admin  = xem tất cả (kể cả tab Hàng hóa, SMS/ZNS) + quản lý tài khoản
//         manager = Ops: mọi cửa hàng, chọn được cửa hàng / model; KHÔNG có tab Hàng hóa, SMS/ZNS
//         store   = chỉ nhận dữ liệu của đúng cửa hàng mình (lọc ngay tại server), chỉ chọn được kỳ
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const SEED_ADMIN = { email: "truc.to@matkinh.com.vn", name: "Trúc Tô", role: "admin", store: "",
  salt: "6b319a8229e599022242d0e86ca48fd2", hash: "d7c50d5c218e8e1caf9a5fb6d1e4887bb75db05ccbd9122a592bbdd2c61161b9" };
const ROLES = { admin: "Quản trị", manager: "Quản lý (Ops)", store: "Cửa hàng" };
const COOKIE = "cskh_s", TTL = 7 * 24 * 3600;
const SYSTEM_ONLY = ["seg_demo_gt", "seg_demo_age", "ttv_gt", "ttv_age", "ttv_seg", "sn_gt", "sn_age", "sn_nguon", "sn_voucher", "sn_am", "tot_month"];
const KHO_LISTS = ["seg_month", "seg_store", "ttv_month", "ttv_store", "sn_month", "sn_store", "stores"];

/* ---------- lưu trữ ---------- */
const blobs = () => getStore({ name: "cskh-auth", consistency: "strong" });
async function loadUsers() {
  const s = blobs(); let u = await s.get("users", { type: "json" }); if (!Array.isArray(u)) u = [];
  // Tài khoản quản trị mặc định: tự thêm nếu chưa có; mật khẩu tạm trong code chỉ được áp lại khi chủ tài khoản CHƯA tự đổi mật khẩu
  const i = u.findIndex(x => x.email === SEED_ADMIN.email);
  if (i < 0) { u.push({ ...SEED_ADMIN, created: new Date().toISOString() }); await s.setJSON("users", u); }
  else if (!u[i].pwChanged && u[i].hash !== SEED_ADMIN.hash) { u[i] = { ...u[i], ...SEED_ADMIN }; await s.setJSON("users", u); }
  return u;
}
const saveUsers = u => blobs().setJSON("users", u);
async function secret() {
  const s = blobs(); let v = await s.get("secret");
  if (!v) { v = crypto.randomBytes(32).toString("hex"); await s.set("secret", v); }
  return v;
}
const hashPw = (pw, salt) => crypto.scryptSync(pw, Buffer.from(salt, "hex"), 32, { N: 16384, r: 8, p: 1 }).toString("hex");
const checkPw = (pw, u) => { const h = Buffer.from(hashPw(pw, u.salt)); const k = Buffer.from(u.hash); return h.length === k.length && crypto.timingSafeEqual(h, k); };

/* ---------- phiên ---------- */
async function sign(p) { const k = await secret(); const b = Buffer.from(JSON.stringify(p)).toString("base64url"); return b + "." + crypto.createHmac("sha256", k).update(b).digest("base64url"); }
async function verify(t) {
  if (!t) return null; const [b, m] = t.split("."); if (!b || !m) return null;
  const k = await secret(); const m2 = crypto.createHmac("sha256", k).update(b).digest("base64url");
  if (m2.length !== m.length || !crypto.timingSafeEqual(Buffer.from(m2), Buffer.from(m))) return null;
  try { const p = JSON.parse(Buffer.from(b, "base64url").toString()); return p.x > Date.now() / 1000 ? p : null; } catch { return null; }
}
const cookies = req => Object.fromEntries((req.headers.get("cookie") || "").split(/;\s*/).filter(Boolean).map(c => { const i = c.indexOf("="); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));
const setCookie = v => `${COOKIE}=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${v ? TTL : 0}`;
async function currentUser(req) {
  const p = await verify(cookies(req)[COOKIE]); if (!p) return null;
  const u = (await loadUsers()).find(x => x.email === p.e); if (!u) return null;       // tài khoản đã bị xoá
  return { email: u.email, name: u.name, role: u.role, store: u.store || "" };
}

/* ---------- báo cáo ---------- */
const OPEN = '<script id="data" type="application/json">';
let RPT = { mtime: 0 }, FCACHE = new Map();
function reportPath() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const p of [path.join(process.cwd(), "report", "index.html"), path.join(here, "..", "..", "report", "index.html"), path.join(here, "report", "index.html")])
    if (fs.existsSync(p)) return p;
  throw new Error("Không tìm thấy report/index.html trong gói function");
}
function loadReport() {
  const p = reportPath(), st = fs.statSync(p);
  if (st.mtimeMs !== RPT.mtime) {
    const html = fs.readFileSync(p, "utf8"); const i = html.indexOf(OPEN); const j = html.indexOf("</script>", i);
    RPT = { mtime: st.mtimeMs, pre: html.slice(0, i), json: html.slice(i + OPEN.length, j), tail: html.slice(j) }; FCACHE = new Map();
  }
  return RPT;
}
function filterData(D, user) {
  if (user.role === "admin") return D;
  delete D.hh; delete D.sms;
  if (user.role !== "store") return D;
  const kho = user.store, code = kho.slice(0, 3);
  for (const k of KHO_LISTS) if (Array.isArray(D[k])) D[k] = D[k].filter(r => r.kho === kho);
  for (const k of SYSTEM_ONLY) if (k in D) D[k] = [];
  for (const k of ["contact_month", "contact_method", "contact_staff"]) if (Array.isArray(D[k])) D[k] = D[k].filter(r => r.store === code);
  if (D.contact_meta) { D.contact_meta.stores = (D.contact_meta.stores || []).filter(s => s === code); D.contact_meta.missing_stores = (D.contact_meta.missing_stores || []).filter(s => s === code); }
  if (D.ctkm) { const K = D.ctkm, ki = K.kho.indexOf(kho); K.day = (K.day || []).filter(r => r[1] === ki); K.prog = (K.prog || []).filter(r => r[1] === ki); }
  if (D.xnbh) { D.xnbh.rows = (D.xnbh.rows || []).filter(r => r.kho === kho); D.xnbh.stores = kho in (D.xnbh.stores || {}) ? { [kho]: D.xnbh.stores[kho] } : {}; }
  if (D.fb) D.fb.rows = (D.fb.rows || []).filter(r => r.kho === kho);
  return D;
}
function reportJson(user) {
  const R = loadReport(); if (user.role === "admin") return R.json;
  const key = user.role + "|" + user.store; if (FCACHE.has(key)) return FCACHE.get(key);
  const out = JSON.stringify(filterData(JSON.parse(R.json), user)).replace(/<\/script/g, "<\\/script");
  if (FCACHE.size > 60) FCACHE.clear(); FCACHE.set(key, out); return out;
}
function storeList() {
  const D = JSON.parse(loadReport().json);
  return (D.stores || []).map(s => s.kho).filter(k => /^\d{3}-/.test(k)).sort();
}
function pageReport(req, user) {
  const R = loadReport();
  const userTag = `<script>window.USER=${JSON.stringify(user).replace(/</g, "\\u003c")};</script>\n`;
  const html = R.pre + userTag + OPEN + reportJson(user) + R.tail;
  const gz = /\bgzip\b/.test(req.headers.get("accept-encoding") || "");
  const body = gz ? zlib.gzipSync(Buffer.from(html, "utf8"), { level: 6 }) : Buffer.from(html, "utf8");
  return new Response(body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", ...(gz ? { "Content-Encoding": "gzip" } : {}), "Cache-Control": "private, no-store", "Vary": "Accept-Encoding" } });
}

/* ---------- giao diện các trang phụ ---------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const layout = (title, body, wide = false) => `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)} · Báo cáo CSKH Mắt Việt</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap">
<style>
:root{--navy:#1D285C;--deep:#011e60;--yellow:#FFCE07;--bg:#f4f5f9;--line:#dfe2ec;--fg:#011e60;--fg2:#3d4a7a;--fg3:#8384ae;--bad:#c8503a;--good:#1d8a5a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);font-family:Montserrat,system-ui,sans-serif;color:var(--fg);font-size:14px;line-height:1.5}
.wrap{max-width:${wide ? "1100px" : "440px"};margin:40px auto;padding:0 16px}
.band{background:var(--deep);color:#fff;border-radius:14px 14px 0 0;padding:22px 24px;position:relative;overflow:hidden}
.band::after{content:"";position:absolute;right:-60px;top:-70px;width:200px;height:200px;border-radius:50%;background:var(--yellow)}
.band h1{margin:0;font-size:20px;font-weight:800;position:relative;z-index:1}.band p{margin:4px 0 0;color:#c9cde3;font-size:12.5px;position:relative;z-index:1}
.card{background:#fff;border:1px solid var(--line);border-top:0;border-radius:0 0 14px 14px;padding:22px 24px;box-shadow:rgba(14,29,97,.07) 0 1px 3px}
label{display:block;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--fg3);margin:14px 0 4px}
input,select{width:100%;font:inherit;padding:9px 11px;border:1px solid #b9bdd1;border-radius:8px;background:#fff;color:var(--fg)}
button,.btn{font:inherit;font-weight:700;border:0;border-radius:999px;padding:10px 18px;cursor:pointer;background:var(--deep);color:#fff;text-decoration:none;display:inline-block}
button.y{background:var(--yellow);color:var(--deep)}button.sm{padding:5px 12px;font-size:12px}button.danger{background:#fff;color:var(--bad);border:1px solid var(--bad)}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:18px}
.msg{padding:10px 14px;border-radius:10px;margin:0 0 14px;font-weight:600}.msg.err{background:#fbe9e5;color:var(--bad)}.msg.ok{background:#e4f5ec;color:var(--good)}
table{border-collapse:collapse;width:100%;font-size:13px;margin-top:8px}th,td{padding:8px 9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
th{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--fg3)}
.tag{display:inline-block;font-size:11px;padding:2px 8px;border-radius:999px;background:#e7e9f0;color:var(--fg2);font-weight:600}
.tag.admin{background:var(--yellow);color:var(--deep)}.tag.manager{background:#dbe7ff}.tag.store{background:#e4f5ec;color:var(--good)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}@media(max-width:700px){.grid2{grid-template-columns:1fr}}
a{color:var(--fg2)}.top{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:12.5px;color:var(--fg3);margin-bottom:10px}
</style></head><body><div class="wrap">${body}</div></body></html>`;
const band = (t, s) => `<div class="band"><h1>${esc(t)}</h1><p>${esc(s)}</p></div>`;
const nav = u => `<div class="top"><span>Đang đăng nhập: <b>${esc(u.name)}</b> · ${ROLES[u.role] || u.role}${u.store ? " · " + esc(u.store) : ""}</span><span><a href="/">← Về báo cáo</a> · ${u.role === "admin" ? '<a href="/admin">Tài khoản</a> · ' : ""}<a href="/password">Đổi mật khẩu</a> · <a href="/logout">Đăng xuất</a></span></div>`;
const flash = (q) => (q.get("err") ? `<div class="msg err">${esc(q.get("err"))}</div>` : "") + (q.get("ok") ? `<div class="msg ok">${esc(q.get("ok"))}</div>` : "");

const pageLogin = (q) => layout("Đăng nhập", band("Báo cáo CSKH Mắt Việt", "Đăng nhập bằng tài khoản được cấp") + `<div class="card">${flash(q)}
<form method="post" action="/login"><label>Email</label><input name="email" type="email" autocomplete="username" required autofocus>
<label>Mật khẩu</label><input name="password" type="password" autocomplete="current-password" required>
<div class="row"><button class="y" type="submit">Đăng nhập</button></div></form>
<p style="color:var(--fg3);font-size:12px;margin:18px 0 0">Chưa có tài khoản hoặc quên mật khẩu: liên hệ bộ phận CSKH để được cấp lại.</p></div>`);

const pagePassword = (u, q) => layout("Đổi mật khẩu", nav(u) + band("Đổi mật khẩu", u.email) + `<div class="card">${flash(q)}
<form method="post" action="/password"><label>Mật khẩu hiện tại</label><input name="old" type="password" autocomplete="current-password" required>
<label>Mật khẩu mới (từ 8 ký tự)</label><input name="new1" type="password" autocomplete="new-password" minlength="8" required>
<label>Nhập lại mật khẩu mới</label><input name="new2" type="password" autocomplete="new-password" minlength="8" required>
<div class="row"><button class="y" type="submit">Lưu mật khẩu</button><a class="btn" href="/" style="background:#e7e9f0;color:var(--fg)">Huỷ</a></div></form></div>`);

function pageAdmin(u, users, q) {
  const stores = storeList();
  const rows = users.map(x => `<tr><td><b>${esc(x.name)}</b><br><span style="color:var(--fg3);font-size:12px">${esc(x.email)}</span></td><td><span class="tag ${x.role}">${ROLES[x.role] || x.role}</span></td><td>${esc(x.store || "—")}</td><td style="white-space:nowrap;color:var(--fg3);font-size:12px">${(x.created || "").slice(0, 10)}</td>
    <td style="text-align:right;white-space:nowrap"><form method="post" action="/admin" style="display:inline" onsubmit="return confirm('Xoá tài khoản ${esc(x.email)}?')"><input type="hidden" name="action" value="delete"><input type="hidden" name="email" value="${esc(x.email)}"><button class="sm danger" ${x.email === u.email ? "disabled title=\"Không xoá chính mình\"" : ""}>Xoá</button></form></td></tr>`).join("");
  return layout("Tài khoản", nav(u) + band("Quản lý tài khoản xem báo cáo", `${users.length} tài khoản · Quản lý (Ops) xem mọi cửa hàng, không có tab Hàng hóa & SMS/ZNS · Cửa hàng chỉ xem dữ liệu cửa hàng mình`) + `<div class="card">${flash(q)}
<h3 style="margin:0 0 4px">Tạo mới / cập nhật</h3><p style="margin:0;color:var(--fg3);font-size:12.5px">Nhập email đã có sẽ cập nhật tên, quyền, cửa hàng của tài khoản đó; để trống mật khẩu nếu không muốn đổi.</p>
<form method="post" action="/admin"><input type="hidden" name="action" value="save"><div class="grid2">
<div><label>Tên</label><input name="name" required maxlength="60" placeholder="VD: Nguyễn Văn A – CH Đồng Khởi"></div>
<div><label>Email (dùng để đăng nhập)</label><input name="email" type="email" required></div>
<div><label>Mật khẩu (từ 8 ký tự)</label><input name="password" type="text" minlength="8" autocomplete="off" placeholder="Bắt buộc khi tạo mới"></div>
<div><label>Phân quyền</label><select name="role" id="role" onchange="document.getElementById('storeWrap').style.display=this.value==='store'?'block':'none'"><option value="manager">Quản lý (Ops) – xem mọi cửa hàng</option><option value="store">Cửa hàng – chỉ xem 1 cửa hàng</option><option value="admin">Quản trị – xem tất cả & quản lý tài khoản</option></select></div>
<div id="storeWrap" style="display:none"><label>Cửa hàng</label><select name="store"><option value="">— chọn cửa hàng —</option>${stores.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("")}</select></div>
</div><div class="row"><button class="y" type="submit">Lưu tài khoản</button></div></form>
<h3 style="margin:26px 0 0">Danh sách tài khoản</h3>
<table><tr><th>Tên / email</th><th>Quyền</th><th>Cửa hàng</th><th>Tạo</th><th></th></tr>${rows}</table></div>`, true);
}

/* ---------- router ---------- */
const html = (b, status = 200, h = {}) => new Response(b, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...h } });
const redirect = (loc, h = {}) => new Response(null, { status: 303, headers: { Location: loc, "Cache-Control": "no-store", ...h } });
const back = (p, k, m) => redirect(`${p}?${k}=${encodeURIComponent(m)}`);

export default async (req) => {
  const url = new URL(req.url);
  let p = url.pathname.replace(/^\/\.netlify\/functions\/app/, "") || "/"; if (p.length > 1) p = p.replace(/\/+$/, "");
  const user = await currentUser(req);

  if (p === "/login") {
    if (req.method === "POST") {
      const f = await req.formData(); const email = String(f.get("email") || "").trim().toLowerCase(), pw = String(f.get("password") || "");
      const u = (await loadUsers()).find(x => x.email === email);
      if (!u || !checkPw(pw, u)) return back("/login", "err", "Email hoặc mật khẩu không đúng.");
      const tok = await sign({ e: u.email, x: Math.floor(Date.now() / 1000) + TTL });
      return redirect("/", { "Set-Cookie": setCookie(tok) });
    }
    return user ? redirect("/") : html(pageLogin(url.searchParams));
  }
  if (p === "/logout") return redirect("/login", { "Set-Cookie": setCookie("") });
  if (!user) return redirect("/login");

  if (p === "/password") {
    if (req.method === "POST") {
      const f = await req.formData(); const o = String(f.get("old") || ""), n1 = String(f.get("new1") || ""), n2 = String(f.get("new2") || "");
      const users = await loadUsers(); const u = users.find(x => x.email === user.email);
      if (!checkPw(o, u)) return back("/password", "err", "Mật khẩu hiện tại không đúng.");
      if (n1.length < 8 || n1 !== n2) return back("/password", "err", "Mật khẩu mới phải từ 8 ký tự và nhập lại trùng nhau.");
      u.salt = crypto.randomBytes(16).toString("hex"); u.hash = hashPw(n1, u.salt); u.pwChanged = true; await saveUsers(users);
      return back("/password", "ok", "Đã đổi mật khẩu.");
    }
    return html(pagePassword(user, url.searchParams));
  }
  if (p === "/admin") {
    if (user.role !== "admin") return redirect("/");
    const users = await loadUsers();
    if (req.method === "POST") {
      const f = await req.formData(); const act = f.get("action");
      if (act === "delete") {
        const email = String(f.get("email") || "").toLowerCase(); const i = users.findIndex(x => x.email === email);
        if (i < 0 || email === user.email) return back("/admin", "err", "Không xoá được tài khoản này.");
        users.splice(i, 1); await saveUsers(users); return back("/admin", "ok", `Đã xoá ${email}.`);
      }
      if (act === "save") {
        const name = String(f.get("name") || "").trim(), email = String(f.get("email") || "").trim().toLowerCase(), pw = String(f.get("password") || ""), role = String(f.get("role") || ""), store = String(f.get("store") || "");
        if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !ROLES[role]) return back("/admin", "err", "Thiếu tên, email hoặc phân quyền.");
        if (role === "store" && !storeList().includes(store)) return back("/admin", "err", "Tài khoản cửa hàng phải chọn đúng 1 cửa hàng.");
        let u = users.find(x => x.email === email);
        if (!u) { if (pw.length < 8) return back("/admin", "err", "Tạo mới cần mật khẩu từ 8 ký tự."); u = { email, created: new Date().toISOString() }; users.push(u); }
        else if (pw && pw.length < 8) return back("/admin", "err", "Mật khẩu mới phải từ 8 ký tự.");
        if (u.email === user.email && role !== "admin") return back("/admin", "err", "Không tự hạ quyền quản trị của chính mình.");
        Object.assign(u, { name, role, store: role === "store" ? store : "" });
        if (pw) { u.salt = crypto.randomBytes(16).toString("hex"); u.hash = hashPw(pw, u.salt); u.pwChanged = true; }
        await saveUsers(users); return back("/admin", "ok", `Đã lưu tài khoản ${email} (${ROLES[role]}${store ? " · " + store : ""}).`);
      }
      return back("/admin", "err", "Thao tác không hợp lệ.");
    }
    return html(pageAdmin(user, users, url.searchParams));
  }
  if (p === "/" || p === "/index.html") return pageReport(req, user);
  return redirect("/");
};
