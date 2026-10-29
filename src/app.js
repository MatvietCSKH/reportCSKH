const D = JSON.parse(document.getElementById('data').textContent);
const USER = window.USER || {role:'admin',name:'',store:''};   // do function đăng nhập chèn vào; mở file HTML trực tiếp = quyền đầy đủ
const ROLE_LBL = {admin:'Quản trị',manager:'Quản lý (Ops)',store:'Cửa hàng'};
const ALL_TABS = ['over','seg','ttv','sn','km','awo','hh','sms','xnbh','fb','case'];
// Mục được xem: admin = tất cả; tài khoản khác = danh sách USER.tabs do admin chọn (mặc định: tất cả trừ Hàng hóa & SMS/ZNS)
const ALLOWED_TABS = USER.role==='admin' ? ALL_TABS : (Array.isArray(USER.tabs) ? ['over',...USER.tabs] : ALL_TABS.filter(t=>!['hh','sms'].includes(t)));
const HIDDEN_TABS = ALL_TABS.filter(t=>!ALLOWED_TABS.includes(t));
const SEGS = ['1. KH mới','2. Quay lại ≤12T','3. KH cũ >12T','4. Buyer (khách lẻ)'];
const SEG_LBL = {'1. KH mới':'KH mới','2. Quay lại ≤12T':'Quay lại ≤12T','3. KH cũ >12T':'KH cũ >12T','4. Buyer (khách lẻ)':'Buyer (khách lẻ)'};
const CARDS = ['1. Diamond15','2. Platinum10','3. Gold7','4. Silver5','5. Member','6. Non-MB'];
const CARD_LBL = c => c.replace(/^\d\. /,'');
const MODELS = D.meta.models;
const MODEL_LBL = m => (m==='#N/A'||!m) ? '–' : m.replace(/^\d\. /,'');
const LAST = D.meta.months[D.meta.months.length-1];
const state = { ptype:'month', year:LAST.slice(0,4), month:parseInt(LAST.slice(5)), quarter:Math.ceil(parseInt(LAST.slice(5))/3), store:'', models:new Set(MODELS), view:'over' };
try { const s = JSON.parse(localStorage.getItem('cskh-dash')||'{}'); for (const k of ['ptype','year','month','quarter','store','view']) if (s[k]!==undefined) state[k]=s[k]; } catch(e){}
if (USER.role==='store'){ state.store = USER.store; state.models = new Set(MODELS); }      // cửa hàng: khoá đúng cửa hàng mình, không lọc model
if (HIDDEN_TABS.includes(state.view)) state.view='over';
const charts = {};

/* ---------- helpers ---------- */
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const SEG_COL = () => ({'1. KH mới':cssv('--s1'),'2. Quay lại ≤12T':cssv('--s3'),'3. KH cũ >12T':cssv('--s2'),'4. Buyer (khách lẻ)':cssv('--s4')});
const CARD_COL = () => ({'1. Diamond15':cssv('--t1'),'2. Platinum10':cssv('--t2'),'3. Gold7':cssv('--t3'),'4. Silver5':cssv('--t4'),'5. Member':cssv('--t5'),'6. Non-MB':cssv('--t6')});
const fmtN = n => Math.round(n).toLocaleString('vi-VN');
const fmtB = n => (n/1e6).toLocaleString('vi-VN',{maximumFractionDigits:0});   // triệu đồng
const fmtM = n => (n/1e6).toLocaleString('vi-VN',{maximumFractionDigits:1,minimumFractionDigits:1});   // triệu
const fmtP = (a,b) => b ? (100*a/b).toLocaleString('vi-VN',{maximumFractionDigits:1,minimumFractionDigits:1})+'%' : '–';
const pct = (a,b) => b ? 100*a/b : 0;
const mLbl = m => 'T'+parseInt(m.slice(5))+'/'+m.slice(2,4);
const mkey = (y,m) => y+'-'+String(m).padStart(2,'0');
function periodRange(){               // [from, to] inclusive, as 'YYYY-MM'
  const y=state.year, t=state.ptype;
  if (t==='all') return ['0000-00','9999-99'];
  if (t==='year') return [mkey(y,1), mkey(y,12)];
  if (t==='quarter') return [mkey(y,(state.quarter-1)*3+1), mkey(y,state.quarter*3)];
  if (t==='month') return [mkey(y,state.month), mkey(y,state.month)];
  if (t==='mtd') return [LAST, LAST];
  if (t==='ytd') return [LAST.slice(0,4)+'-01', LAST];
  return ['0000-00','9999-99'];
}
const inPeriod = m => { const [f,t]=periodRange(); return m>=f && m<=t; };
const inYear = inPeriod;   // legacy name: "in selected period"
const periodMonths = () => D.meta.months.filter(inPeriod);
function chartMonths(){               // single-month periods → trailing 12 months ending at that month
  const pm=periodMonths(); if (!pm.length) return pm;
  if (state.ptype==='month'||state.ptype==='mtd'){ const i=D.meta.months.indexOf(pm[0]); return D.meta.months.slice(Math.max(0,i-11), i+1); }
  return pm;
}
const inChart = (()=>{ let set=null, key=''; return m => { const k=JSON.stringify([state.ptype,state.year,state.month,state.quarter]); if(k!==key){ key=k; set=new Set(chartMonths()); } return set.has(m); }; })();
const months = chartMonths;
const storeCode = kho => (kho||'').slice(0,3);
const okStore = r => !state.store || ('kho' in r ? r.kho===state.store : ('store' in r ? r.store===storeCode(state.store) : true));
const okModel = r => (!('model' in r) || state.models.has(r.model)) && okStore(r);
const yearsSel = (minY) => state.ptype==='all' ? [2024,2025,2026].filter(y=>y>=minY) : [parseInt((state.ptype==='mtd'||state.ptype==='ytd')?LAST.slice(0,4):state.year)].filter(y=>y>=minY);
function periodLabel(){ const y=state.year, t=state.ptype; if(t==='month') return 'T'+state.month+'/'+y; if(t==='quarter') return 'Q'+state.quarter+'/'+y; if(t==='year') return 'Năm '+y; if(t==='mtd') return 'MTD · '+mLbl(LAST); if(t==='ytd') return 'YTD · '+LAST.slice(0,4)+' (T1–'+parseInt(LAST.slice(5))+')'; return 'Toàn bộ 2022–2026'; }
function group(rows, keyFn, filt=()=>true){
  const o = {};
  for (const r of rows){ if(!filt(r)||!okModel(r)) continue; const k=keyFn(r); const g=o[k]||(o[k]={bills:0,cust:0,rev:0,sent:0,redeemed:0});
    g.bills+=r.bills||0; g.cust+=r.cust||0; g.rev+=r.rev||0; g.sent+=r.sent||0; g.redeemed+=r.redeemed||0; }
  return o;
}
const sum = (o,f) => Object.values(o).reduce((a,g)=>a+g[f],0);
const el = id => document.getElementById(id);
function kpi(l,v,d,col,hero){ return `<div class="kpi${hero?' hero':''}"><div class="l">${col?`<span class="sw" style="background:${col}"></span>`:''}${l}</div><div class="v">${v}</div>${d?`<div class="d">${d}</div>`:''}</div>`; }
function legend(id, items){ el(id).innerHTML = items.map(([l,c])=>`<span><i style="background:${c}"></i>${l}</span>`).join(''); }
function table(id, head, rows, tot){
  const h = '<tr>'+head.map(x=>`<th>${x}</th>`).join('')+'</tr>';
  const b = rows.map(r=>'<tr>'+r.map(x=>`<td>${x}</td>`).join('')+'</tr>').join('');
  const t = tot ? '<tr class="tot">'+tot.map(x=>`<td>${x}</td>`).join('')+'</tr>' : '';
  el(id).innerHTML = rows.length ? `<table>${h}${b}${t}</table>` : '<div class="empty">Không có dữ liệu cho kỳ này</div>';
}
function bar(v,max){ return v+`<span class="pbar" style="width:${max?Math.round(60*v/max):0}px"></span>`; }

/* ---------- chart base ---------- */
if (window.ChartDataLabels) Chart.register(ChartDataLabels);
const cmp = v => v==null?'':(Math.abs(v)>=1e6?(v/1e6).toLocaleString('vi-VN',{maximumFractionDigits:1})+'M':Math.abs(v)>=1e4?(v/1e3).toLocaleString('vi-VN',{maximumFractionDigits:0})+'K':v.toLocaleString('vi-VN',{maximumFractionDigits:1}));
const TOTALS = {};
const totalsPlugin = {id:'stackTotals', afterDatasetsDraw(c){ const o=TOTALS[c.canvas.id]; if(!o) return; const ctx=c.ctx; const x=c.scales.x, y=c.scales.y; const horiz=c.options.indexAxis==='y';
  const n=c.data.labels.length; ctx.save(); ctx.font='600 11px '+cssv('--font-body'); ctx.fillStyle=cssv('--fg-2'); ctx.textAlign=horiz?'left':'center'; ctx.textBaseline=horiz?'middle':'bottom';
  for(let i=0;i<n;i++){ let t=0; c.data.datasets.forEach((d,di)=>{ if(c.isDatasetVisible(di)) t+=(+d.data[i]||0); }); if(!t) continue;
    if(horiz){ ctx.fillText(o.fmt(t), x.getPixelForValue(t)+4, y.getPixelForValue(i)); } else { ctx.fillText(o.fmt(t), x.getPixelForValue(i), y.getPixelForValue(t)-3); } }
  ctx.restore(); }};
Chart.register(totalsPlugin);
function mk(id, cfg){
  if (charts[id]) charts[id].destroy();
  const fg2 = cssv('--fg-2'), line = cssv('--line');
  Chart.defaults.font.family = cssv('--font-body'); Chart.defaults.font.size = 11.5; Chart.defaults.color = fg2;
  cfg.options = cfg.options || {};
  cfg.options.layout = Object.assign({padding:{top:14,right:(cfg.options.indexAxis==='y'?36:8)}}, cfg.options.layout||{}); cfg.options.maintainAspectRatio = false; cfg.options.responsive = true; cfg.options.animation = false;
  cfg.options.interaction = cfg.options.interaction || {mode:'index', intersect:false};
  cfg.options.plugins = Object.assign({legend:{display:false}, datalabels:{display:false}, stackTotals:{display:false}, tooltip:{backgroundColor:cssv('--surface'), titleColor:cssv('--fg'), bodyColor:fg2, borderColor:line, borderWidth:1, padding:10, boxPadding:4}}, cfg.options.plugins||{});
  const L = LABELS[id]; delete TOTALS[id]; if (L){ const o=typeof L==='function'?L():L; if (o.stackTotals){ TOTALS[id]=o.stackTotals; delete o.stackTotals; } Object.assign(cfg.options.plugins, o); }
  if (cfg.type!=='doughnut'){
    const sc = cfg.options.scales || {};
    for (const k of Object.keys(sc)){ sc[k].grid = Object.assign({color:line, lineWidth:1, drawTicks:false}, sc[k].grid||{}); sc[k].border = Object.assign({display:false}, sc[k].border||{}); sc[k].ticks = Object.assign({color:fg2, padding:6}, sc[k].ticks||{}); }
    if (sc.x) sc.x.grid.display = sc.x.grid.display ?? false;
    cfg.options.scales = sc;
  }
  charts[id] = new Chart(el(id), cfg); return charts[id];
}
const barDs = (label,data,color,extra={}) => Object.assign({type:'bar',label,data,backgroundColor:color,borderColor:cssv('--surface'),borderWidth:{top:1.5,bottom:0,left:0,right:0},borderRadius:3,borderSkipped:false,maxBarThickness:44},extra);
const lineDs = (label,data,color,extra={}) => Object.assign({type:'line',label,data,borderColor:color,backgroundColor:color,borderWidth:2,pointRadius:3,pointHoverRadius:5,pointBorderColor:cssv('--surface'),pointBorderWidth:2,tension:.25,fill:false},extra);
function inkOn(bg){ try{ let c=String(bg).trim(); if(c.startsWith('#')){ if(c.length===4) c='#'+[...c.slice(1)].map(x=>x+x).join(''); const r=parseInt(c.slice(1,3),16)/255,g=parseInt(c.slice(3,5),16)/255,b=parseInt(c.slice(5,7),16)/255; const L=x=>x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4); const lum=.2126*L(r)+.7152*L(g)+.0722*L(b); return lum>.36?'#011e60':'#ffffff'; } }catch(e){} return '#ffffff'; }
const bgOf = c => { const b=c.dataset.backgroundColor; return Array.isArray(b)? b[c.dataIndex] : b; };
const DL = {
  bar: (fmt,opt={}) => Object.assign({display:true, anchor:'end', align:'end', offset:-2, color:cssv('--fg-2'), font:{size:10.5,weight:'600'}, formatter:fmt, clamp:true}, opt),
  inside: (fmt,minShare=.12) => ({display:(c)=>{const ds=c.chart.data.datasets; let t=0; ds.forEach((d,i)=>{ if(c.chart.isDatasetVisible(i)) t+=(+d.data[c.dataIndex]||0);}); const v=+c.dataset.data[c.dataIndex]||0; return t&&v/t>=minShare;}, anchor:'center', align:'center', color:(c)=>inkOn(bgOf(c)), font:{size:9.5,weight:'600'}, formatter:fmt, textStrokeColor:'rgba(0,0,0,.25)', textStrokeWidth:0}),
  line: (fmt,opt={}) => Object.assign({display:true, align:'top', offset:4, color:cssv('--fg-2'), font:{size:10,weight:'600'}, formatter:fmt, clamp:true, backgroundColor:cssv('--surface'), borderRadius:3, padding:{top:1,bottom:0,left:3,right:3}}, opt),
  pie: (tot) => ({display:(c)=>c.dataset.data[c.dataIndex]/tot>=.06, color:(c)=>inkOn(bgOf(c)), font:{size:11,weight:'700'}, formatter:(v)=>fmtP(v,tot)}),
};
const stackTot = fmt => ({display:true, fmt});
const f1 = v => (+v).toLocaleString('vi-VN',{maximumFractionDigits:1,minimumFractionDigits:1});
const fP = v => Math.round(v)+'%';
const fP1 = v => (+v).toLocaleString('vi-VN',{maximumFractionDigits:1})+'%';
const LABELS = {
  'c-over-rev':  () => ({stackTotals:stackTot(fmtN), datalabels:DL.inside(fmtN)}),
  'c-over-bills':() => ({datalabels:DL.line(cmp)}),
  'c-over-cr':   () => ({datalabels:DL.line(fP1)}),
  'c-seg-month': () => ({stackTotals:stackTot(cmp), datalabels:DL.inside(cmp)}),
  'c-seg-pct':   () => ({datalabels:DL.inside(fP,.08)}),
  'c-seg-atv':   () => ({datalabels:DL.line(f1)}),
  'c-seg-gt':    () => ({stackTotals:stackTot(cmp), datalabels:DL.inside(cmp,.1)}),
  'c-seg-age':   () => ({stackTotals:stackTot(cmp), datalabels:DL.inside(cmp,.12)}),
  'c-ttv-month': () => ({stackTotals:stackTot(fmtN), datalabels:DL.inside(fmtN,.15)}),
  'c-ttv-cust':  () => ({stackTotals:stackTot(cmp), datalabels:DL.inside(cmp,.15)}),
  'c-ttv-atv':   () => ({datalabels:DL.bar(f1)}),
  'c-ttv-gt':    () => ({datalabels:DL.inside(fP,.08)}),
  'c-ttv-age':   () => ({datalabels:DL.inside(fP,.09)}),
  'c-sn-month':  () => ({datalabels:DL.bar(cmp,{rotation:-90,align:'end',anchor:'end',offset:2,font:{size:9.5,weight:'600'}})}),
  'c-sn-cr':     () => ({datalabels:DL.line(fP1)}),
  'c-sn-rev':    () => ({datalabels:DL.bar(cmp)}),
  'c-sn-model':  () => ({datalabels:DL.bar(fP1)}),
  'c-sn-gt':     () => ({datalabels:DL.bar(cmp)}),
  'c-sn-age':    () => ({datalabels:DL.bar(cmp)}),
  'c-ct-pct':    () => ({datalabels:DL.line(fP)}),
  'c-ct-cr':     () => ({datalabels:DL.line(fP1,{align:'top'})}),
  'c-xn-month':  () => ({datalabels:{                       // cột: số KH · đường: %
      display:true, clamp:true,
      formatter:(v,c)=> c.dataset.type==='line' ? fP1(v) : fmtN(v),
      anchor:(c)=> c.dataset.type==='line' ? 'center' : 'end',
      align:(c)=>  c.dataset.type==='line' ? 'top' : 'end',
      offset:(c)=> c.dataset.type==='line' ? 5 : -2,
      color:(c)=>  c.dataset.type==='line' ? cssv('--accent') : cssv('--fg-2'),
      backgroundColor:(c)=> c.dataset.type==='line' ? cssv('--surface') : null,
      borderRadius:3, padding:{top:1,bottom:0,left:3,right:3},
      font:{size:10.5,weight:'700'}}}),
  'c-xn-pie':    () => ({datalabels:{                       // số lượt + tỷ trọng trong vành
      display:(c)=>{const t=c.dataset.data.reduce((a,b)=>a+(+b||0),0); return t && (+c.dataset.data[c.dataIndex]||0)/t>=.05;},
      color:(c)=>inkOn(bgOf(c)), font:{size:11,weight:'700'}, textAlign:'center',
      formatter:(v,c)=>{const t=c.dataset.data.reduce((a,b)=>a+(+b||0),0); return [fmtN(v), fmtP(v,t)];}}}),
  'c-xn-am':     () => ({datalabels:DL.bar(fP1)}),
  'c-case-month':() => ({stackTotals:stackTot(fmtN), datalabels:DL.inside(fmtN,.15)}),
  'c-case-group':() => ({stackTotals:stackTot(fmtN), datalabels:DL.inside(fmtN,.2)}),
  'c-xn-tier':   () => ({datalabels:DL.bar(fP1)}),
};
const ttB = {callbacks:{label:c=>` ${c.dataset.label}: ${fmtN(c.parsed.y)} tr`}};
const ttM = {callbacks:{label:c=>` ${c.dataset.label}: ${fmtM(c.parsed.y)} tr`}};
const ttN = {callbacks:{label:c=>` ${c.dataset.label}: ${fmtN(c.parsed.y)}`}};
const ttP = {callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.y.toLocaleString('vi-VN',{maximumFractionDigits:1})}%`}};
const ttNx = {callbacks:{label:c=>` ${c.dataset.label}: ${fmtN(c.parsed.x)}`}};

/* ---------- derived series ---------- */
function segByMonth(){ const ms=months(), pm=periodMonths(); const g=group(D.seg_month, r=>r.month+'|'+r.seg, r=>inChart(r.month)); return {ms, pm, get:(m,s)=>g[m+'|'+s]||{bills:0,cust:0,rev:0}}; }
function cardByMonth(){ const ms=months(), pm=periodMonths(); const g=group(D.ttv_month, r=>r.month+'|'+r.card, r=>inChart(r.month)); return {ms, pm, get:(m,c)=>g[m+'|'+c]||{bills:0,cust:0,rev:0}}; }
function snByMonth(){ const ms=months().filter(m=>m>='2023-01'), pm=periodMonths().filter(m=>m>='2023-01'); const g=group(D.sn_month, r=>r.month, r=>inChart(r.month)); return {ms, pm, get:m=>g[m]||{sent:0,redeemed:0,rev:0}}; }
const segCnt = (g,s) => s==='4. Buyer (khách lẻ)' ? g.bills : g.cust;   // Buyer: no identity → count bills

/* ================= TỔNG QUAN ================= */
function renderOver(){
  const SC=SEG_COL(), {ms,pm,get}=segByMonth();
  const tot={bills:0,cust:0,rev:0}, bySeg={}; SEGS.forEach(s=>bySeg[s]={n:0,rev:0});
  for (const m of pm) for (const s of SEGS){ const g=get(m,s); tot.bills+=g.bills; tot.rev+=g.rev; bySeg[s].n+=segCnt(g,s); bySeg[s].rev+=g.rev; if(s!=='4. Buyer (khách lẻ)') tot.cust+=g.cust; }
  const cm=cardByMonth(); let mbRev=0; for (const m of pm) for (const c of CARDS) if(c!=='6. Non-MB') mbRev+=cm.get(m,c).rev;
  const sn=snByMonth(); let sent=0,red=0; for (const m of sn.pm){ const g=sn.get(m); sent+=g.sent; red+=g.redeemed; }
  const custTot = tot.cust;
  el('over-kpis').innerHTML = [
    kpi('Tổng doanh số', fmtB(tot.rev)+' <small style="font-size:14px;color:var(--fg-3)">tr</small>', fmtN(tot.bills)+' bill · '+periodLabel(), null, true),
    kpi('Khách hàng (Customer)', fmtN(custTot), 'có định danh SĐT, cộng dồn theo tháng'),
    kpi('KH mới', fmtN(bySeg['1. KH mới'].n), fmtP(bySeg['1. KH mới'].n,custTot)+' Customer', SC['1. KH mới']),
    kpi('Quay lại ≤12T', fmtN(bySeg['2. Quay lại ≤12T'].n), fmtP(bySeg['2. Quay lại ≤12T'].n,custTot)+' Customer', SC['2. Quay lại ≤12T']),
    kpi('KH cũ >12T', fmtN(bySeg['3. KH cũ >12T'].n), fmtP(bySeg['3. KH cũ >12T'].n,custTot)+' Customer', SC['3. KH cũ >12T']),
    kpi('Buyer (khách lẻ)', fmtN(bySeg['4. Buyer (khách lẻ)'].n)+' <small style="font-size:13px;color:var(--fg-3)">bill</small>', fmtP(bySeg['4. Buyer (khách lẻ)'].rev,tot.rev)+' doanh số', SC['4. Buyer (khách lẻ)']),
    kpi('Doanh số thẻ thành viên', fmtP(mbRev,tot.rev), fmtB(mbRev)+'  tr (Diamond → Member)'),
    kpi('CR voucher sinh nhật', fmtP(red,sent), fmtN(red)+' KH dùng / '+fmtN(sent)+' gửi'),
  ].join('');
  const lbl = ms.map(mLbl);
  mk('c-over-rev',{type:'bar',data:{labels:lbl,datasets:SEGS.map(s=>barDs(SEG_LBL[s],ms.map(m=>get(m,s).rev/1e6),SC[s],{stack:'a'}))},
    options:{plugins:{tooltip:ttB},scales:{x:{stacked:true},y:{stacked:true,ticks:{callback:v=>fmtN(v)+' tr'}}}}});
  const vals=SEGS.map(s=>bySeg[s].rev);
  mk('c-over-segpie',{type:'doughnut',data:{labels:SEGS.map(s=>SEG_LBL[s]),datasets:[{data:vals,backgroundColor:SEGS.map(s=>SC[s]),borderColor:cssv('--surface'),borderWidth:2,hoverOffset:4}]},
    options:{cutout:'58%',plugins:{datalabels:DL.pie(tot.rev),tooltip:{callbacks:{label:c=>` ${c.label}: ${fmtB(c.parsed)}  tr (${fmtP(c.parsed,tot.rev)})`}}}}});
  legend('lg-over-segpie', SEGS.map(s=>[SEG_LBL[s]+' '+fmtP(bySeg[s].rev,tot.rev),SC[s]]));
  mk('c-over-bills',{type:'line',data:{labels:lbl,datasets:[lineDs('Số bill',ms.map(m=>SEGS.reduce((a,s)=>a+get(m,s).bills,0)),cssv('--accent'),{fill:true,backgroundColor:cssv('--accent')+'1a'})]},
    options:{plugins:{tooltip:ttN},scales:{x:{},y:{beginAtZero:true,ticks:{callback:v=>fmtN(v)}}}}});
  mk('c-over-cr',{type:'line',data:{labels:sn.ms.map(mLbl),datasets:[lineDs('CR',sn.ms.map(m=>{const g=sn.get(m);return pct(g.redeemed,g.sent);}),cssv('--s3'))]},
    options:{plugins:{tooltip:ttP},scales:{x:{},y:{beginAtZero:true,ticks:{callback:v=>v+'%'}}}}});
}

/* ================= PHÂN TÍCH KH 12M ================= */
function renderSeg(){
  const SC=SEG_COL(), {ms,pm,get}=segByMonth(), lbl=ms.map(mLbl);
  const agg={}; SEGS.forEach(s=>agg[s]={n:0,rev:0,bills:0});
  for (const m of pm) for (const s of SEGS){ const g=get(m,s); agg[s].n+=segCnt(g,s); agg[s].rev+=g.rev; agg[s].bills+=g.bills; }
  const aggC={}; SEGS.forEach(s=>aggC[s]={n:0,rev:0}); for (const m of ms) for (const s of SEGS){ const g=get(m,s); aggC[s].n+=segCnt(g,s); aggC[s].rev+=g.rev; }
  const custC=SEGS.slice(0,3).reduce((a,s)=>a+aggC[s].n,0), revC=SEGS.reduce((a,s)=>a+aggC[s].rev,0);
  const custTot = SEGS.slice(0,3).reduce((a,s)=>a+agg[s].n,0), revTot=SEGS.reduce((a,s)=>a+agg[s].rev,0);
  el('seg-kpis').innerHTML = SEGS.map(s=>{
    const a=agg[s], isB=s==='4. Buyer (khách lẻ)';
    return kpi(SEG_LBL[s], fmtN(a.n)+(isB?' <small style="font-size:13px;color:var(--fg-3)">bill</small>':''), (isB?fmtP(a.rev,revTot)+' doanh số':fmtP(a.n,custTot)+' Customer')+' · '+fmtB(a.rev)+' tr · ATV '+fmtM(a.n?a.rev/a.n:0)+' tr', SC[s]);
  }).join('') + kpi('Tổng Customer', fmtN(custTot), 'KH cũ (quay lại + >12T) '+fmtP(agg['2. Quay lại ≤12T'].n+agg['3. KH cũ >12T'].n,custTot));
  mk('c-seg-month',{type:'bar',data:{labels:lbl,datasets:SEGS.map(s=>barDs(SEG_LBL[s],ms.map(m=>segCnt(get(m,s),s)),SC[s],{stack:'a'}))},
    options:{plugins:{tooltip:ttN},scales:{x:{stacked:true},y:{stacked:true,ticks:{callback:v=>fmtN(v)}}}}});
  legend('lg-seg', SEGS.map(s=>[SEG_LBL[s],SC[s]]));
  const newRev=agg['1. KH mới'].rev, oldRev=agg['2. Quay lại ≤12T'].rev+agg['3. KH cũ >12T'].rev, buyRev=agg['4. Buyer (khách lẻ)'].rev;
  mk('c-seg-pie',{type:'doughnut',data:{labels:['KH mới','KH cũ','Buyer'],datasets:[{data:[newRev,oldRev,buyRev],backgroundColor:[SC['1. KH mới'],SC['2. Quay lại ≤12T'],SC['4. Buyer (khách lẻ)']],borderColor:cssv('--surface'),borderWidth:2}]},
    options:{cutout:'58%',plugins:{datalabels:DL.pie(revTot),tooltip:{callbacks:{label:c=>` ${c.label}: ${fmtB(c.parsed)}  tr (${fmtP(c.parsed,revTot)})`}}}}});
  legend('lg-seg-pie',[['KH mới '+fmtP(newRev,revTot),SC['1. KH mới']],['KH cũ '+fmtP(oldRev,revTot),SC['2. Quay lại ≤12T']],['Buyer '+fmtP(buyRev,revTot),SC['4. Buyer (khách lẻ)']]]);
  const S3=SEGS.slice(0,3);
  mk('c-seg-pct',{type:'bar',data:{labels:lbl,datasets:S3.map(s=>barDs(SEG_LBL[s],ms.map(m=>{const t=S3.reduce((a,x)=>a+get(m,x).cust,0);return pct(get(m,s).cust,t);}),SC[s],{stack:'a'}))},
    options:{plugins:{tooltip:ttP},scales:{x:{stacked:true},y:{stacked:true,max:100,ticks:{callback:v=>v+'%'}}}}});
  mk('c-seg-atv',{type:'line',data:{labels:lbl,datasets:SEGS.map(s=>lineDs(SEG_LBL[s],ms.map(m=>{const g=get(m,s);const n=segCnt(g,s);return n?g.rev/n/1e6:null;}),SC[s]))},
    options:{plugins:{tooltip:ttM},scales:{x:{},y:{beginAtZero:true,ticks:{callback:v=>v+' tr'}}}}});
  // demographics (year-level, ≥2025, no model filter)
  const ys=yearsSel(2025);
  const gg=group(D.seg_demo_gt, r=>r.seg+'|'+r.gt, r=>ys.includes(r.year)); const GT=['Nữ','Nam','Khác'];
  mk('c-seg-gt',{type:'bar',data:{labels:S3.map(s=>SEG_LBL[s]),datasets:GT.map((g,i)=>barDs(g,S3.map(s=>(gg[s+'|'+g]||{cust:0}).cust),[cssv('--s5'),cssv('--s1'),cssv('--t6')][i],{stack:'a'}))},
    options:{indexAxis:'y',plugins:{legend:{display:true,position:'bottom'},tooltip:ttNx},scales:{x:{stacked:true,ticks:{callback:v=>fmtN(v)}},y:{stacked:true}}}});
  const ga=group(D.seg_demo_age, r=>r.seg+'|'+r.age, r=>ys.includes(r.year)); const AGES=[...new Set(D.seg_demo_age.map(r=>r.age))].sort();
  const ageRamp=[cssv('--t5'),cssv('--t4'),cssv('--t3'),cssv('--t2'),cssv('--t1'),cssv('--s7'),cssv('--s2'),cssv('--t6')];
  mk('c-seg-age',{type:'bar',data:{labels:S3.map(s=>SEG_LBL[s]),datasets:AGES.map((a,i)=>barDs(a.replace(/^\d\. /,''),S3.map(s=>(ga[s+'|'+a]||{cust:0}).cust),ageRamp[i%ageRamp.length],{stack:'a'}))},
    options:{indexAxis:'y',plugins:{legend:{display:true,position:'bottom'},tooltip:ttNx},scales:{x:{stacked:true,ticks:{callback:v=>fmtN(v)}},y:{stacked:true}}}});
  // tables
  table('t-seg-month',['Tháng',...SEGS.flatMap(s=>[SEG_LBL[s],'DS','ATV']),'Tổng DS','% KH mới'],
    ms.map(m=>{ const row=[mLbl(m)]; let t=0,c=0; SEGS.forEach(s=>{const g=get(m,s);const n=segCnt(g,s);row.push(fmtN(n),fmtB(g.rev),fmtM(n?g.rev/n:0)); t+=g.rev; if(s!=='4. Buyer (khách lẻ)') c+=g.cust;}); row.push(fmtB(t),fmtP(get(m,'1. KH mới').cust,c)); return row; }),
    ['Tổng '+ms.length+' tháng',...SEGS.flatMap(s=>[fmtN(aggC[s].n),fmtB(aggC[s].rev),fmtM(aggC[s].n?aggC[s].rev/aggC[s].n:0)]),fmtB(revC),fmtP(aggC['1. KH mới'].n,custC)]);
  const st=group(D.seg_month, r=>r.kho+'|'+r.seg, r=>inPeriod(r.month)); const stores={};
  for (const k in st){ const [kho,s]=k.split('|'); const o=stores[kho]||(stores[kho]={rev:0}); o[s]=st[k]; o.rev+=st[k].rev; }
  const srows=Object.entries(stores).sort((a,b)=>b[1].rev-a[1].rev); const smax=srows.length?srows[0][1].rev:0;
  const sm={}; D.stores.forEach(s=>sm[s.kho]=s);
  table('t-seg-store',['Cửa hàng','Model','AM',...SEGS.map(s=>SEG_LBL[s]),'% KH mới','Doanh số (tr)'],
    srows.map(([kho,o])=>{ const c=S3.reduce((a,s)=>a+((o[s]||{}).cust||0),0); return [kho,MODEL_LBL((sm[kho]||{}).model||''),(sm[kho]||{}).am||'',...SEGS.map(s=>fmtN(segCnt(o[s]||{bills:0,cust:0},s))),fmtP(((o['1. KH mới']||{}).cust||0),c),bar(fmtB(o.rev),smax)]; }));
}

/* ================= THẺ THÀNH VIÊN ================= */
function renderTTV(){
  const CC=CARD_COL(), {ms,pm,get}=cardByMonth(), lbl=ms.map(mLbl);
  const agg={}; CARDS.forEach(c=>agg[c]={cust:0,rev:0,bills:0});
  for (const m of pm) for (const c of CARDS){ const g=get(m,c); agg[c].cust+=g.cust; agg[c].rev+=g.rev; agg[c].bills+=g.bills; }
  const revTot=CARDS.reduce((a,c)=>a+agg[c].rev,0), mbRev=revTot-agg['6. Non-MB'].rev, custTot=CARDS.reduce((a,c)=>a+agg[c].cust,0), mbCust=custTot-agg['6. Non-MB'].cust;
  el('ttv-kpis').innerHTML = [
    kpi('Doanh số thẻ thành viên', fmtB(mbRev)+' <small style="font-size:14px;color:var(--fg-3)">tr</small>', fmtP(mbRev,revTot)+' tổng doanh số', null, true),
    kpi('KH có thẻ', fmtN(mbCust), fmtP(mbCust,custTot)+' Customer · ATV '+fmtM(mbCust?mbRev/mbCust:0)+' tr'),
    ...CARDS.slice(0,5).map(c=>kpi(CARD_LBL(c), fmtN(agg[c].cust), fmtB(agg[c].rev)+' tr · ATV '+fmtM(agg[c].cust?agg[c].rev/agg[c].cust:0)+' tr', CC[c])),
    kpi('Non-member', fmtN(agg['6. Non-MB'].cust), fmtB(agg['6. Non-MB'].rev)+' tr · ATV '+fmtM(agg['6. Non-MB'].cust?agg['6. Non-MB'].rev/agg['6. Non-MB'].cust:0)+' tr', CC['6. Non-MB']),
  ].join('');
  const MB=CARDS.slice(0,5);
  mk('c-ttv-month',{type:'bar',data:{labels:lbl,datasets:MB.map(c=>barDs(CARD_LBL(c),ms.map(m=>get(m,c).rev/1e6),CC[c],{stack:'a'}))},
    options:{plugins:{tooltip:ttB},scales:{x:{stacked:true},y:{stacked:true,ticks:{callback:v=>fmtN(v)+' tr'}}}}});
  legend('lg-ttv', MB.map(c=>[CARD_LBL(c),CC[c]]));
  mk('c-ttv-pie',{type:'doughnut',data:{labels:['Member','Non-member'],datasets:[{data:[mbRev,agg['6. Non-MB'].rev],backgroundColor:[cssv('--t2'),cssv('--t6')],borderColor:cssv('--surface'),borderWidth:2}]},
    options:{cutout:'58%',plugins:{datalabels:DL.pie(revTot),tooltip:{callbacks:{label:c=>` ${c.label}: ${fmtB(c.parsed)}  tr (${fmtP(c.parsed,revTot)})`}}}}});
  legend('lg-ttv-pie',[['Member '+fmtP(mbRev,revTot),cssv('--t2')],['Non-member '+fmtP(agg['6. Non-MB'].rev,revTot),cssv('--t6')]]);
  mk('c-ttv-cust',{type:'bar',data:{labels:lbl,datasets:MB.map(c=>barDs(CARD_LBL(c),ms.map(m=>get(m,c).cust),CC[c],{stack:'a'}))},
    options:{plugins:{tooltip:ttN},scales:{x:{stacked:true},y:{stacked:true,ticks:{callback:v=>fmtN(v)}}}}});
  mk('c-ttv-atv',{type:'bar',data:{labels:CARDS.map(CARD_LBL),datasets:[barDs('ATV',CARDS.map(c=>agg[c].cust?agg[c].rev/agg[c].cust/1e6:0),CARDS.map(c=>CC[c]),{maxBarThickness:36})]},
    options:{plugins:{tooltip:ttM},scales:{x:{},y:{beginAtZero:true,ticks:{callback:v=>v+' tr'}}}}});
  const ys=yearsSel(2025);
  const gg=group(D.ttv_gt, r=>r.card+'|'+r.gt, r=>ys.includes(r.year)); const GT=['Nữ','Nam','Khác'];
  mk('c-ttv-gt',{type:'bar',data:{labels:CARDS.map(CARD_LBL),datasets:GT.map((g,i)=>barDs(g,CARDS.map(c=>{const t=GT.reduce((a,x)=>a+((gg[c+'|'+x]||{}).cust||0),0);return pct((gg[c+'|'+g]||{}).cust||0,t);}),[cssv('--s5'),cssv('--s1'),cssv('--t6')][i],{stack:'a'}))},
    options:{indexAxis:'y',plugins:{legend:{display:true,position:'bottom'},tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.x.toFixed(1)}%`}}},scales:{x:{stacked:true,max:100,ticks:{callback:v=>v+'%'}},y:{stacked:true}}}});
  const ga=group(D.ttv_age, r=>r.card+'|'+r.age, r=>ys.includes(r.year)); const AGES=[...new Set(D.ttv_age.map(r=>r.age))].sort();
  const ageRamp=[cssv('--t5'),cssv('--t4'),cssv('--t3'),cssv('--t2'),cssv('--t1'),cssv('--s7'),cssv('--s2'),cssv('--t6')];
  mk('c-ttv-age',{type:'bar',data:{labels:CARDS.map(CARD_LBL),datasets:AGES.map((a,i)=>barDs(a.replace(/^\d\. /,''),CARDS.map(c=>{const t=AGES.reduce((x,y)=>x+((ga[c+'|'+y]||{}).cust||0),0);return pct((ga[c+'|'+a]||{}).cust||0,t);}),ageRamp[i%ageRamp.length],{stack:'a'}))},
    options:{indexAxis:'y',plugins:{legend:{display:true,position:'bottom'},tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.x.toFixed(1)}%`}}},scales:{x:{stacked:true,max:100,ticks:{callback:v=>v+'%'}},y:{stacked:true}}}});
  table('t-ttv',['Hạng thẻ','Số KH','% KH','Số bill','Doanh số (tr)','% DS','ATV (tr)','Bill/KH'],
    CARDS.map(c=>[CARD_LBL(c),fmtN(agg[c].cust),fmtP(agg[c].cust,custTot),fmtN(agg[c].bills),fmtB(agg[c].rev),fmtP(agg[c].rev,revTot),fmtM(agg[c].cust?agg[c].rev/agg[c].cust:0),(agg[c].cust?agg[c].bills/agg[c].cust:0).toFixed(2)]),
    ['Tổng',fmtN(custTot),'100%',fmtN(CARDS.reduce((a,c)=>a+agg[c].bills,0)),fmtB(revTot),'100%',fmtM(custTot?revTot/custTot:0),'']);
  const ts=group(D.ttv_seg, r=>r.card+'|'+r.seg, r=>ys.includes(r.year)); const S3=SEGS.slice(0,3);
  table('t-ttv-seg',['Hạng thẻ',...S3.map(s=>SEG_LBL[s]),'% KH mới','Doanh số (tr)'],
    CARDS.map(c=>{const t=S3.reduce((a,s)=>a+((ts[c+'|'+s]||{}).cust||0),0); const r=S3.reduce((a,s)=>a+((ts[c+'|'+s]||{}).rev||0),0); return [CARD_LBL(c),...S3.map(s=>fmtN((ts[c+'|'+s]||{}).cust||0)),fmtP((ts[c+'|1. KH mới']||{}).cust||0,t),fmtB(r)];}));
  const st=group(D.ttv_month, r=>r.kho+'|'+r.card, r=>inPeriod(r.month)); const stores={};
  for (const k in st){ const [kho,c]=k.split('|'); const o=stores[kho]||(stores[kho]={rev:0,mb:0}); o[c]=st[k]; o.rev+=st[k].rev; if(c!=='6. Non-MB') o.mb+=st[k].rev; }
  const srows=Object.entries(stores).sort((a,b)=>b[1].mb-a[1].mb); const smax=srows.length?srows[0][1].mb:0; const sm={}; D.stores.forEach(s=>sm[s.kho]=s);
  table('t-ttv-store',['Cửa hàng','Model',...MB.map(CARD_LBL),'DS thẻ (tr)','% DS thẻ','Tổng DS (tr)'],
    srows.map(([kho,o])=>[kho,MODEL_LBL((sm[kho]||{}).model||''),...MB.map(c=>fmtB((o[c]||{}).rev||0)),bar(fmtB(o.mb),smax),fmtP(o.mb,o.rev),fmtB(o.rev)]));
}

/* ================= SINH NHẬT ================= */
function renderSN(){
  const {ms,pm,get}=snByMonth(), lbl=ms.map(mLbl);
  let sent=0,red=0,rev=0; for (const m of pm){const g=get(m); sent+=g.sent; red+=g.redeemed; rev+=g.rev;}
  let sentC=0,redC=0,revC=0; for (const m of ms){const g=get(m); sentC+=g.sent; redC+=g.redeemed; revC+=g.rev;}
  const S3=cssv('--s3'), GREY=cssv('--t6'), ACC=cssv('--accent');
  el('sn-kpis').innerHTML=[
    kpi('CR voucher sinh nhật', fmtP(red,sent), fmtN(red)+' KH dùng / '+fmtN(sent)+' KH được gửi', null, true),
    kpi('KH được gửi voucher', fmtN(sent), periodLabel()+' · TB '+fmtN(pm.length?sent/pm.length:0)+'/tháng'),
    kpi('KH sử dụng voucher', fmtN(red), 'TB '+fmtN(pm.length?red/pm.length:0)+'/tháng', S3),
    kpi('Doanh số từ voucher SN', fmtB(rev)+' <small style="font-size:14px;color:var(--fg-3)">tr</small>', 'ATV '+fmtM(red?rev/red:0)+' tr / KH'),
  ].join('');
  mk('c-sn-month',{type:'bar',data:{labels:lbl,datasets:[barDs('Gửi',ms.map(m=>get(m).sent),GREY,{borderWidth:0}),barDs('Dùng',ms.map(m=>get(m).redeemed),S3,{borderWidth:0})]},
    options:{plugins:{tooltip:ttN},scales:{x:{},y:{beginAtZero:true,ticks:{callback:v=>fmtN(v)}}}}});
  legend('lg-sn',[['KH được gửi voucher',GREY],['KH đã dùng',S3]]);
  mk('c-sn-cr',{type:'line',data:{labels:lbl,datasets:[lineDs('CR',ms.map(m=>{const g=get(m);return pct(g.redeemed,g.sent);}),S3,{fill:true,backgroundColor:S3+'1a'})]},
    options:{plugins:{tooltip:ttP},scales:{x:{},y:{beginAtZero:true,ticks:{callback:v=>v+'%'}}}}});
  mk('c-sn-rev',{type:'bar',data:{labels:lbl,datasets:[barDs('Doanh số',ms.map(m=>get(m).rev/1e6),ACC,{borderWidth:0})]},
    options:{plugins:{tooltip:ttM},scales:{x:{},y:{beginAtZero:true,ticks:{callback:v=>fmtN(v)+' tr'}}}}});
  const ys=yearsSel(2023); const yf=r=>ys.includes(r.year);
  const gm=group(D.sn_month, r=>r.model, r=>inPeriod(r.month)); const ga=group(D.sn_am, r=>r.am, yf);
  const labels=[...MODELS.filter(m=>gm[m]).map(m=>'Model: '+MODEL_LBL(m)),...Object.keys(ga).filter(a=>a!=='-'&&a!=='#N/A').sort().map(a=>'AM: '+a)];
  const vals=[...MODELS.filter(m=>gm[m]).map(m=>pct(gm[m].redeemed,gm[m].sent)),...Object.keys(ga).filter(a=>a!=='-'&&a!=='#N/A').sort().map(a=>pct(ga[a].redeemed,ga[a].sent))];
  mk('c-sn-model',{type:'bar',data:{labels,datasets:[barDs('CR',vals,labels.map(l=>l.startsWith('Model')?ACC:S3),{borderWidth:0,maxBarThickness:18})]},
    options:{indexAxis:'y',plugins:{tooltip:{callbacks:{label:c=>` CR: ${c.parsed.x.toFixed(1)}%`}}},scales:{x:{beginAtZero:true,ticks:{callback:v=>v+'%'}},y:{}}}});
  const gg=group(D.sn_gt, r=>r.gt, yf); const GT=['Nữ','Nam','Khác'];
  mk('c-sn-gt',{type:'bar',data:{labels:GT,datasets:[barDs('KH dùng',GT.map(g=>(gg[g]||{}).redeemed||0),[cssv('--s5'),cssv('--s1'),GREY],{borderWidth:0,maxBarThickness:36})]},
    options:{plugins:{tooltip:{callbacks:{label:c=>{const g=gg[c.label]||{};return ` ${fmtN(g.redeemed||0)} KH dùng · CR ${fmtP(g.redeemed,g.sent)}`;}}}},scales:{x:{},y:{beginAtZero:true,ticks:{callback:v=>fmtN(v)}}}}});
  const gag=group(D.sn_age, r=>r.age, yf); const AGES=[...new Set(D.sn_age.map(r=>r.age))].sort();
  mk('c-sn-age',{type:'bar',data:{labels:AGES.map(a=>a.replace(/^\d\. /,'')),datasets:[barDs('KH dùng',AGES.map(a=>(gag[a]||{}).redeemed||0),ACC,{borderWidth:0,maxBarThickness:36})]},
    options:{plugins:{tooltip:{callbacks:{label:c=>{const g=gag[AGES[c.dataIndex]]||{};return ` ${fmtN(g.redeemed||0)} KH dùng · CR ${fmtP(g.redeemed,g.sent)}`;}}}},scales:{x:{},y:{beginAtZero:true,ticks:{callback:v=>fmtN(v)}}}}});
  const gn=group(D.sn_nguon, r=>r.nguon, yf);
  table('t-sn-nguon',['Nguồn','Gửi','Dùng','CR','Doanh số (tr)'],Object.entries(gn).sort((a,b)=>b[1].sent-a[1].sent).map(([k,g])=>[k==='Khác'?'Không ghi nguồn':k,fmtN(g.sent),fmtN(g.redeemed),fmtP(g.redeemed,g.sent),fmtB(g.rev)]));
  const gv=group(D.sn_voucher, r=>r.voucher, yf);
  table('t-sn-voucher',['Loại voucher','Gửi','Dùng','CR','Doanh số (tr)','ATV (tr)'],Object.entries(gv).sort((a,b)=>b[1].sent-a[1].sent).map(([k,g])=>[k||'–',fmtN(g.sent),fmtN(g.redeemed),fmtP(g.redeemed,g.sent),fmtB(g.rev),fmtM(g.redeemed?g.rev/g.redeemed:0)]));
  table('t-sn-month',['Tháng','KH được gửi','KH dùng','CR','Doanh số (tr)','ATV (tr)'],
    ms.map(m=>{const g=get(m);return [mLbl(m),fmtN(g.sent),fmtN(g.redeemed),fmtP(g.redeemed,g.sent),fmtB(g.rev),fmtM(g.redeemed?g.rev/g.redeemed:0)];}),
    ['Tổng '+ms.length+' tháng',fmtN(sentC),fmtN(redC),fmtP(redC,sentC),fmtB(revC),fmtM(redC?revC/redC:0)]);
  const st=group(D.sn_month, r=>r.kho, r=>inPeriod(r.month)); const sm={}; D.stores.forEach(s=>sm[s.kho]=s);
  const srows=Object.entries(st).sort((a,b)=>b[1].rev-a[1].rev); const smax=srows.length?srows[0][1].rev:0;
  table('t-sn-store',['Cửa hàng','Model','AM','Gửi','Dùng','CR','Doanh số (tr)','ATV (tr)'],
    srows.map(([kho,g])=>[kho||'(Không gắn cửa hàng)',MODEL_LBL((sm[kho]||{}).model||'')||'–',(sm[kho]||{}).am||'–',fmtN(g.sent),fmtN(g.redeemed),fmtP(g.redeemed,g.sent),bar(fmtB(g.rev),smax),fmtM(g.redeemed?g.rev/g.redeemed:0)]));
}

/* ---------- Cửa hàng liên hệ KH ---------- */
function storeKho(code){ const s=D.stores.find(x=>x.kho.startsWith(code+'-')); return s; }
function renderContact(){
  const S3=cssv('--s3'), S2=cssv('--s2'), GREY=cssv('--t6'), ACC=cssv('--accent');
  const okS = code => { const s=storeKho(code); if (state.store && code!==storeCode(state.store)) return false; return !s || state.models.has(s.model) || !MODELS.includes(s.model); };
  const ctMax=D.contact_month.reduce((m,r)=>r.month>m?r.month:m,'');   // tháng mới nhất có dữ liệu liên hệ (trước đây cố định 2026-09)
  const rowsAll=D.contact_month.filter(r=>r.month<=ctMax&&okS(r.store));
  const rows=rowsAll.filter(r=>inPeriod(r.month)); const rowsC=rowsAll.filter(r=>inChart(r.month));
  const ms=[...new Set(rowsC.map(r=>r.month))].sort();
  const byM={}; for(const r of rowsC){ const g=byM[r.month]||(byM[r.month]={listed:0,noted:0,red_n:0,red_u:0,rev_n:0,rev_u:0}); for(const k in g) g[k]+=r[k]; }
  const T={listed:0,noted:0,red_n:0,red_u:0,rev_n:0,rev_u:0}; for(const r of rows) for(const k in T) T[k]+=r[k];
  const crN=pct(T.red_n,T.noted), crU=pct(T.red_u,T.listed-T.noted);
  el('ct-kpis').innerHTML=[
    kpi('KH được CH liên hệ', fmtP(T.noted,T.listed), fmtN(T.noted)+' / '+fmtN(T.listed)+' KH trong danh sách', null, true),
    kpi('CR khi có liên hệ', fP1(crN), fmtN(T.red_n)+' KH dùng voucher', S3),
    kpi('CR khi không liên hệ', fP1(crU), fmtN(T.red_u)+' KH dùng voucher', GREY),
    kpi('Hiệu quả liên hệ', crU? (crN/crU).toLocaleString('vi-VN',{maximumFractionDigits:1})+'×' : '–', 'CR có liên hệ so với không liên hệ'),
    kpi('Doanh số từ KH có liên hệ', fmtB(T.rev_n)+' <small style="font-size:14px;color:var(--fg-3)">tr</small>', 'không liên hệ: '+fmtB(T.rev_u)+' tr'),
  ].join('');
  const lbl=ms.map(mLbl);
  mk('c-ct-pct',{type:'line',data:{labels:lbl,datasets:[lineDs('% liên hệ',ms.map(m=>pct(byM[m].noted,byM[m].listed)),ACC,{fill:true,backgroundColor:ACC+'1a'})]},
    options:{plugins:{tooltip:ttP},scales:{x:{},y:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%'}}}}});
  mk('c-ct-cr',{type:'line',data:{labels:lbl,datasets:[lineDs('Có liên hệ',ms.map(m=>pct(byM[m].red_n,byM[m].noted)),S3),lineDs('Không liên hệ',ms.map(m=>pct(byM[m].red_u,byM[m].listed-byM[m].noted)),GREY)]},
    options:{plugins:{tooltip:ttP},scales:{x:{},y:{beginAtZero:true,ticks:{callback:v=>v+'%'}}}}});
  legend('lg-ct-cr',[['Có liên hệ',S3],['Không liên hệ',GREY]]);
  const inCt = r => r.month<=ctMax && inPeriod(r.month) && okS(r.store);   // cùng bộ lọc kỳ / CH / model với các bảng trên
  const gm={}; for(const r of D.contact_method.filter(inCt)){ const g=gm[r.meth]||(gm[r.meth]={n:0,red:0,rev:0}); g.n+=r.n; g.red+=r.red; g.rev+=r.rev; }
  const mName=k=>k==='Khác/không ghi'?'Có ghi nhận, không rõ hình thức':k;
  table('t-ct-method',['Hình thức','Số KH','Dùng voucher','CR','Doanh số (tr)'],Object.entries(gm).sort((a,b)=>b[1].n-a[1].n).map(([k,g])=>[mName(k),fmtN(g.n),fmtN(g.red),fmtP(g.red,g.n),fmtB(g.rev)]));
  if(!Object.keys(gm).length) el('t-ct-method').innerHTML='<div class="empty">Không có dữ liệu cho kỳ này</div>';
  const gs={}; for(const r of D.contact_staff.filter(inCt)){ const key=r.store+'|'+r.staff; const g=gs[key]||(gs[key]={store:r.store,staff:r.staff,n:0,red:0,rev:0}); g.n+=r.n; g.red+=r.red; g.rev+=r.rev; }
  table('t-ct-staff',['Nhân viên','CH','KH đã liên hệ','Dùng voucher','CR','Doanh số (tr)'],Object.values(gs).sort((a,b)=>b.n-a.n).slice(0,15).map(g=>[g.staff,g.store,fmtN(g.n),fmtN(g.red),fmtP(g.red,g.n),fmtB(g.rev)]));
  if(!Object.keys(gs).length) el('t-ct-staff').innerHTML='<div class="empty">Không có dữ liệu cho kỳ này</div>';
  const bs={}; for(const r of rows){ const g=bs[r.store]||(bs[r.store]={listed:0,noted:0,red_n:0,red_u:0,rev_n:0,rev_u:0,months:new Set(),active:new Set()}); for(const k of ['listed','noted','red_n','red_u','rev_n','rev_u']) g[k]+=r[k]; g.months.add(r.month); if(r.noted/r.listed>=.05) g.active.add(r.month); }
  const brow=Object.entries(bs).sort((a,b)=>pct(b[1].noted,b[1].listed)-pct(a[1].noted,a[1].listed));
  const pill=p=>p>=50?'<span class="pill ok">Thực hiện tốt</span>':p>=5?'<span class="pill mid">Làm một phần</span>':'<span class="pill no">Chưa thực hiện</span>';
  table('t-ct-store',['Cửa hàng','Model','AM','Trạng thái','Tháng có làm','KH trong DS','KH đã liên hệ','% liên hệ','Dùng (có LH)','CR có LH','Dùng (không LH)','CR không LH','DS có LH (tr)'],
    brow.map(([code,g])=>{ const s=storeKho(code)||{}; const p=pct(g.noted,g.listed); return [s.kho||code,MODEL_LBL(s.model||''),s.am||'–',pill(p),g.active.size+'/'+g.months.size,fmtN(g.listed),fmtN(g.noted),bar(fP(p),100),fmtN(g.red_n),fmtP(g.red_n,g.noted),fmtN(g.red_u),fmtP(g.red_u,g.listed-g.noted),fmtB(g.rev_n)]; }),
    ['Tổng','','','',''+periodMonths().length,fmtN(T.listed),fmtN(T.noted),fP(pct(T.noted,T.listed)),fmtN(T.red_n),fP1(crN),fmtN(T.red_u),fP1(crU),fmtB(T.rev_n)]);
  // Xếp hạng thưởng CH: (1) liên hệ ≥90% DS mới xét, (2) CR có liên hệ cao nhất, (3) doanh số từ KH có liên hệ. Bỏ CH có DS < 100 KH (mẫu quá nhỏ).
  const RK_PCT=90, RK_MIN=100;
  const rk=Object.entries(bs).map(([code,g])=>{ const p=pct(g.noted,g.listed); const cr=g.noted?g.red_n/g.noted*100:0;
    const why = g.listed<RK_MIN ? 'DS dưới '+RK_MIN+' KH' : p<RK_PCT ? 'Liên hệ dưới '+RK_PCT+'%' : '';
    return {code,g,p,cr,ok:!why,why}; });
  rk.sort((a,b)=> (b.ok-a.ok) || (a.ok? (b.cr-a.cr)||(b.g.rev_n-a.g.rev_n) : (b.p-a.p)||(b.g.rev_n-a.g.rev_n)));
  let rn=0;
  table('t-ct-rank',['Hạng','Cửa hàng','Model','AM','KH trong DS','% liên hệ','Dùng voucher (có LH)','CR có LH','DS từ KH có LH (tr)','Ghi chú'],
    rk.map(x=>{ const s=storeKho(x.code)||{}; const h=x.ok? ++rn : '–';
      const tag = x.ok ? (h<=3?'<span class="pill ok">Top '+h+'</span>':'') : '<span class="pill no">'+x.why+'</span>';
      const lowN = x.ok && x.g.red_n<5 ? ' <span class="pill mid">ít mẫu (&lt;5 KH dùng)</span>' : '';
      return [h,s.kho||x.code,MODEL_LBL(s.model||''),s.am||'–',fmtN(x.g.listed),fP(x.p),fmtN(x.g.red_n),fP1(x.cr),fmtB(x.g.rev_n),tag+lowN]; }));
  if(!rk.length) el('t-ct-rank').innerHTML='<div class="empty">Không có dữ liệu cho kỳ này</div>';
}
/* ================= CTKM ================= */
const K = D.ctkm || {kho:[],progs:[],day:[],prog:[],months:[],awo_kpi:14};
const KSM = {}; D.stores.forEach(s=>KSM[s.kho]=s);
const kModel = kho => { const m=(KSM[kho]||{}).model; return MODELS.includes(m) ? m : '6. Khác'; };
const KDAY = K.day.map(r=>({d:r[0], m:r[0].slice(0,7), kho:K.kho[r[1]], ns:r[2]*1e3, ck:r[3]*1e3, b:r[4], bp:r[5], ba:r[6], nsp:r[7]*1e3}));
const KPRG = K.prog.map(r=>({m:r[0], kho:K.kho[r[1]], p:r[2], ns:r[3]*1e3, ck:r[4]*1e3, b:r[5]}));
const PNAME=i=>K.progs[i][0], PGRP=i=>K.progs[i][1], PCAMP=i=>K.progs[i][2], PAWO=i=>K.progs[i][3];
const PCT=i=>K.progs[i][4]||K.progs[i][0];   // tên CT gốc: gom các mức giảm của cùng 1 CTKM
const PLBL=i=>PAWO(i)||PCT(i);
function byCT(rows, keyFn){ const o={}; for(const r of rows){ const k=keyFn(r); const g=o[k]||(o[k]={ns:0,ck:0,b:0,p:r.p,tiers:{}}); g.ns+=r.ns; g.ck+=r.ck; g.b+=r.b; const t=g.tiers[r.p]||(g.tiers[r.p]={ns:0,b:0}); t.ns+=r.ns; t.b+=r.b; } return o; }
function tierCell(g, name){ const ts=Object.entries(g.tiers).filter(([,t])=>t.ns||t.b).sort((a,b)=>b[1].ns-a[1].ns); if(ts.length<=1) return `<span class="nm">${ts.length?PNAME(+ts[0][0]):name}</span>`;
  return `<details class="nm"><summary>${name} <span class="tag">${ts.length} mức giảm</span></summary><ul style="margin:6px 0 0;padding-left:18px;font-size:12px;color:var(--fg-2)">${ts.map(([p,t])=>`<li>${PNAME(+p)} — ${fmtB(t.ns)} tr · ${fmtN(t.b)} bill</li>`).join('')}</ul></details>`; }
const wrapLbl=(t,n=18)=>{ const w=t.split(' '), out=[]; let cur=''; for(const x of w){ if((cur+' '+x).trim().length>n && cur){ out.push(cur); cur=x; } else cur=(cur+' '+x).trim(); } if(cur) out.push(cur); return out.length>4? out.slice(0,3).concat([out.slice(3).join(' ').slice(0,n-1)+'…']) : out; };
function paretoChart(id, items, tot, color){
  mk(id,{type:'bar',data:{labels:items.map(([l])=>wrapLbl(l)),datasets:[
      barDs('NetSale',items.map(([,v])=>v.ns/1e6),color,{yAxisID:'y',order:2,maxBarThickness:56}),
      lineDs('% tỷ trọng',items.map(([,v])=>pct(v.ns,tot)),cssv('--s1'),{yAxisID:'y1',order:1})]},
    options:{plugins:{tooltip:{callbacks:{title:c=>items[c[0].dataIndex][0],label:c=>c.dataset.yAxisID==='y1'?` % tỷ trọng: ${fP1(c.parsed.y)}`:` NetSale: ${fmtN(c.parsed.y)} tr · %CK ${fCK(items[c.dataIndex][1].ck,items[c.dataIndex][1].ns)}`}},
      datalabels:{display:c=>c.dataset.yAxisID==='y1' || (c.dataset.data[c.dataIndex] >= .12*Math.max(...c.dataset.data)), formatter:(v,c)=>c.dataset.yAxisID==='y1'?fP1(v):fmtN(v), anchor:'center', align:c=>c.dataset.yAxisID==='y1'?'top':'center', offset:c=>c.dataset.yAxisID==='y1'?8:0, rotation:c=>c.dataset.yAxisID==='y1'?0:-90,
        color:c=>c.dataset.yAxisID==='y1'?cssv('--fg'):inkOn(bgOf(c)), font:{size:10,weight:'700'}, clamp:true, backgroundColor:c=>c.dataset.yAxisID==='y1'?cssv('--accent-soft'):null, borderRadius:3, padding:{top:1,bottom:0,left:3,right:3}}},
      scales:{x:{ticks:{autoSkip:false,maxRotation:0,font:{size:10}}},y:{beginAtZero:true,grace:'8%',ticks:{callback:v=>fmtN(v)}},y1:{position:'right',beginAtZero:true,grace:'15%',grid:{display:false},ticks:{callback:v=>Math.round(v)+'%'}}}}});
}
const FULL='Full Price';
const kstate = {camp:'', grp:''};
try { const s=JSON.parse(localStorage.getItem('cskh-km')||'{}'); Object.assign(kstate, s); } catch(e){}
const okKho = kho => (!state.store || kho===state.store) && state.models.has(kModel(kho));
const okProg = p => (!kstate.camp || PCAMP(p)===kstate.camp) && (!kstate.grp || PGRP(p)===kstate.grp);
const ckPct = (ck,ns) => (ns+ck) ? 100*ck/(ns+ck) : 0;
const fCK = (ck,ns) => fP1(ckPct(ck,ns));
const GRP_COL = () => { const c=[cssv('--s1'),cssv('--s4'),cssv('--s3'),cssv('--s2'),cssv('--t3'),cssv('--t2'),cssv('--t5'),cssv('--s8'),cssv('--t4')]; return (g,i) => g===FULL ? cssv('--t6') : c[i % c.length]; };
function isoWeek(ds){ const d=new Date(ds+'T00:00:00Z'); const y=d.getUTCFullYear(); const j=new Date(Date.UTC(y,0,1)); const doy=Math.round((d-j)/864e5); return [y, Math.floor((doy + j.getUTCDay())/7)+1]; }   // = WEEKNUM(date,1) của Power BI (tuần bắt đầu CN)
function kmAgg(rows, keyFn){ const o={}; for(const r of rows){ const k=keyFn(r); const g=o[k]||(o[k]={ns:0,ck:0,b:0}); g.ns+=r.ns; g.ck+=r.ck; g.b+=r.b; } return o; }
function comboChart(id, labels, ns, ck, extra={}){
  const C1=cssv('--s1'), C2=cssv('--s4'), C3=cssv('--s2');
  mk(id,{type:'bar',data:{labels,datasets:[
      barDs('Doanh số',ns.map(v=>v/1e6),C1,{yAxisID:'y',order:2}),
      barDs('Chiết khấu',ck.map(v=>v/1e6),C2,{yAxisID:'y',order:2}),
      lineDs('%CK',ns.map((v,i)=>ckPct(ck[i],v)),C3,{yAxisID:'y1',order:1,pointRadius:extra.dense?1.5:3})]},
    options:{plugins:{tooltip:{callbacks:{label:c=>c.dataset.yAxisID==='y1'?` %CK: ${fP1(c.parsed.y)}`:` ${c.dataset.label}: ${fmtN(c.parsed.y)} tr`}},
      datalabels:{display:c=>c.dataset.yAxisID==='y1' ? (!extra.dense || c.dataIndex%2===0) : (!extra.dense && c.datasetIndex===0), formatter:(v,c)=>c.dataset.yAxisID==='y1'?fP1(v):(c.datasetIndex===0?fmtN(v):''),
        anchor:'end', align:c=>c.dataset.yAxisID==='y1'?'top':'end', offset:c=>c.dataset.yAxisID==='y1'?4:-2, color:cssv('--fg-2'), font:{size:extra.dense?9:10,weight:'600'}, clamp:true,
        backgroundColor:c=>c.dataset.yAxisID==='y1'?cssv('--surface'):null, borderRadius:3, padding:{top:1,bottom:0,left:3,right:3}}},
      scales:{x:{ticks:{autoSkip:true,maxRotation:0}},y:{beginAtZero:true,ticks:{callback:v=>fmtN(v)}},y1:{position:'right',beginAtZero:true,grid:{display:false},ticks:{callback:v=>v+'%'}}}}});
}
function renderKM(){
  const pm=periodMonths(), cms=chartMonths().filter(m=>K.months.includes(m));
  const filtered = !!(kstate.camp||kstate.grp);
  const P = KPRG.filter(r=>okKho(r.kho)&&okProg(r.p));
  const Pp = P.filter(r=>inPeriod(r.m));
  const Dp = KDAY.filter(r=>okKho(r.kho)&&inPeriod(r.m));
  const Tall = KPRG.filter(r=>okKho(r.kho)&&inPeriod(r.m)).reduce((a,r)=>(a.ns+=r.ns,a.ck+=r.ck,a),{ns:0,ck:0});
  const T = Pp.reduce((a,r)=>(a.ns+=r.ns,a.ck+=r.ck,a.b+=r.b,a),{ns:0,ck:0,b:0});
  const Tp = Pp.filter(r=>PGRP(r.p)!==FULL).reduce((a,r)=>(a.ns+=r.ns,a.ck+=r.ck,a),{ns:0,ck:0});
  const bills = filtered ? T.b : Dp.reduce((a,r)=>a+r.b,0), billsP = filtered ? Pp.filter(r=>PGRP(r.p)!==FULL).reduce((a,r)=>a+r.b,0) : Dp.reduce((a,r)=>a+r.bp,0);
  const noData = !pm.some(m=>K.months.includes(m));
  el('km-scope').textContent = noData ? 'Kỳ đang chọn chưa có dữ liệu CTKM (có từ T10/2025).' : (filtered ? 'Đang lọc — % tỷ trọng tính trên tổng doanh số kỳ: '+fmtB(Tall.ns)+' tr' : '');
  el('km-kpis').innerHTML=[
    kpi(filtered?'Doanh số (đã lọc)':'Sum of NetSale', fmtB(T.ns)+' <small style="font-size:14px;color:var(--fg-3)">tr</small>', filtered? fmtP(T.ns,Tall.ns)+' tổng doanh số' : 'ATV '+fmtM(bills?T.ns/bills:0)+' tr · '+fmtN(bills)+' bill', null, true),
    kpi('Sum of Discount', fmtB(T.ck)+' <small style="font-size:14px;color:var(--fg-3)">tr</small>', 'tổng chiết khấu CTKM'),
    kpi('%CK CTKM', fCK(T.ck,T.ns), 'CK / (DS + CK)', cssv('--s2')),
    kpi('Doanh số có CTKM', fmtP(Tp.ns,T.ns), fmtB(Tp.ns)+' tr · nguyên giá '+fmtB(T.ns-Tp.ns)+' tr', cssv('--s1')),
    kpi('Bill có CTKM', fmtP(billsP,bills), fmtN(billsP)+' / '+fmtN(bills)+' bill'),
  ].join('');
  // tháng
  const bm=kmAgg(P.filter(r=>cms.includes(r.m)), r=>r.m);
  comboChart('c-km-month', cms.map(mLbl), cms.map(m=>(bm[m]||{}).ns||0), cms.map(m=>(bm[m]||{}).ck||0));
  legend('lg-km',[['Doanh số',cssv('--s1')],['Chiết khấu',cssv('--s4')],['%CK',cssv('--s2')]]);
  // tuần & ngày (tổng, không lọc chiến dịch)
  const wk=kmAgg(Dp, r=>{ const [y,w]=isoWeek(r.d); return y+'-'+String(w).padStart(2,'0'); }); const wks=Object.keys(wk).sort();
  comboChart('c-km-week', wks.map(k=>'Tuần '+parseInt(k.slice(5))+(new Set(wks.map(x=>x.slice(0,4))).size>1?'/'+k.slice(2,4):'')), wks.map(k=>wk[k].ns), wks.map(k=>wk[k].ck), {dense:wks.length>20});
  el('km-week-note').textContent = 'Tuần (WEEKNUM, bắt đầu Chủ nhật) trong kỳ đang chọn · tổng toàn bộ bán hàng, không lọc theo chiến dịch / group';
  let dRows=Dp, dNote='Từng ngày trong kỳ đang chọn';
  if (pm.length>3){ const lm=[...new Set(Dp.map(r=>r.m))].sort().pop(); dRows=Dp.filter(r=>r.m===lm); dNote='Kỳ dài hơn 1 quý → hiện từng ngày của tháng cuối kỳ ('+(lm?mLbl(lm):'–')+')'; }
  const dy=kmAgg(dRows, r=>r.d); const dys=Object.keys(dy).sort();
  el('km-day-note').textContent = dNote+' · tổng toàn bộ bán hàng';
  comboChart('c-km-day', dys.map(d=>d.slice(8)+'/'+d.slice(5,7)), dys.map(d=>dy[d].ns), dys.map(d=>dy[d].ck), {dense:dys.length>35});
  // group
  const gg=kmAgg(Pp, r=>PGRP(r.p)); const gl=Object.entries(gg).sort((a,b)=>b[1].ns-a[1].ns); const gc=GRP_COL();
  const cols=gl.map(([g],i)=>gc(g,i));
  mk('c-km-grppie',{type:'doughnut',data:{labels:gl.map(x=>x[0]),datasets:[{data:gl.map(x=>Math.max(0,x[1].ns)),backgroundColor:cols,borderColor:cssv('--surface'),borderWidth:2,hoverOffset:4}]},
    options:{cutout:'55%',plugins:{datalabels:DL.pie(gl.reduce((a,x)=>a+Math.max(0,x[1].ns),0)),tooltip:{callbacks:{label:c=>` ${c.label}: ${fmtN(c.parsed/1e6)} tr (${fmtP(c.parsed,Tall.ns)})`}}}}});
  legend('lg-km-grp', gl.slice(0,8).map(([g],i)=>[g,cols[i]]));
  const gmax=gl.length?Math.max(...gl.map(x=>x[1].ns)):0;
  table('t-km-grp',['Group CTKM','Doanh số (tr)','% DS','Chiết khấu (tr)','%CK','Bill','ATV (tr)'],
    gl.map(([g,v])=>[g,bar(fmtB(v.ns),gmax),fmtP(v.ns,Tall.ns),fmtB(v.ck),fCK(v.ck,v.ns),fmtN(v.b),fmtM(v.b?v.ns/v.b:0)]),
    ['Tổng',fmtB(T.ns),fmtP(T.ns,Tall.ns),fmtB(T.ck),fCK(T.ck,T.ns),'','']);
  // CTKM
  const lg=byCT(Pp.filter(r=>PGRP(r.p)!==FULL), r=>PLBL(r.p));
  paretoChart('c-km-top', Object.entries(lg).sort((a,b)=>b[1].ns-a[1].ns).slice(0,10), Tall.ns, cssv('--s4'));
  const cg2=byCT(Pp.filter(r=>PGRP(r.p)!==FULL), r=>PGRP(r.p)+'|'+PCT(r.p)); const pl=Object.entries(cg2).sort((a,b)=>b[1].ns-a[1].ns);
  const pmax=pl.length?pl[0][1].ns:0;
  table('t-km-prog',['#','CTKM','Group','Chiến dịch','Bill','Doanh số (tr)','% DS','Chiết khấu (tr)','%CK','ATV (tr)','DS / 1đ CK'],
    pl.slice(0,30).map(([k,v],i)=>[i+1,tierCell(v,k.split('|').slice(1).join('|')),`<span class="tag">${PGRP(v.p)}</span>`,PCAMP(v.p),fmtN(v.b),bar(fmtB(v.ns),pmax),fmtP(v.ns,Tall.ns),fmtB(v.ck),fCK(v.ck,v.ns),fmtM(v.b?v.ns/v.b:0),v.ck>0?(v.ns/v.ck).toLocaleString('vi-VN',{maximumFractionDigits:1}):'–']));
  // chiến dịch
  const cm=pm.filter(m=>K.months.includes(m)); const showM=cm.length>1&&cm.length<=12;
  const cg={}; for(const r of Pp){ const c=PCAMP(r.p); if(c==='Nguyên giá') continue; const g=cg[c]||(cg[c]={ns:0,ck:0,b:0,progs:new Set(),bym:{}}); g.ns+=r.ns; g.ck+=r.ck; g.b+=r.b; g.progs.add(r.p); g.bym[r.m]=(g.bym[r.m]||0)+r.ns; }
  const cl=Object.entries(cg).sort((a,b)=>b[1].ns-a[1].ns); const cmax=cl.length?cl[0][1].ns:0;
  table('t-km-camp',['Chiến dịch','Số CTKM','Bill','Doanh số (tr)','% DS','Chiết khấu (tr)','%CK','ATV (tr)'].concat(showM?cm.map(mLbl):[]),
    cl.slice(0,40).map(([c,v])=>[c,v.progs.size,fmtN(v.b),bar(fmtB(v.ns),cmax),fmtP(v.ns,Tall.ns),fmtB(v.ck),fCK(v.ck,v.ns),fmtM(v.b?v.ns/v.b:0)].concat(showM?cm.map(m=>v.bym[m]?fmtB(v.bym[m]):'·'):[])));
  // cửa hàng
  const sg={}; for(const r of Pp){ const g=sg[r.kho]||(sg[r.kho]={ns:0,ck:0,nsp:0,bp:0,byp:{}}); g.ns+=r.ns; g.ck+=r.ck; if(PGRP(r.p)!==FULL){ g.nsp+=r.ns; g.bp+=r.b; g.byp[PCT(r.p)]=(g.byp[PCT(r.p)]||0)+r.ns; } }
  const sl=Object.entries(sg).sort((a,b)=>b[1].ns-a[1].ns); const smax=sl.length?sl[0][1].ns:0;
  table('t-km-store',['Cửa hàng','Model','Doanh số (tr)','DS có CTKM (tr)','% DS có CTKM','Chiết khấu (tr)','%CK','CTKM doanh số cao nhất'],
    sl.map(([k,v])=>{ const tp=Object.entries(v.byp).sort((a,b)=>b[1]-a[1])[0]; return [k,MODEL_LBL(kModel(k)),bar(fmtB(v.ns),smax),fmtB(v.nsp),fmtP(v.nsp,v.ns),fmtB(v.ck),fCK(v.ck,v.ns),tp?`<span class="nm">${tp[0]}</span>`:'–']; }),
    ['Tổng','',fmtB(T.ns),fmtB(Tp.ns),fmtP(Tp.ns,T.ns),fmtB(T.ck),fCK(T.ck,T.ns),'']);
}
/* ---------- AWO ---------- */
const AWO_FAM = [...new Set(K.progs.map(p=>p[3]).filter(Boolean))];
function renderAWO(){
  const pm=periodMonths(), cms=chartMonths().filter(m=>K.months.includes(m)); const KPI=K.awo_kpi||14;
  el('awo-kpi-v').textContent=KPI;
  const P=KPRG.filter(r=>okKho(r.kho)); const A=P.filter(r=>PAWO(r.p));
  const Ap=A.filter(r=>inPeriod(r.m)); const Dall=KDAY.filter(r=>okKho(r.kho));
  const Dp=Dall.filter(r=>inPeriod(r.m));
  const tot=Dp.reduce((a,r)=>(a.ns+=r.ns,a.b+=r.b,a.ba+=r.ba,a),{ns:0,b:0,ba:0});
  const T=Ap.reduce((a,r)=>(a.ns+=r.ns,a.ck+=r.ck,a.b+=r.b,a),{ns:0,ck:0,b:0});
  const pb=pct(tot.ba,tot.b);
  el('awo-kpis').innerHTML=[
    kpi('Bill áp dụng AWO', fmtN(tot.ba), 'trên '+fmtN(tot.b)+' bill toàn hệ thống', null, true),
    kpi('% bill AWO', fP1(pb), (pb>=KPI?'<span class="pill ok">Đạt</span>':'<span class="pill no">Chưa đạt</span>')+' KPI '+KPI+'% bill', cssv('--s3')),
    kpi('Doanh số AWO', fmtB(T.ns)+' <small style="font-size:14px;color:var(--fg-3)">tr</small>', fmtP(T.ns,tot.ns)+' tổng doanh số'),
    kpi('Chiết khấu AWO', fmtB(T.ck)+' <small style="font-size:14px;color:var(--fg-3)">tr</small>', '%CK '+fCK(T.ck,T.ns), cssv('--s2')),
    kpi('ATV bill AWO', fmtM(T.b?T.ns/T.b:0)+' <small style="font-size:14px;color:var(--fg-3)">tr</small>', 'doanh số AWO / bill'),
  ].join('');
  const FC=[cssv('--s1'),cssv('--s3'),cssv('--s4'),cssv('--s2'),cssv('--t3'),cssv('--t2'),cssv('--t5'),cssv('--s8'),cssv('--t4')];
  const fcol=f=>FC[AWO_FAM.indexOf(f)%FC.length];
  const byMF=kmAgg(A.filter(r=>cms.includes(r.m)), r=>r.m+'|'+PAWO(r.p)); const byM=kmAgg(Dall.filter(r=>cms.includes(r.m)).map(r=>({ns:0,ck:r.ba,b:r.b,m:r.m})), r=>r.m);
  const fams=AWO_FAM.filter(f=>cms.some(m=>byMF[m+'|'+f]));
  mk('c-awo-month',{type:'bar',data:{labels:cms.map(mLbl),datasets:fams.map(f=>barDs(f,cms.map(m=>(byMF[m+'|'+f]||{}).b||0),fcol(f),{stack:'s',yAxisID:'y'}))
      .concat([lineDs('% bill AWO',cms.map(m=>byM[m]?pct(byM[m].ck,byM[m].b):0),cssv('--s2'),{yAxisID:'y1'}),lineDs('KPI',cms.map(()=>KPI),cssv('--fg-3'),{yAxisID:'y1',borderDash:[5,4],pointRadius:0,borderWidth:1.5})])},
    options:{plugins:{tooltip:{callbacks:{label:c=>c.dataset.yAxisID==='y1'?` ${c.dataset.label}: ${fP1(c.parsed.y)}`:` ${c.dataset.label}: ${fmtN(c.parsed.y)} bill`}},
      datalabels:{display:c=>c.dataset.label==='% bill AWO', formatter:v=>fP1(v), align:'top', offset:4, color:cssv('--fg-2'), font:{size:10,weight:'600'}, backgroundColor:cssv('--surface'), borderRadius:3, padding:{top:1,bottom:0,left:3,right:3}}},
      scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true},y1:{position:'right',beginAtZero:true,grid:{display:false},ticks:{callback:v=>v+'%'}}}}});
  legend('lg-awo',fams.map(f=>[f,fcol(f)]).concat([['% bill AWO',cssv('--s2')]]));
  const fg=kmAgg(Ap, r=>PAWO(r.p)); const fl=Object.entries(fg).sort((a,b)=>b[1].ns-a[1].ns);
  mk('c-awo-pie',{type:'doughnut',data:{labels:fl.map(x=>x[0]),datasets:[{data:fl.map(x=>Math.max(0,x[1].ns)),backgroundColor:fl.map(x=>fcol(x[0])),borderColor:cssv('--surface'),borderWidth:2}]},
    options:{cutout:'55%',plugins:{legend:{display:true,position:'bottom',labels:{boxWidth:10,font:{size:11}}},datalabels:DL.pie(T.ns||1),tooltip:{callbacks:{label:c=>` ${c.label}: ${fmtN(c.parsed/1e6)} tr`}}}}});
  const fmax=fl.length?fl[0][1].ns:0;
  table('t-awo-fam',['CT AWO','Bill','% bill','Doanh số (tr)','% tỷ trọng DS','Chiết khấu (tr)','%CK','ATV (tr)'],
    fl.map(([f,v])=>[`<span class="sw" style="display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;background:${fcol(f)}"></span>${f}`,fmtN(v.b),fmtP(v.b,tot.b),bar(fmtB(v.ns),fmax),fmtP(v.ns,tot.ns),fmtB(v.ck),fCK(v.ck,v.ns),fmtM(v.b?v.ns/v.b:0)]),
    ['Tổng AWO',fmtN(tot.ba),fP1(pb),fmtB(T.ns),fmtP(T.ns,tot.ns),fmtB(T.ck),fCK(T.ck,T.ns),fmtM(T.b?T.ns/T.b:0)]);
  paretoChart('c-awo-pareto', fl, tot.ns, cssv('--t3'));
  el('awo-list').innerHTML = fl.length ? '<b>Các CTKM AWO</b> ('+periodLabel()+'):<ol>'+fl.map(([f,v])=>`<li>${f}: <b>${fmtP(v.ns,tot.ns)}</b> doanh số · ${fmtN(v.b)} bill</li>`).join('')+'</ol>' : '';
  const pg=byCT(Ap, r=>PAWO(r.p)+'|'+PCT(r.p)); const pl=Object.entries(pg).sort((a,b)=>b[1].ns-a[1].ns);
  table('t-awo-prog',['CT AWO','Tên CT','Group','Bill','Doanh số (tr)','% tỷ trọng DS','Chiết khấu (tr)','%CK'],
    pl.map(([k,v])=>[PAWO(v.p),tierCell(v,k.split('|').slice(1).join('|')),`<span class="tag">${PGRP(v.p)}</span>`,fmtN(v.b),fmtB(v.ns),fmtP(v.ns,tot.ns),fmtB(v.ck),fCK(v.ck,v.ns)]));
  const sb=kmAgg(Dp, r=>r.kho); const sa={}; for(const r of Ap){ const g=sa[r.kho]||(sa[r.kho]={}); g[PAWO(r.p)]=(g[PAWO(r.p)]||0)+r.b; }
  const ba={}; for(const r of Dp){ ba[r.kho]=(ba[r.kho]||0)+r.ba; }
  const famP=fl.map(x=>x[0]);
  const srows=Object.keys(sb).filter(k=>sb[k].b>0).sort((a,b)=>pct(ba[b]||0,sb[b].b)-pct(ba[a]||0,sb[a].b));
  table('t-awo-store',['Cửa hàng','Model','Tổng bill','Bill AWO','% bill AWO','KPI'].concat(famP),
    srows.map(k=>{ const p=pct(ba[k]||0,sb[k].b); return [k,MODEL_LBL(kModel(k)),fmtN(sb[k].b),fmtN(ba[k]||0),bar(fP1(p),Math.max(30,KPI*2)),p>=KPI?'<span class="pill ok">Đạt</span>':p>=KPI/2?'<span class="pill mid">Gần đạt</span>':'<span class="pill no">Thấp</span>'].concat(famP.map(f=>(sa[k]||{})[f]?fmtN(sa[k][f]):'·')); }));
}
function initKM(){
  const camps={}; for(const r of KPRG){ const c=PCAMP(r.p); camps[c]=(camps[c]||0)+r.ns; }
  el('fCamp').innerHTML='<option value="">Tất cả chiến dịch</option>'+Object.entries(camps).sort((a,b)=>b[1]-a[1]).map(([c])=>`<option value="${c.replace(/"/g,'&quot;')}">${c}</option>`).join('');
  const grps={}; for(const r of KPRG){ const g=PGRP(r.p); grps[g]=(grps[g]||0)+r.ns; }
  el('fGrp').innerHTML='<option value="">Tất cả group</option>'+Object.entries(grps).sort((a,b)=>b[1]-a[1]).map(([g])=>`<option value="${g}">${g}</option>`).join('');
  if (!camps[kstate.camp]) kstate.camp=''; if (!grps[kstate.grp]) kstate.grp='';
  el('fCamp').value=kstate.camp; el('fGrp').value=kstate.grp;
  for (const [id,key] of [['fCamp','camp'],['fGrp','grp']]) el(id).addEventListener('change',()=>{ kstate[key]=el(id).value; try{localStorage.setItem('cskh-km',JSON.stringify(kstate));}catch(e){} render(); });
}
initKM();

/* ================= HÀNG HÓA — nhóm hàng & giỏ hàng ================= */
const HH = D.hh || {months:[],kho:[],cards:CARDS,camps:[],nhom:['LENS','OPT','SUN','CONTACLENS','OTHERS'],com:['COMPLETE OPTICAL PAIR','LENS ONLY','FRAME ONLY','SUN ONLY','COMPLETE PAIR SUN','CONTACT LENSES ONLY','OTHERS'],loai:[],lines:[],bills:[],loai_rows:[]};
const HNHOM = HH.nhom, HCOM = HH.com;
const NHOM_LBL = {LENS:'Tròng kính',OPT:'Gọng kính',SUN:'Kính mát',CONTACLENS:'Kính áp tròng',OTHERS:'Khác (phụ kiện, dịch vụ)'};
const NHOM_UNIT = {LENS:'cặp',OPT:'cái',SUN:'cái',CONTACLENS:'sp',OTHERS:'sp'};
const COM_LBL = {'COMPLETE OPTICAL PAIR':'Gọng + tròng (complete pair)','LENS ONLY':'Chỉ mua tròng (only lens)','FRAME ONLY':'Chỉ mua gọng (only frame)','SUN ONLY':'Chỉ kính mát','COMPLETE PAIR SUN':'Kính mát + tròng','CONTACT LENSES ONLY':'Chỉ kính áp tròng','OTHERS':'Khác (phụ kiện / dịch vụ)'};
const NHOM_COL = () => ({LENS:cssv('--s1'),OPT:cssv('--s3'),SUN:cssv('--s4'),CONTACLENS:cssv('--s2'),OTHERS:cssv('--t6')});
const COM_COL = () => ({'COMPLETE OPTICAL PAIR':cssv('--s1'),'LENS ONLY':cssv('--s3'),'FRAME ONLY':cssv('--s2'),'SUN ONLY':cssv('--s4'),'COMPLETE PAIR SUN':cssv('--s8'),'CONTACT LENSES ONLY':cssv('--t3'),'OTHERS':cssv('--t6')});
const HL = HH.lines.map(r=>({m:HH.months[r[0]],kho:HH.kho[r[1]],ci:r[2],pi:r[3],n:HNHOM[r[4]],q:r[5],ns:r[6]*1e3,ck:r[7]*1e3,b:r[8]}));
const HB = HH.bills.map(r=>({m:HH.months[r[0]],kho:HH.kho[r[1]],ci:r[2],pi:r[3],c:HCOM[r[4]],b:r[5],ns:r[6]*1e3,ck:r[7]*1e3,l:r[8],o:r[9],s:r[10]}));
const HT = HH.loai_rows.map(r=>({m:HH.months[r[0]],kho:HH.kho[r[1]],ci:r[2],pi:r[3],n:HNHOM[r[4]],loai:HH.loai[r[5]],q:r[6],ns:r[7]*1e3,b:r[8]}));
const hstate = {camp:'', card:'', dim:'kho'};
try { Object.assign(hstate, JSON.parse(localStorage.getItem('cskh-hh')||'{}')); } catch(e){}
const hOkCamp = r => hstate.camp==='' || r.pi===+hstate.camp;
const hOkCard = r => hstate.card==='' || r.ci===+hstate.card;
const hOk = r => okKho(r.kho) && hOkCamp(r) && hOkCard(r);
const HDIM = {kho:'Cửa hàng',model:'Model',tier:'Tier',am:'AM'};
const hDim = kho => { const s=KSM[kho]||{}; return hstate.dim==='kho' ? kho : hstate.dim==='model' ? MODEL_LBL(kModel(kho)) : hstate.dim==='tier' ? (s.tier||'–') : (s.am||'–'); };
const sw = c => `<span style="display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px;background:${c}"></span>`;
function hBreak(Lrows, Brows, keyL, keyB){
  const o={}; const get=k=>o[k]||(o[k]={ns:0,ck:0,b:0,q:{LENS:0,OPT:0,SUN:0,CONTACLENS:0,OTHERS:0},nsn:{LENS:0,OPT:0,SUN:0,CONTACLENS:0,OTHERS:0},com:{}});
  for(const r of Lrows){ const g=get(keyL(r)); g.q[r.n]+=r.q; g.nsn[r.n]+=r.ns; }
  for(const r of Brows){ const g=get(keyB(r)); g.ns+=r.ns; g.ck+=r.ck; g.b+=r.b; g.com[r.c]=(g.com[r.c]||0)+r.b; }
  return o;
}
const H_HEAD=['Doanh số (tr)','% DS','Bill','Bill mua kính','ATV (tr)','Cặp tròng','Gọng','Kính mát','DS tròng (tr)','DS gọng (tr)','DS kính mát (tr)','% gọng + tròng','% chỉ tròng','% chỉ gọng'];
const hRow=(lbl,g,tot,max)=>{ const eye=g.b-(g.com['OTHERS']||0); return [lbl,bar(fmtB(g.ns),max),fmtP(g.ns,tot),fmtN(g.b),fmtN(eye),fmtM(g.b?g.ns/g.b:0),fmtN(g.q.LENS),fmtN(g.q.OPT),fmtN(g.q.SUN),fmtB(g.nsn.LENS),fmtB(g.nsn.OPT),fmtB(g.nsn.SUN),fmtP(g.com['COMPLETE OPTICAL PAIR']||0,eye),fmtP(g.com['LENS ONLY']||0,eye),fmtP(g.com['FRAME ONLY']||0,eye)]; };
const hTot=(o,tot)=>{ const g={ns:0,ck:0,b:0,q:{LENS:0,OPT:0,SUN:0},nsn:{LENS:0,OPT:0,SUN:0},com:{}}; for(const k in o){ const x=o[k]; g.ns+=x.ns; g.b+=x.b; for(const n of ['LENS','OPT','SUN']){ g.q[n]+=x.q[n]; g.nsn[n]+=x.nsn[n]; } for(const c in x.com) g.com[c]=(g.com[c]||0)+x.com[c]; } return hRow('Tổng',g,tot,0).map((v,i)=>i===1?fmtB(g.ns):v); };
LABELS['c-hh-month']=()=>({stackTotals:stackTot(fmtN), datalabels:DL.inside(fmtN,.12)});
LABELS['c-hh-qty']=()=>({datalabels:DL.bar(cmp,{rotation:-90,align:'end',anchor:'end',offset:2,font:{size:9.5,weight:'600'}})});
LABELS['c-hh-com']=()=>({datalabels:DL.inside(fP,.08)});
function renderHH(){
  const pm=periodMonths(), cms=chartMonths().filter(m=>HH.months.includes(m));
  const NC=NHOM_COL(), CC=COM_COL();
  const L=HL.filter(hOk), B=HB.filter(hOk);
  const Lp=L.filter(r=>inPeriod(r.m)), Bp=B.filter(r=>inPeriod(r.m));
  const noData=!pm.some(m=>HH.months.includes(m));
  const byN={}; HNHOM.forEach(n=>byN[n]={q:0,ns:0,ck:0,b:0});
  for(const r of Lp){ const g=byN[r.n]; g.q+=r.q; g.ns+=r.ns; g.ck+=r.ck; g.b+=r.b; }
  const T=Bp.reduce((a,r)=>(a.b+=r.b,a.ns+=r.ns,a.ck+=r.ck,a.l+=r.l,a.o+=r.o,a.s+=r.s,a),{b:0,ns:0,ck:0,l:0,o:0,s:0});
  const byC={}; HCOM.forEach(c=>byC[c]={b:0,ns:0,ck:0,l:0,o:0,s:0});
  for(const r of Bp){ const g=byC[r.c]; g.b+=r.b; g.ns+=r.ns; g.ck+=r.ck; g.l+=r.l; g.o+=r.o; g.s+=r.s; }
  const filt = hstate.camp!==''||hstate.card!=='';
  el('hh-scope').textContent = noData ? 'Kỳ đang chọn chưa có dữ liệu dòng hàng (có từ T10/2025).'
    : (filt ? 'Đang lọc: '+[hstate.camp!==''?'CTKM “'+HH.camps[+hstate.camp]+'”':'', hstate.card!==''?'hạng thẻ '+CARD_LBL(HH.cards[+hstate.card]):''].filter(Boolean).join(' · ') : '');
  const cp=byC['COMPLETE OPTICAL PAIR']||{b:0,ns:0}, lo=byC['LENS ONLY']||{b:0,ns:0,l:0}, fo=byC['FRAME ONLY']||{b:0,ns:0,o:0};
  const eyeB=T.b-((byC['OTHERS']||{}).b||0);   // bill mua kính = trừ bill chỉ có phụ kiện / dịch vụ
  el('hh-kpis').innerHTML=[
    kpi('Doanh số (NetSale)', fmtB(T.ns)+' <small style="font-size:14px;color:var(--fg-3)">tr</small>', fmtN(T.b)+' bill · ATV '+fmtM(T.b?T.ns/T.b:0)+' tr', null, true),
    kpi('Cặp tròng bán ra', fmtN(byN.LENS.q), fmtB(byN.LENS.ns)+' tr · '+fmtP(byN.LENS.ns,T.ns)+' DS · TB '+fmtM(byN.LENS.q?byN.LENS.ns/byN.LENS.q:0)+' tr/cặp', NC.LENS),
    kpi('Gọng bán ra', fmtN(byN.OPT.q), fmtB(byN.OPT.ns)+' tr · '+fmtP(byN.OPT.ns,T.ns)+' DS · TB '+fmtM(byN.OPT.q?byN.OPT.ns/byN.OPT.q:0)+' tr/cái', NC.OPT),
    kpi('Kính mát bán ra', fmtN(byN.SUN.q), fmtB(byN.SUN.ns)+' tr · '+fmtP(byN.SUN.ns,T.ns)+' DS · TB '+fmtM(byN.SUN.q?byN.SUN.ns/byN.SUN.q:0)+' tr/cái', NC.SUN),
    kpi('Gọng + tròng (complete pair)', fmtP(cp.b,eyeB), fmtN(cp.b)+' / '+fmtN(eyeB)+' bill mua kính · '+fmtB(cp.ns)+' tr', CC['COMPLETE OPTICAL PAIR']),
    kpi('Chỉ mua tròng (only lens)', fmtP(lo.b,eyeB), fmtN(lo.b)+' bill · '+fmtN(lo.l)+' cặp · ATV '+fmtM(lo.b?lo.ns/lo.b:0)+' tr', CC['LENS ONLY']),
    kpi('Chỉ mua gọng (only frame)', fmtP(fo.b,eyeB), fmtN(fo.b)+' bill · '+fmtN(fo.o)+' gọng · ATV '+fmtM(fo.b?fo.ns/fo.b:0)+' tr', CC['FRAME ONLY']),
    kpi('Cặp tròng / gọng', byN.OPT.q ? (byN.LENS.q/byN.OPT.q).toLocaleString('vi-VN',{maximumFractionDigits:2}) : '–', 'số cặp tròng bán ra trên mỗi gọng'),
  ].join('');
  // theo tháng
  const lm={}; for(const r of L){ if(!cms.includes(r.m)) continue; const g=lm[r.m+'|'+r.n]||(lm[r.m+'|'+r.n]={q:0,ns:0}); g.q+=r.q; g.ns+=r.ns; }
  const lab=cms.map(mLbl);
  mk('c-hh-month',{type:'bar',data:{labels:lab,datasets:HNHOM.map(n=>barDs(NHOM_LBL[n],cms.map(m=>((lm[m+'|'+n]||{}).ns||0)/1e6),NC[n],{stack:'a'}))},
    options:{plugins:{tooltip:ttB},scales:{x:{stacked:true},y:{stacked:true,ticks:{callback:v=>fmtN(v)+' tr'}}}}});
  legend('lg-hh-month',HNHOM.map(n=>[NHOM_LBL[n],NC[n]]));
  const nl=HNHOM.filter(n=>byN[n].ns>0);
  mk('c-hh-pie',{type:'doughnut',data:{labels:nl.map(n=>NHOM_LBL[n]),datasets:[{data:nl.map(n=>byN[n].ns),backgroundColor:nl.map(n=>NC[n]),borderColor:cssv('--surface'),borderWidth:2,hoverOffset:4}]},
    options:{cutout:'58%',plugins:{datalabels:DL.pie(T.ns||1),tooltip:{callbacks:{label:c=>` ${c.label}: ${fmtB(c.parsed)} tr (${fmtP(c.parsed,T.ns)})`}}}}});
  legend('lg-hh-pie',nl.map(n=>[NHOM_LBL[n]+' '+fmtP(byN[n].ns,T.ns),NC[n]]));
  const Q3=['LENS','OPT','SUN'];
  mk('c-hh-qty',{type:'bar',data:{labels:lab,datasets:Q3.map(n=>barDs(n==='LENS'?'Cặp tròng':NHOM_LBL[n],cms.map(m=>Math.round((lm[m+'|'+n]||{}).q||0)),NC[n],{maxBarThickness:22}))},
    options:{plugins:{tooltip:ttN},scales:{x:{},y:{beginAtZero:true,grace:'12%',ticks:{callback:v=>fmtN(v)}}}}});
  legend('lg-hh-qty',Q3.map(n=>[n==='LENS'?'Cặp tròng':NHOM_LBL[n],NC[n]]));
  const bm={}; for(const r of B){ if(!cms.includes(r.m)) continue; const g=bm[r.m]||(bm[r.m]={t:0}); g[r.c]=(g[r.c]||0)+r.b; g.t+=r.b; }
  const cl=HCOM.filter(c=>B.some(r=>r.c===c&&cms.includes(r.m)));
  mk('c-hh-com',{type:'bar',data:{labels:lab,datasets:cl.map(c=>barDs(COM_LBL[c],cms.map(m=>{const g=bm[m]||{t:0};return pct(g[c]||0,g.t);}),CC[c],{stack:'a'}))},
    options:{plugins:{tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${fP1(c.parsed.y)} (${fmtN((bm[cms[c.dataIndex]]||{})[cl[c.datasetIndex]]||0)} bill)`}}},scales:{x:{stacked:true},y:{stacked:true,max:100,ticks:{callback:v=>v+'%'}}}}});
  legend('lg-hh-com',cl.map(c=>[COM_LBL[c],CC[c]]));
  // bảng nhóm hàng
  const nmax=Math.max(0,...HNHOM.map(n=>byN[n].ns));
  table('t-hh-nhom',['Nhóm hàng','SL bán','Đơn vị','Doanh số (tr)','% DS','Chiết khấu (tr)','%CK','Bill có nhóm','Giá TB / đơn vị (tr)'],
    HNHOM.filter(n=>byN[n].ns||byN[n].q).map(n=>[sw(NC[n])+NHOM_LBL[n],fmtN(byN[n].q),NHOM_UNIT[n],bar(fmtB(byN[n].ns),nmax),fmtP(byN[n].ns,T.ns),fmtB(byN[n].ck),fCK(byN[n].ck,byN[n].ns),fmtN(byN[n].b),fmtM(byN[n].q?byN[n].ns/byN[n].q:0)]),
    ['Tổng','','',fmtB(T.ns),'100%',fmtB(T.ck),fCK(T.ck,T.ns),fmtN(T.b),'']);
  // bảng giỏ hàng
  const cmax=Math.max(0,...HCOM.map(c=>byC[c].b));
  table('t-hh-com',['Loại giỏ hàng','Bill','% bill','% bill mua kính','Doanh số (tr)','% DS','ATV (tr)','%CK','Cặp tròng','Gọng','Kính mát'],
    HCOM.filter(c=>byC[c].b).map(c=>{const g=byC[c];return [sw(CC[c])+COM_LBL[c],bar(fmtN(g.b),cmax),fmtP(g.b,T.b),c==='OTHERS'?'–':fmtP(g.b,eyeB),fmtB(g.ns),fmtP(g.ns,T.ns),fmtM(g.b?g.ns/g.b:0),fCK(g.ck,g.ns),fmtN(g.l),fmtN(g.o),fmtN(g.s)];}),
    ['Tổng',fmtN(T.b),'100%',fmtN(eyeB)+' bill kính',fmtB(T.ns),'100%',fmtM(T.b?T.ns/T.b:0),fCK(T.ck,T.ns),fmtN(T.l),fmtN(T.o),fmtN(T.s)]);
  // theo hạng thẻ (không áp bộ lọc hạng thẻ)
  const Lc=HL.filter(r=>okKho(r.kho)&&inPeriod(r.m)&&hOkCamp(r)), Bc=HB.filter(r=>okKho(r.kho)&&inPeriod(r.m)&&hOkCamp(r));
  const oc=hBreak(Lc,Bc,r=>r.ci,r=>r.ci); const tc=Object.values(oc).reduce((a,g)=>a+g.ns,0), mc=Math.max(0,...Object.values(oc).map(g=>g.ns));
  const CCo=CARD_COL();
  table('t-hh-card',['Hạng thẻ',...H_HEAD], HH.cards.map((c,i)=>oc[i]?hRow(sw(CCo[c]||cssv('--t6'))+CARD_LBL(c),oc[i],tc,mc):null).filter(Boolean), hTot(oc,tc));
  // theo CTKM (không áp bộ lọc CTKM)
  const Lk=HL.filter(r=>okKho(r.kho)&&inPeriod(r.m)&&hOkCard(r)), Bk=HB.filter(r=>okKho(r.kho)&&inPeriod(r.m)&&hOkCard(r));
  const ok=hBreak(Lk,Bk,r=>r.pi,r=>r.pi); const tk=Object.values(ok).reduce((a,g)=>a+g.ns,0);
  const kl=Object.entries(ok).sort((a,b)=>b[1].ns-a[1].ns).slice(0,25); const mk2=kl.length?kl[0][1].ns:0;
  table('t-hh-camp',['CTKM / chiến dịch',...H_HEAD], kl.map(([p,g])=>hRow(`<span class="nm" style="min-width:200px">${HH.camps[+p]}</span>`,g,tk,mk2)), hTot(ok,tk));
  // theo cửa hàng / model / tier / AM
  const od=hBreak(Lp,Bp,r=>hDim(r.kho),r=>hDim(r.kho)); const td=Object.values(od).reduce((a,g)=>a+g.ns,0);
  const dl=Object.entries(od).sort((a,b)=>b[1].ns-a[1].ns); const md=dl.length?dl[0][1].ns:0;
  const dimLbl = k => hstate.dim==='kho' ? k+(KSM[k]?` <span class="tag">${MODEL_LBL(kModel(k))}</span>`:'') : k;
  table('t-hh-dim',[HDIM[hstate.dim],...H_HEAD], dl.map(([k,g])=>hRow(dimLbl(k),g,td,md)), hTot(od,td));
  // loại hàng bán chạy
  const Tp=HT.filter(r=>hOk(r)&&inPeriod(r.m)); const tl={};
  for(const r of Tp){ const g=tl[r.n+'|'+r.loai]||(tl[r.n+'|'+r.loai]={n:r.n,loai:r.loai,q:0,ns:0,b:0}); g.q+=r.q; g.ns+=r.ns; g.b+=r.b; }
  const tlN={}; HNHOM.forEach(n=>tlN[n]=byN[n].ns);
  const rows=[]; for(const n of HNHOM){ Object.values(tl).filter(g=>g.n===n).sort((a,b)=>b.ns-a.ns).slice(0,10).forEach((g,i)=>rows.push([i?'':sw(NC[n])+NHOM_LBL[n],`<span class="nm" style="min-width:200px">${g.loai}</span>`,fmtN(g.q),NHOM_UNIT[n],fmtB(g.ns),fmtP(g.ns,tlN[n]),fmtN(g.b),fmtM(g.q?g.ns/g.q:0)])); }
  table('t-hh-loai',['Nhóm','Loại hàng','SL bán','Đơn vị','Doanh số (tr)','% DS nhóm','Bill','Giá TB / đơn vị (tr)'],rows);
  el('hh-note').textContent = `Dữ liệu dòng hàng ${HH.months.length?mLbl(HH.months[0])+' → '+mLbl(HH.months[HH.months.length-1]):'–'} · ${fmtN(HH.dropped_zero_bills||0)} bill chỉ có dòng OTHERS 0đ đã bỏ · cột Commodity (ERP) có ở ${fP1(100*(HH.com_erp_share||0))} bill, khớp với suy luận từ nhóm hàng ${HH.com_agree!=null?fP1(100*HH.com_agree):'–'}.`;
}
function initHH(){
  el('fCampH').innerHTML='<option value="">Tất cả CTKM</option>'+HH.camps.map((c,i)=>`<option value="${i}">${c}</option>`).join('');
  el('fCardH').innerHTML='<option value="">Tất cả hạng thẻ</option>'+HH.cards.map((c,i)=>`<option value="${i}">${CARD_LBL(c)}</option>`).join('');
  if (hstate.camp!=='' && !HH.camps[+hstate.camp]) hstate.camp=''; if (hstate.card!=='' && !HH.cards[+hstate.card]) hstate.card=''; if(!HDIM[hstate.dim]) hstate.dim='kho';
  el('fCampH').value=hstate.camp; el('fCardH').value=hstate.card;
  const save=()=>{ try{localStorage.setItem('cskh-hh',JSON.stringify(hstate));}catch(e){} };
  for (const [id,key] of [['fCampH','camp'],['fCardH','card']]) el(id).addEventListener('change',()=>{ hstate[key]=el(id).value; save(); render(); });
  el('hh-dim').innerHTML=Object.entries(HDIM).map(([k,l])=>`<button class="dchip" data-d="${k}" aria-pressed="${hstate.dim===k}">${l}</button>`).join('');
  el('hh-dim').querySelectorAll('.dchip').forEach(b=>b.addEventListener('click',()=>{ hstate.dim=b.dataset.d; el('hh-dim').querySelectorAll('.dchip').forEach(x=>x.setAttribute('aria-pressed',x.dataset.d===hstate.dim)); save(); render(); }));
}
initHH();

/* ================= XNBH — BNR & xác nhận bảo hành ================= */
const X = D.xnbh || {rows:[],months:[],stores:{},mode:{},mism:{},bad:{},src:''};
const XSM = X.stores || {};
const xAgg = () => ({kh:0,sets:0,xnb:0,xno:0,npsb:0,npso:0,mism:0,rows:0});
function xSum(list){ const t=xAgg(); for(const r of list) for(const k in t) t[k]+=r[k]||0; return t; }
const xOK = r => (!state.store || r.kho===state.store) && (!r.model || state.models.has(r.model) || !MODELS.includes(r.model));
const xProf = (kho,f) => (XSM[kho]||{})[f] || '–';
const xRate = t => t.kh ? 100*t.xnb/t.kh : 0;
const xSkip = v => !v || v==='–' || v==='Online' || v==='ZNS_CTA';
/* Nhóm địa lý — là giả thuyết phân tích theo vị trí cửa hàng, KHÔNG phải cột dữ liệu:
   lõi du lịch Q1 (227 Đồng Khởi, 230 Diamond, 218 Landmark) + khu người nước ngoài sinh sống (117 Estella, 106 Vivo) */
const X_INTL  = new Set(['227','230','218','117','106']);
const X_NORTH = new Set(['Hà Nội','Nghệ An','Đà Nẵng']);
const X_GEO   = ['Tỉnh/thành khác','TPHCM ngoài lõi du lịch','Lõi du lịch Q1 + khu người nước ngoài','Cụm Bắc & Trung'];
function xGeo(kho){ const kv=xProf(kho,'khuvuc'); if (X_INTL.has(storeCode(kho))) return X_GEO[2]; if (xSkip(kv)) return ''; if (X_NORTH.has(kv)) return X_GEO[3]; return kv==='TPHCM' ? X_GEO[1] : X_GEO[0]; }
const fD = v => (v>0?'+':'')+(+v).toLocaleString('vi-VN',{maximumFractionDigits:1,minimumFractionDigits:1});
const xDelta = (d, unit=' điểm') => d==null ? '–' : `<span class="${d>=0?'dpos':'dneg'}">${d>=0?'▲':'▼'} ${fD(d)}${unit}</span>`;
const xCut = (rows, keyFn) => { const o={}; for(const r of rows){ const k=keyFn(r); if(xSkip(k)) continue; const g=o[k]||(o[k]=xAgg()); for(const kk in g) g[kk]+=r[kk]||0; } return o; };
const xFrac = (a,b) => fmtN(a)+' / '+fmtN(b);
const xList = arr => arr.join(', ');

function renderXNBH(){
  const S1=cssv('--s1'), S3=cssv('--s3'), GREY=cssv('--t6'), ACC=cssv('--accent'), BAD=cssv('--bad');
  const all = X.rows.filter(xOK);
  let   pm  = X.months.filter(inPeriod), fallback = false;
  if (!pm.length && X.months.length){ pm = [X.months[X.months.length-1]]; fallback = true; }   // kỳ chọn chưa có file BNR -> hiện tháng gần nhất có dữ liệu
  let   ms  = X.months.filter(inChart); if (!ms.length) ms = X.months.slice(-12);
  const cur = all.filter(r=>pm.includes(r.month));
  const plab = fallback ? mLbl(pm[0]) : periodLabel();
  const T   = xSum(cur);
  const byM = {}; for(const r of all){ const g=byM[r.month]||(byM[r.month]=xAgg()); for(const k in g) g[k]+=r[k]||0; }
  const G = m => byM[m] || xAgg();

  if (!X.rows.length || !pm.length){
    el('xn-kpis').innerHTML = '';
    el('xn-warn').innerHTML = '<b>Chưa có dữ liệu BNR cho kỳ này.</b> Dữ liệu XNBH hiện có từ ' + (X.months[0]||'–') + ' đến ' + (X.months[X.months.length-1]||'–') + '.';
    el('xn-notes').innerHTML = ''; el('xn-notes-ctx').textContent = '';
    ['t-xn-mom','t-xn-move','xn-am','t-xn-store','t-xn-month'].forEach(i=>el(i).innerHTML='<div class="empty">Không có dữ liệu cho kỳ này</div>');
    ['c-xn-month','c-xn-pie','c-xn-tier'].forEach(i=>{ if(charts[i]){charts[i].destroy(); delete charts[i];} });
    el('xn-src').textContent = X.src || '–';
    return;
  }

  /* ---- tháng gần nhất trong kỳ (mC) và tháng liền trước (mP) để so sánh diễn biến ---- */
  const mC = pm[pm.length-1], iC = X.months.indexOf(mC), mP = iC>0 ? X.months[iC-1] : null;
  const RC = all.filter(r=>r.month===mC), RP = mP ? all.filter(r=>r.month===mP) : [];
  const TC = xSum(RC), TP = xSum(RP);
  const avg = xRate(T), lowAvg = avg - 2;   // ngưỡng tô đỏ: kém TB từ 2 điểm %
  const cmpOK = !!(mP && TP.kh && TC.kh);
  const dRate = cmpOK ? xRate(TC)-xRate(TP) : null;
  const perKh = t => t.kh ? (t.sets/t.kh).toLocaleString('vi-VN',{maximumFractionDigits:2}) : '–';

  el('xn-kpis').innerHTML = [
    kpi('Tỷ lệ XNBH / KH nhận BNR', fP1(avg), xFrac(T.xnb,T.kh)+' KH nhận BNR' + (dRate!=null ? ' · <span style="color:var(--accent-yellow);font-weight:700">'+(dRate>=0?'▲':'▼')+' '+fD(dRate)+' điểm</span> '+mLbl(mC)+' so với '+mLbl(mP) : ''), null, true),
    kpi('KH nhận BNR', fmtN(T.kh), plab+' · TB '+fmtN(pm.length?T.kh/pm.length:0)+'/tháng', S1),
    kpi('Số BNR đã tặng', fmtN(T.sets), perKh(T)+' bộ / khách'),
    kpi('Lượt XNBH / NPS', fmtN(T.xnb+T.xno), fmtN(T.xno)+' lượt không kèm BNR', S3),
    kpi('KH nhận BNR chưa XNBH', fmtN(T.kh-T.xnb), fP1(T.kh?100*(T.kh-T.xnb)/T.kh:0)+' — dư địa khai thác', GREY),
  ].join('');

  const grantMs = pm.filter(m=>(X.mode[m]||'flag')==='grant');
  const mismT   = pm.reduce((a,m)=>a+((X.mism||{})[m]||0),0);
  const badT    = pm.reduce((a,m)=>a+((X.bad ||{})[m]||0),0);
  el('xn-warn').innerHTML = (fallback ? '<b>Kỳ '+periodLabel()+' chưa có dữ liệu BNR</b> — đang hiển thị '+mLbl(pm[0])+', tháng gần nhất có file. ' : '') + (grantMs.length
    ? '<b>Cảnh báo cách ghi dữ liệu — '+grantMs.map(mLbl).join(', ')+'.</b> Trong (các) tháng này mọi dòng có SL KH đều mang XNBH = Yes, nên cột XNBH chỉ lặp lại việc “có nhận BNR hay không” và <b>không cho biết ai đã xác nhận bảo hành</b>. Tỷ lệ của các tháng đó sẽ đội lên gần 100% — cần sửa file nguồn trước khi dùng con số này.'
    : mismT
    ? '<b>Cột XNBH và cột NPS đang lệch nhau ở '+fmtN(mismT)+' dòng</b> trong kỳ này. Báo cáo lấy cột XNBH làm chuẩn; nên rà lại file nguồn để hai cột khớp.'
    : 'Cột <b>XNBH</b> và cột <b>NPS</b> khớp nhau hoàn toàn trong kỳ này ('+fmtN(T.xnb+T.xno)+' lượt) nên hai chỉ số báo cáo chung. <b>'+fmtN(T.xno)+'</b> lượt đến từ khách không nhận BNR — không nằm trong mẫu số của tỷ lệ.')
    + (badT ? ' <b>'+fmtN(badT)+' dòng</b> trong kỳ có Tier / Khu vực / AM lệch với chính cửa hàng đó (file nguồn điền sai); báo cáo dùng giá trị phổ biến nhất của từng cửa hàng nên số theo AM / khu vực / tier vẫn đúng, nhưng nên sửa file.' : '');

  /* ---- chart theo tháng + cơ cấu ---- */
  const lbl = ms.map(mLbl);
  mk('c-xn-month',{data:{labels:lbl,datasets:[
      barDs('KH nhận BNR',ms.map(m=>G(m).kh),S1,{borderWidth:0,yAxisID:'y'}),
      barDs('Đã XNBH',ms.map(m=>G(m).xnb),S3,{borderWidth:0,yAxisID:'y'}),
      lineDs('% đã XNBH',ms.map(m=>xRate(G(m))),ACC,{yAxisID:'y1'})]},
    options:{plugins:{tooltip:{callbacks:{label:c=>c.dataset.type==='line'?` ${c.dataset.label}: ${c.parsed.y.toLocaleString('vi-VN',{maximumFractionDigits:1})}%`:` ${c.dataset.label}: ${fmtN(c.parsed.y)}`}}},
      scales:{x:{},y:{beginAtZero:true,ticks:{callback:v=>fmtN(v)}},y1:{position:'right',beginAtZero:true,max:100,grid:{display:false},ticks:{callback:v=>v+'%'}}}}});
  legend('lg-xn',[['KH nhận BNR',S1],['Trong đó đã XNBH',S3],['% KH nhận BNR đã XNBH',ACC]]);

  mk('c-xn-pie',{type:'doughnut',data:{labels:['XNBH kèm BNR','XNBH không kèm BNR'],datasets:[{data:[T.xnb,T.xno],backgroundColor:[S3,GREY],borderColor:cssv('--surface'),borderWidth:2}]},
    options:{cutout:'58%',plugins:{tooltip:{callbacks:{label:c=>` ${c.label}: ${fmtN(c.parsed)} (${fmtP(c.parsed,T.xnb+T.xno)})`}}}}});
  legend('lg-xn-pie',[['XNBH kèm BNR',S3],['XNBH không kèm BNR',GREY]]);

  /* ---- các lát cắt của tháng gần nhất & tháng trước ---- */
  const cutC = {am:xCut(RC,r=>xProf(r.kho,'am')), tier:xCut(RC,r=>xProf(r.kho,'tier')), geo:xCut(RC,r=>xGeo(r.kho)), st:xCut(RC,r=>r.kho)};
  const cutP = {am:xCut(RP,r=>xProf(r.kho,'am')), tier:xCut(RP,r=>xProf(r.kho,'tier')), geo:xCut(RP,r=>xGeo(r.kho)), st:xCut(RP,r=>r.kho)};
  const rateOr = (o,k) => (o[k]&&o[k].kh) ? xRate(o[k]) : null;
  const amKeys  = Object.keys(cutC.am).sort((a,b)=>xRate(cutC.am[b])-xRate(cutC.am[a]));
  const tierKeys= ['Platinum','Gold','Silver'].filter(k=>cutC.tier[k]&&cutC.tier[k].kh);
  const geoKeys = X_GEO.filter(k=>cutC.geo[k]&&cutC.geo[k].kh);

  /* Diễn biến so với tháng trước */
  if (cmpOK){
    const line = (lbl,c,p) => { const rc=c&&c.kh?xRate(c):null, rp=p&&p.kh?xRate(p):null;
      return [lbl, rp==null?'–':fP1(rp), rc==null?'–':'<b>'+fP1(rc)+'</b>', (rc!=null&&rp!=null)?xDelta(rc-rp,''):'–', c?xFrac(c.xnb,c.kh):'–']; };
    const sec = t => [`<span class="tag">${t}</span>`,'','','',''];
    const rows = [line('<b>'+(state.store||'Toàn hệ thống')+'</b>',TC,TP), sec('Theo AM')];
    amKeys.forEach(k=>rows.push(line('AM '+k,cutC.am[k],cutP.am[k])));
    rows.push(sec('Theo tier')); tierKeys.forEach(k=>rows.push(line(k,cutC.tier[k],cutP.tier[k])));
    rows.push(sec('Theo nhóm địa lý')); geoKeys.forEach(k=>rows.push(line(k,cutC.geo[k],cutP.geo[k])));
    table('t-xn-mom',['Nhóm',mLbl(mP),mLbl(mC),'Thay đổi (điểm %)','XNBH / KH '+mLbl(mC)],rows);
  } else el('t-xn-mom').innerHTML = '<div class="empty">Chưa có tháng liền trước để so sánh</div>';

  /* Biến động mạnh nhất theo cửa hàng (≥15 KH ở cả hai tháng) */
  const movers = cmpOK ? Object.keys(cutC.st).filter(k=>!xSkip(xProf(k,'am')) && cutC.st[k].kh>=15 && (cutP.st[k]||{}).kh>=15)
    .map(k=>({kho:k,c:cutC.st[k],p:cutP.st[k],d:xRate(cutC.st[k])-xRate(cutP.st[k])})).sort((a,b)=>b.d-a.d) : [];
  const up5 = movers.filter(x=>x.d>0).slice(0,5), dn5 = movers.filter(x=>x.d<0).slice(-5).reverse();
  if (movers.length){
    const mrow = x => [x.kho, xProf(x.kho,'am'), fP1(xRate(x.p)), '<b>'+fP1(xRate(x.c))+'</b>', xDelta(x.d,''), xFrac(x.c.xnb,x.c.kh)];
    const rows = [];
    if (up5.length){ rows.push([`<span class="tag">Tăng mạnh nhất</span>`,'','','','','']); up5.forEach(x=>rows.push(mrow(x))); }
    if (dn5.length){ rows.push([`<span class="tag">Giảm mạnh nhất</span>`,'','','','','']); dn5.forEach(x=>rows.push(mrow(x))); }
    table('t-xn-move',['Cửa hàng','AM',mLbl(mP),mLbl(mC),'Thay đổi (điểm %)','XNBH / KH '+mLbl(mC)],rows);
  } else el('t-xn-move').innerHTML = '<div class="empty">'+(cmpOK?'Không có cửa hàng nào đủ 15 KH ở cả hai tháng':'Chưa có tháng liền trước để so sánh')+'</div>';

  /* Theo AM phụ trách — cả kỳ đang chọn */
  const amG = xCut(cur,r=>xProf(r.kho,'am')), stG = xCut(cur,r=>r.kho);
  const amAll = Object.keys(amG).filter(k=>amG[k].kh).sort((a,b)=>xRate(amG[a])-xRate(amG[b]));   // thấp nhất xếp trên
  const amInfo = {};
  amAll.forEach(am => { const st=Object.keys(stG).filter(k=>xProf(k,'am')===am && stG[k].kh);
    const bad=st.filter(k=>xRate(stG[k])<25).sort((a,b)=>xRate(stG[a])-xRate(stG[b]));
    amInfo[am]={st,bad,badKh:bad.reduce((a,k)=>a+stG[k].kh,0),good:st.filter(k=>xRate(stG[k])>=avg).length}; });
  el('xn-am').innerHTML = amAll.map((am,i)=>{ const a=amInfo[am]; return `<div class="amcard${i===0&&amAll.length>1?' flag':''}">
      <div class="amtop"><div><b>AM ${am}</b><div class="note">${a.st.length} CH · ${fmtN(amG[am].kh)} KH nhận BNR · ${a.good}/${a.st.length} CH đạt từ TB trở lên</div></div><div class="ambig">${fP1(xRate(amG[am]))}</div></div>
      <div class="note"><b>${a.bad.length} CH dưới 25%</b> · ${fmtN(a.badKh)} KH (${fP1(amG[am].kh?100*a.badKh/amG[am].kh:0)} lượng khách của AM)</div>
      ${a.bad.length ? '<div class="amlist">'+a.bad.map(k=>`<span>${k} <b>${fP1(xRate(stG[k]))}</b> <small>${xFrac(stG[k].xnb,stG[k].kh)}</small></span>`).join('')+'</div>' : ''}
    </div>`; }).join('') || '<div class="empty">Không có dữ liệu</div>';

  /* Tier & khu vực — kỳ đang chọn */
  const tierG = xCut(cur,r=>xProf(r.kho,'tier')), areaG = xCut(cur,r=>xProf(r.kho,'khuvuc'));
  const TK = ['Platinum','Gold','Silver'].filter(k=>tierG[k]&&tierG[k].kh);
  const AK = Object.keys(areaG).filter(k=>areaG[k].kh).sort((a,b)=>areaG[b].kh-areaG[a].kh).slice(0,6);
  const tLbl = [...TK.map(k=>'Tier: '+k), ...AK.map(k=>'KV: '+k)];
  const tVal = [...TK.map(k=>xRate(tierG[k])), ...AK.map(k=>xRate(areaG[k]))];
  const tG   = [...TK.map(k=>tierG[k]), ...AK.map(k=>areaG[k])];
  mk('c-xn-tier',{type:'bar',data:{labels:tLbl,datasets:[barDs('% đã XNBH',tVal,tLbl.map((l,i)=>l.startsWith('Tier')?ACC:(tVal[i]>=lowAvg?S3:BAD)),{borderWidth:0,maxBarThickness:18})]},
    options:{indexAxis:'y',plugins:{tooltip:{callbacks:{label:c=>` ${xFrac(tG[c.dataIndex].xnb,tG[c.dataIndex].kh)} KH · ${c.parsed.x.toFixed(1)}%`}}},scales:{x:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%'}},y:{ticks:{autoSkip:false,font:{size:10.5}}}}}});

  /* Bảng theo cửa hàng */
  const srow = Object.entries(stG).sort((a,b)=>b[1].kh-a[1].kh);
  const smax = srow.length? srow[0][1].kh : 0;
  const pillX = g => { const p=xRate(g); return (p>=avg ? '<span class="pill ok">Trên TB</span>' : p>=avg/2 ? '<span class="pill mid">Dưới TB</span>' : '<span class="pill no">Rất thấp</span>') + (g.kh<30 ? ' <span class="tag" title="Dưới 30 KH nhận BNR — tỷ lệ dễ biến động">mẫu nhỏ</span>' : ''); };
  table('t-xn-store',['Cửa hàng','Tier','Khu vực','AM','KH nhận BNR','BNR tặng','BNR/KH','Đã XNBH','% đã XNBH','So với TB (điểm %)','XNBH lẻ','Đánh giá'],
    srow.map(([kho,g])=>[kho,xProf(kho,'tier'),xProf(kho,'khuvuc'),xProf(kho,'am'),bar(fmtN(g.kh),smax),fmtN(g.sets),perKh(g),fmtN(g.xnb),g.kh?'<b>'+fP1(xRate(g))+'</b>':'–',g.kh?xDelta(xRate(g)-avg,''):'–',fmtN(g.xno),g.kh?pillX(g):'–']),
    ['Tổng '+srow.length+' CH','','','',fmtN(T.kh),fmtN(T.sets),perKh(T),fmtN(T.xnb),fP1(avg),'',fmtN(T.xno),'']);

  /* Bảng theo tháng */
  const allM = X.months.filter(m=>byM[m]);
  const Ta = xSum(all);
  table('t-xn-month',['Tháng','KH nhận BNR','BNR tặng','BNR/KH','Đã XNBH','% đã XNBH','So với tháng trước','XNBH không kèm BNR','XNBH lệch NPS','Tier/KV/AM lệch'],
    allM.map((m,i)=>{const g=byM[m], p=i?byM[allM[i-1]]:null; return [mLbl(m)+(X.mode[m]==='grant'?' <span class="pill no">cột XNBH không dùng được</span>':''),fmtN(g.kh),fmtN(g.sets),perKh(g),fmtN(g.xnb),g.kh?'<b>'+fP1(xRate(g))+'</b>':'–',(g.kh&&p&&p.kh)?xDelta(xRate(g)-xRate(p),''):'–',fmtN(g.xno),fmtN((X.mism||{})[m]||0),fmtN((X.bad||{})[m]||0)];}),
    ['Tổng '+allM.length+' tháng',fmtN(Ta.kh),fmtN(Ta.sets),perKh(Ta),fmtN(Ta.xnb),fP1(xRate(Ta)),'',fmtN(Ta.xno),fmtN(Ta.mism),fmtN(allM.reduce((a,m)=>a+((X.bad||{})[m]||0),0))]);

  /* ---- Đọc nhanh: nhận định tự sinh từ số liệu ---- */
  const notes = [];
  const nSt = srow.filter(([k,g])=>g.kh).length, above = srow.filter(([k,g])=>g.kh && xRate(g)>=avg).length;
  notes.push(`<b>${plab}</b>: ${fmtN(T.kh)} KH nhận BNR, ${fmtN(T.sets)} BNR (${perKh(T)} BNR/KH), tỷ lệ XNBH <b>${fP1(avg)}</b>. ${above}/${nSt} cửa hàng đạt từ mức TB trở lên; ${fmtN(T.kh-T.xnb)} KH nhận BNR chưa XNBH là dư địa khai thác.`);
  if (cmpOK){
    const amTxt = amKeys.map(k=>{const rc=rateOr(cutC.am,k), rp=rateOr(cutP.am,k); return rc!=null&&rp!=null ? `AM ${k} ${fP1(rp)} → <b>${fP1(rc)}</b> (${fD(rc-rp)})` : null;}).filter(Boolean);
    let s = `<b>So với ${mLbl(mP)}</b>: ${state.store||'toàn hệ thống'} ${fP1(xRate(TP))} → <b>${fP1(xRate(TC))}</b> (${fD(dRate)} điểm)` + (amTxt.length ? '; ' + xList(amTxt) : '') + '.';
    if (up5.length && dn5.length){
      const big = Math.max(up5[0].d, -dn5[0].d);
      s += ` Ở cấp cửa hàng: ${up5[0].kho} ${fD(up5[0].d)} điểm, ${dn5[0].kho} ${fD(dn5[0].d)} điểm` + (big>=30
        ? ` chỉ trong một tháng, cùng tệp khách — <b>biên độ này cho thấy chỉ số phụ thuộc việc nhân viên có làm bước XNBH hay không, không phải đặc điểm khách hàng</b>.`
        : ` — biến động theo cửa hàng ở mức vừa phải.`);
    }
    notes.push(s);
  }
  if (tierKeys.length>1){
    const ordC = tierKeys.slice().sort((a,b)=>xRate(cutC.tier[b])-xRate(cutC.tier[a]));
    let s = `<b>Theo tier ${mLbl(mC)}</b>: ` + xList(ordC.map(k=>`${k} ${fP1(xRate(cutC.tier[k]))}`)) + '.';
    if (cmpOK && tierKeys.every(k=>cutP.tier[k]&&cutP.tier[k].kh)){
      const ordP = tierKeys.slice().sort((a,b)=>xRate(cutP.tier[b])-xRate(cutP.tier[a]));
      s += ordC.join('>')!==ordP.join('>')
        ? ` Trật tự đã đổi so với ${mLbl(mP)} (${xList(ordP.map(k=>`${k} ${fP1(xRate(cutP.tier[k]))}`))}) — đặc điểm cấu trúc của tier không đổi trong một tháng, nên <b>chênh lệch giữa các tier không đến từ tier hay tệp khách mà từ cách vận hành ở từng cửa hàng</b>.`
        : ` Thứ tự giữ nguyên so với ${mLbl(mP)}.`;
    }
    notes.push(s);
  }
  if (cutC.geo[X_GEO[2]] && cutC.geo[X_GEO[1]]){
    const iC2=xRate(cutC.geo[X_GEO[2]]), hC=xRate(cutC.geo[X_GEO[1]]), gap=hC-iC2;
    const iP=rateOr(cutP.geo,X_GEO[2]), hP=rateOr(cutP.geo,X_GEO[1]);
    let s = `<b>Giả thuyết “khách quốc tế / người nước ngoài khó xin thông tin để XNBH”</b> (5 CH: 227 Đồng Khởi, 230 Diamond, 218 Landmark, 117 Estella, 106 Vivo): nhóm này ${fP1(iC2)} so với TPHCM ngoài lõi ${fP1(hC)}` + (iP!=null&&hP!=null ? ` (${mLbl(mP)}: ${fP1(iP)} so với ${fP1(hP)})` : '') + '. ';
    s += gap < 10
      ? 'Chênh lệch nhỏ — <b>giả thuyết không được dữ liệu ủng hộ</b>; nguyên nhân là vận hành ở từng cửa hàng.'
      : `Nhóm này vẫn thấp hơn ${fD(gap)} điểm — chỉ giữ giả thuyết ở phạm vi hẹp và phải kiểm chứng bằng ghi nhận thực tế tại cửa hàng.`;
    const low = Object.keys(cutC.st).filter(k=>X_INTL.has(storeCode(k)) && cutC.st[k].kh>=15 && xRate(cutC.st[k])<25).map(k=>`${k} ${fP1(xRate(cutC.st[k]))}`);
    if (low.length) s += ` Riêng ${xList(low)} vẫn ở đáy.`;
    if (cutC.geo[X_GEO[3]]){ const nC=xRate(cutC.geo[X_GEO[3]]), nP=rateOr(cutP.geo,X_GEO[3]); const lowest = geoKeys.every(k=>xRate(cutC.geo[k])>=nC);
      s += ` Cụm Bắc & Trung ${nP!=null?fP1(nP)+' → ':''}<b>${fP1(nC)}</b>` + (lowest ? ' — thấp nhất hệ thống, là vấn đề riêng, không liên quan khách nước ngoài.' : '.'); }
    notes.push(s);
  }
  if (amAll.length){
    const lo = amAll[0], hi = amAll[amAll.length-1], gapAM = xRate(amG[hi])-xRate(amG[lo]);
    let s = amAll.length<2 ? '' : (gapAM<3)
      ? `<b>Hai AM ngang nhau</b>: ${xList(amAll.map(k=>`AM ${k} ${fP1(xRate(amG[k]))}`))}.`
      : `<b>AM cần lưu ý: ${lo}</b> — tỷ lệ thấp nhất (${fP1(xRate(amG[lo]))}` + (amAll.length>1 ? `, kém AM ${hi} ${f1(gapAM)} điểm` : '') + ').';
    amAll.filter(k=>amInfo[k].bad.length).forEach(k=>{ const a=amInfo[k]; s += ` AM ${k} có <b>${a.bad.length} CH dưới 25%</b> (${fmtN(a.badKh)} KH, ${fP1(amG[k].kh?100*a.badKh/amG[k].kh:0)} lượng khách của AM): ${xList(a.bad.slice(0,5).map(x=>`${x} ${fP1(xRate(stG[x]))}`))}.`; });
    const drops = dn5.filter(x=>x.d<=-15).slice(0,2);
    if (drops.length) s += ` Sụt mạnh nhất: ${xList(drops.map(x=>`${x.kho} (AM ${xProf(x.kho,'am')}) ${fP1(xRate(x.p))} → ${fP1(xRate(x.c))}`))} — sập kiểu này thường do đổi người / đổi ca / bỏ bước quy trình, cần hỏi cửa hàng ngay.`;
    if (cmpOK && amKeys.length>1){ const ordP = amKeys.filter(k=>rateOr(cutP.am,k)!=null).sort((x,y)=>rateOr(cutP.am,x)-rateOr(cutP.am,y));
      if (ordP.length>1 && rateOr(cutP.am,ordP[1])-rateOr(cutP.am,ordP[0])>=3 && ordP[0]!==lo) s += ` ${mLbl(mP)} người cần lưu ý là AM ${ordP[0]} (${fP1(rateOr(cutP.am,ordP[0]))}).`; }
    if (s) notes.push(s);
  }
  if (cmpOK){
    const chronic = Object.keys(cutC.st).filter(k=>!xSkip(xProf(k,'am')) && cutC.st[k].kh>=15 && (cutP.st[k]||{}).kh>=15 && xRate(cutC.st[k])<25 && xRate(cutP.st[k])<25)
      .sort((a,b)=>xRate(cutC.st[a])-xRate(cutC.st[b])).map(k=>`${k} (${fP1(xRate(cutP.st[k]))} → ${fP1(xRate(cutC.st[k]))})`);
    if (chronic.length) notes.push(`<b>Dưới 25% hai tháng liên tiếp</b>: ${xList(chronic)} — không còn là biến động mà là <span class="urgent">tình trạng ổn định ở mức sai</span>, cần xử lý dứt điểm.`);
  }
  const xnoTop = Object.entries(stG).filter(([k,g])=>g.xno).sort((a,b)=>b[1].xno-a[1].xno).slice(0,3).map(([k,g])=>`${k} ${fmtN(g.xno)}`);
  if (T.xno) notes.push(`${fmtN(T.xno)} lượt XNBH không kèm BNR (nhiều nhất: ${xList(xnoTop)}) được tính vào tổng XNBH nhưng không nằm trong mẫu số tỷ lệ.` + (badT ? ` <b>Chất lượng dữ liệu</b>: ${fmtN(badT)} dòng có Tier / Khu vực / AM lệch với cửa hàng — nên sửa ở file nguồn.` : ''));
  el('xn-notes-ctx').textContent = '· ' + plab + (cmpOK ? ' · so với ' + mLbl(mP) : '');
  el('xn-notes').innerHTML = notes.map(t=>`<li>${t}</li>`).join('');

  el('xn-src').textContent = X.src || '–';
}

/* ================= PHẢN HỒI KH ================= */
const FB = D.fb || {rows:[],tags:[]};
LABELS['c-fb-month']=LABELS['c-fb-tag']=LABELS['c-fb-ct']=()=>({stackTotals:stackTot(fmtN)});
const fbst = {ch:'', ct:'', tag:'', sev:'', q:''};
const SEV_LBL = {3:'Nghiêm trọng',2:'Không hài lòng',1:'Góp ý',0:'Chưa có nội dung'};
const fbCode = r => (r.kho||'').slice(0,3);
const fbKho = r => { const s=D.stores.find(x=>x.kho.startsWith(fbCode(r)+'-')); return s?s.kho:r.kho; };
const fbOkStore = r => { if (state.store && fbCode(r)!==storeCode(state.store)) return false; const s=D.stores.find(x=>x.kho.startsWith(fbCode(r)+'-')); return !s || state.models.has(MODELS.includes(s.model)?s.model:'6. Khác'); };
const fbOkSel = r => (!fbst.ch||r.ch===fbst.ch) && (!fbst.ct||r.ct===fbst.ct) && (!fbst.tag||r.tags.includes(fbst.tag)) && (!fbst.sev||String(r.sev)===fbst.sev) && (!fbst.q||(r.note+' '+r.rep+' '+r.kho).toLowerCase().includes(fbst.q.toLowerCase()));
const esc = t => String(t||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function renderFB(){
  const all = FB.rows.filter(r=>fbOkStore(r)&&fbOkSel(r));
  const rows = all.filter(r=>r.m&&inPeriod(r.m));
  const S1=cssv('--s1'), S2=cssv('--s2'), S3=cssv('--s3'), S4=cssv('--s4'), BAD=cssv('--bad'), GREY=cssv('--t6');
  const PAL=[S1,S3,S4,S2,cssv('--t3'),cssv('--t2'),cssv('--t5'),cssv('--s8')];
  // bill trong kỳ để tính tỷ lệ / 10.000 bill
  const billBy={}; let billT=0; const KD=(typeof KDAY!=='undefined')?KDAY:[];
  for(const r of KD){ if(!inPeriod(r.m)) continue; const c=r.kho.slice(0,3); if(state.store&&c!==storeCode(state.store)) continue; if(!state.models.has(kModel(r.kho))) continue; billBy[c]=(billBy[c]||0)+r.b; billT+=r.b; }
  const n=rows.length, sev3=rows.filter(r=>r.sev===3).length, rep=rows.filter(r=>r.cs).length, gg=rows.filter(r=>r.ch==='Google').length;
  const noSt=rows.filter(r=>!r.st).length;
  el('fb-kpis').innerHTML=[
    kpi('Tổng phản hồi', fmtN(n), n? fmtN(new Set(rows.map(fbCode).filter(Boolean)).size)+' cửa hàng bị phản ánh' : 'Không có phản hồi trong kỳ', null, true),
    kpi('Nghiêm trọng', fmtN(sev3), n? fmtP(sev3,n)+' — KH nói bỏ đi / 1 sao / nghi gian lận' : '–', BAD),
    kpi('Đã có phản hồi CS', n? fmtP(rep,n) : '–', fmtN(n-rep)+' phản hồi chưa ghi nội dung CS'+(noSt===n&&n?' · cột Startus đang trống':''), S3),
    kpi('Google review', fmtN(gg), n? fmtP(gg,n)+' — phản ánh công khai' : '–', S4),
    kpi('Phản hồi / 10.000 bill', billT? (1e4*n/billT).toLocaleString('vi-VN',{maximumFractionDigits:1}) : '–', billT? 'trên '+fmtN(billT)+' bill bán trong kỳ' : 'chưa có số bill của kỳ'),
  ].join('');
  // theo tháng × content
  const fbMonths=[...new Set(FB.rows.map(r=>r.m).filter(Boolean))].sort();
  let [pf,pt]=periodRange(); if(state.ptype==='month'||state.ptype==='mtd'){ const y=+pt.slice(0,4), mo=+pt.slice(5)-11; pf = mo>0? mkey(y,mo) : mkey(y-1,mo+12); }
  const ms=[]; if(fbMonths.length){ let a=pf>fbMonths[0]?pf:fbMonths[0]; const b=pt<fbMonths[fbMonths.length-1]?pt:fbMonths[fbMonths.length-1]; while(a<=b){ ms.push(a); let y=+a.slice(0,4), mo=+a.slice(5)+1; if(mo>12){y++;mo=1;} a=mkey(y,mo); } }
  const rowsC = all.filter(r=>ms.includes(r.m));
  const ctCount={}; rowsC.forEach(r=>ctCount[r.ct]=(ctCount[r.ct]||0)+1);
  const cts=Object.entries(ctCount).sort((a,b)=>b[1]-a[1]).map(x=>x[0]); const topCt=cts.slice(0,6); const ctKey=c=>topCt.includes(c)?c:'Khác';
  const keys=topCt.concat(cts.length>6?['Khác']:[]);
  const colCt=k=>k==='Khác'?GREY:PAL[keys.indexOf(k)%PAL.length];
  mk('c-fb-month',{type:'bar',data:{labels:ms.map(mLbl),datasets:keys.map(k=>barDs(k,ms.map(m=>rowsC.filter(r=>r.m===m&&ctKey(r.ct)===k).length),colCt(k),{stack:'s'}))},
    options:{plugins:{tooltip:ttN,datalabels:DL.inside(v=>v||'',.2)},scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true,grace:'10%',ticks:{precision:0}}}}});
  legend('lg-fb',keys.map(k=>[k,colCt(k)]));
  // kênh
  const chC={}; rows.forEach(r=>chC[r.ch]=(chC[r.ch]||0)+1); const chL=Object.entries(chC).sort((a,b)=>b[1]-a[1]);
  mk('c-fb-ch',{type:'doughnut',data:{labels:chL.map(x=>x[0]),datasets:[{data:chL.map(x=>x[1]),backgroundColor:chL.map((x,i)=>PAL[i%PAL.length]),borderColor:cssv('--surface'),borderWidth:2}]},
    options:{cutout:'55%',plugins:{datalabels:DL.pie(n||1),tooltip:{callbacks:{label:c=>` ${c.label}: ${c.parsed} (${fmtP(c.parsed,n)})`}}}}});
  legend('lg-fb-ch',chL.map((x,i)=>[x[0]+' · '+x[1],PAL[i%PAL.length]]));
  // vấn đề cụ thể
  const tg={}; rows.forEach(r=>r.tags.forEach(t=>{ const g=tg[t]||(tg[t]={n:0,s3:0}); g.n++; if(r.sev===3) g.s3++; }));
  const tl=Object.entries(tg).sort((a,b)=>b[1].n-a[1].n); const tagN=tl.reduce((a,x)=>a+x[1].n,0), multi=rows.filter(r=>r.tags.length>1).length, none=rows.filter(r=>!r.tags.length).length;
  el('fb-tag-note').innerHTML = `<b>${fmtN(tagN)} lượt vấn đề</b> trên <b>${fmtN(n)} phản hồi</b>` + (multi?` — ${fmtN(multi)} phản hồi được gắn từ 2 vấn đề trở lên nên tổng lượt lớn hơn số phản hồi`:'') + (none?` · ${fmtN(none)} phản hồi chưa gắn được vấn đề`:'') + ' · tự nhận diện theo từ khoá trong nội dung KH · màu đỏ = phần nghiêm trọng';
  mk('c-fb-tag',{type:'bar',data:{labels:tl.map(x=>x[0]),datasets:[barDs('Nghiêm trọng',tl.map(x=>x[1].s3),BAD,{stack:'s',maxBarThickness:18}),barDs('Khác',tl.map(x=>x[1].n-x[1].s3),S1,{stack:'s',maxBarThickness:18})]},
    options:{indexAxis:'y',plugins:{tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.x}`}},datalabels:DL.inside(v=>v||'',.25)},scales:{x:{stacked:true,beginAtZero:true,ticks:{precision:0}},y:{stacked:true,ticks:{font:{size:10.5}}}}}});
  // content × group
  const grps=[...new Set(rows.map(r=>r.grp))]; const ctL=[...new Set(rows.map(r=>r.ct))].sort((a,b)=>rows.filter(r=>r.ct===b).length-rows.filter(r=>r.ct===a).length);
  const gcol=g=>({'Offline':S1,'Bảo hành':S2,'Online':S3}[g]||GREY);
  mk('c-fb-ct',{type:'bar',data:{labels:ctL,datasets:grps.map(g=>barDs(g,ctL.map(c=>rows.filter(r=>r.ct===c&&r.grp===g).length),gcol(g),{stack:'s',maxBarThickness:18}))},
    options:{indexAxis:'y',plugins:{tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.x}`}},datalabels:DL.inside(v=>v||'',.25)},scales:{x:{stacked:true,beginAtZero:true,ticks:{precision:0}},y:{stacked:true,ticks:{font:{size:10.5}}}}}});
  legend('lg-fb-ct',grps.map(g=>[g,gcol(g)]));
  // cửa hàng
  const st={}; rows.forEach(r=>{ const c=fbCode(r)||'–'; const g=st[c]||(st[c]={kho:fbKho(r)||'(Không ghi CH)',n:0,s3:0,rep:0,tags:{},ch:{}}); g.n++; if(r.sev===3) g.s3++; g.rep+=r.cs; r.tags.forEach(t=>g.tags[t]=(g.tags[t]||0)+1); g.ch[r.ch]=(g.ch[r.ch]||0)+1; });
  const sl=Object.entries(st).sort((a,b)=>b[1].n-a[1].n||b[1].s3-a[1].s3); const smax=sl.length?sl[0][1].n:0;
  const top2=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,2).map(x=>x[0]+' ('+x[1]+')').join(', ');
  table('t-fb-store',['Cửa hàng','Model','AM','Phản hồi','Nghiêm trọng','/10.000 bill','Đã phản hồi CS','Vấn đề chính','Kênh'],
    sl.map(([c,g])=>{ const s=D.stores.find(x=>x.kho.startsWith(c+'-'))||{}; const b=billBy[c]||0; return [g.kho,MODEL_LBL(s.model||''),s.am||'–',bar(fmtN(g.n),smax),g.s3?`<span class="pill sev3">${g.s3}</span>`:'·',b?(1e4*g.n/b).toLocaleString('vi-VN',{maximumFractionDigits:1}):'–',fmtP(g.rep,g.n),`<span class="nm">${top2(g.tags)||'–'}</span>`,top2(g.ch)]; }),
    n?['Tổng','','',fmtN(n),fmtN(sev3),billT?(1e4*n/billT).toLocaleString('vi-VN',{maximumFractionDigits:1}):'–',fmtP(rep,n),'','']:null);
  // chi tiết
  const lst=rows.slice().sort((a,b)=>b.d.localeCompare(a.d));
  const cut=(t,k)=>t.length>k?esc(t.slice(0,k))+'…':esc(t);
  el('t-fb-list').innerHTML = lst.length ? '<table><tr><th>Ngày</th><th>Kênh</th><th>Cửa hàng</th><th>Nội dung</th><th>Mức độ</th><th style="text-align:left">KH phản ánh</th><th style="text-align:left">Phản hồi CS</th></tr>'+
    lst.map(r=>`<tr><td>${r.d?r.d.slice(8)+'/'+r.d.slice(5,7)+'/'+r.d.slice(2,4):'–'}</td><td>${esc(r.ch)}</td><td>${esc(r.kho)}</td><td style="text-align:left;white-space:normal;min-width:150px">${esc(r.ct)}<br>${r.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join(' ')}</td><td><span class="pill sev${r.sev}">${SEV_LBL[r.sev]}</span></td>`+
      `<td class="txt">${r.note? (r.note.length>140?`<details><summary>${cut(r.note,140)}</summary>${esc(r.note)}</details>`:esc(r.note)) : '<i>(trống)</i>'}</td>`+
      `<td class="txt">${r.rep? (r.rep.length>110?`<details><summary>${cut(r.rep,110)}</summary>${esc(r.rep)}</details>`:esc(r.rep)) : '<span class="pill no">Chưa ghi phản hồi</span>'}</td></tr>`).join('')+'</table>'
    : '<div class="empty">Không có phản hồi trong kỳ / bộ lọc này. Dữ liệu phản hồi có từ '+(fbMonths.length?mLbl(fbMonths[0]):'–')+' — thử chọn Kỳ = Năm 2026 hoặc Tất cả.</div>';
  el('fb-list-note').textContent = 'Bấm vào nội dung để xem đầy đủ · SĐT / tên KH đã được che · nguồn: CS report › '+(FB.src||'')+' (cập nhật file '+(FB.mtime||'–')+')';
}
function initFB(){
  const opt=(arr,all)=>'<option value="">'+all+'</option>'+arr.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
  const cnt=k=>{ const o={}; FB.rows.forEach(r=>{ (Array.isArray(r[k])?r[k]:[r[k]]).forEach(v=>o[v]=(o[v]||0)+1); }); return Object.entries(o).sort((a,b)=>b[1]-a[1]).map(x=>x[0]); };
  el('fbCh').innerHTML=opt(cnt('ch'),'Tất cả'); el('fbCt').innerHTML=opt(cnt('ct'),'Tất cả'); el('fbTag').innerHTML=opt(cnt('tags'),'Tất cả');
  for (const [id,k] of [['fbCh','ch'],['fbCt','ct'],['fbTag','tag'],['fbSev','sev']]) el(id).addEventListener('change',()=>{ fbst[k]=el(id).value; render(); });
  let t; el('fbQ').addEventListener('input',()=>{ clearTimeout(t); t=setTimeout(()=>{ fbst.q=el('fbQ').value.trim(); render(); },250); });
}
initFB();

/* ---------- SMS / ZNS ---------- */
const smsSt = { kind:'all' };
const escH = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const dmy = s => s.split('-').reverse().join('/');
const SMS_KIND = [['all','Tất cả'],['bulk','Gửi hàng loạt'],['auto','Luồng tự động (API)']];
const SMS_BK = ['≤6 tháng','6–12 tháng','12–24 tháng','>24 tháng'];
function renderSMS(){
  const S = D.sms;
  if (!S){ el('sms-scope').innerHTML='Chưa có dữ liệu tin nhắn.'; return; }
  const C = S.camps, mt = S.meta, NAVY=cssv('--s1'), YEL=cssv('--s4'), GREY=cssv('--s7');
  el('sms-scope').innerHTML = `Tin gửi <b>${dmy(mt.sms_from)} → ${dmy(mt.sms_to)}</b> · doanh số BC21 đến <b>${dmy(mt.data_end)}</b> · lọc theo <b>tháng gửi tin</b> trong kỳ đang chọn · số liệu cập nhật khi có file tin nhắn mới từ nhà cung cấp.`;
  const okKind = ck => smsSt.kind==='all' || (smsSt.kind==='auto') === C[ck].auto;
  const rows = S.rows.filter(r=>inPeriod(r.m) && okKind(r.ck));
  const T = {tin:0,kh:0,chi:0,ds_u:0,bill_u:0}; rows.forEach(r=>{ for(const k in T) T[k]+=r[k]; });
  const chainRev = D.seg_month.filter(r=>inPeriod(r.month) && r.month>=mt.sms_from.slice(0,7)).reduce((a,r)=>a+r.rev,0);
  el('sms-kpis').innerHTML = [
    kpi('DS mang lại (không trùng)', fmtB(T.ds_u)+' <small style="font-size:14px;color:var(--fg-3)">tr</small>', fmtN(T.bill_u)+' bill'+(chainRev&&smsSt.kind==='all'?' · '+fmtP(T.ds_u,chainRev)+' DS toàn chuỗi':''), null, true),
    kpi('Tin gửi thành công', fmtN(T.tin), periodLabel()),
    kpi('Lượt KH nhận tin', fmtN(T.kh), 'cộng theo chiến dịch / tháng'),
    kpi('Chi phí gửi', fmtB(T.chi)+' <small style="font-size:14px;color:var(--fg-3)">tr</small>', 'theo đơn giá nhà mạng'),
    kpi('DS / 1 đồng chi phí', T.chi? fmtN(T.ds_u/T.chi)+' đ' : '–', 'DS không trùng ÷ chi phí'),
  ].join('');
  // theo tháng gửi
  const ms = months().filter(m=>m>=mt.sms_from.slice(0,7) && m<=mt.sms_to.slice(0,7));
  const byM = (auto) => ms.map(m=>S.rows.filter(r=>r.m===m && C[r.ck].auto===auto && okKind(r.ck)).reduce((a,r)=>a+r.ds_u,0)/1e6);
  mk('c-sms-month',{type:'bar',data:{labels:ms.map(mLbl),datasets:[barDs('Gửi hàng loạt',byM(false),NAVY,{stack:'s',borderWidth:0}),barDs('Luồng tự động',byM(true),YEL,{stack:'s',borderWidth:0})]},
    options:{plugins:{tooltip:ttM},scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true,ticks:{callback:v=>fmtN(v)}}}}});
  TOTALS['c-sms-month']={fmt:v=>fmtN(v)}; charts['c-sms-month'].update();
  legend('lg-sms-month',[['Chiến dịch gửi hàng loạt',NAVY],['Luồng tự động (API)',YEL]]);
  // theo loại tin
  const gt={}; rows.forEach(r=>{ const k=C[r.ck].nhom; gt[k]=(gt[k]||0)+r.ds_u; });
  const tl=Object.entries(gt).sort((a,b)=>b[1]-a[1]);
  mk('c-sms-type',{type:'bar',data:{labels:tl.map(x=>wrapLbl(x[0],22)),datasets:[barDs('DS không trùng',tl.map(x=>x[1]/1e6),NAVY,{borderWidth:0,maxBarThickness:20})]},
    options:{indexAxis:'y',plugins:{tooltip:{callbacks:{label:c=>` ${fmtM(c.parsed.x)} tr`}},datalabels:DL.bar(v=>fmtN(v))},scales:{x:{beginAtZero:true,ticks:{callback:v=>fmtN(v)}},y:{}}}});
  // bảng chiến dịch
  el('sms-kind').innerHTML = SMS_KIND.map(([k,l])=>`<button class="dchip" data-k="${k}" aria-pressed="${smsSt.kind===k}">${l}</button>`).join('');
  el('sms-kind').querySelectorAll('.dchip').forEach(b=>b.onclick=()=>{ smsSt.kind=b.dataset.k; renderSMS(); });
  const g={}; rows.forEach(r=>{ const x=g[r.ck]||(g[r.ck]={tin:0,kh:0,chi:0,bill:0,kh_mua:0,ds:0,ds_ma:0,ds_khac:0,ds_u:0}); for(const k in x) x[k]+=r[k]; });
  const list=Object.entries(g).sort((a,b)=>b[1].ds_u-a[1].ds_u); const mx=list.length?Math.max(...list.map(x=>x[1].ds)):0;
  const TAG={'Mã':'<span class="pill ok">Có mã</span>','Thời gian CT':'<span class="pill mid">Khung CT</span>','CSKH 30 ngày':'<span class="tag">30 ngày</span>'};
  table('t-sms-camp',['Chiến dịch','Cách đo','KH nhận','KH mua','% mua','Bill','DS dùng mã (tr)','DS CT/30N (tr)','Tổng DS (tr)','DS không trùng (tr)','Chi phí (tr)','DS / 1đ CP'],
    list.map(([ck,x])=>{ const c=C[ck]; const sub=(c.auto?'Tự động':c.ngay)+' · '+c.kenh+(c.khung?' · CT '+c.khung:'');
      return [`<span class="nm" title="${escH(c.mau)}"><b>${escH(c.ten)}</b><br><small style="color:var(--fg-3)">${escH(sub)}${c.du||c.auto?'':' · <b style="color:var(--bad)">chưa đủ kỳ đo</b>'}</small></span>`,
        TAG[c.rule]||c.rule, fmtN(x.kh), fmtN(x.kh_mua), fmtP(x.kh_mua,x.kh), fmtN(x.bill), fmtB(x.ds_ma), fmtB(x.ds_khac), bar(fmtB(x.ds),mx), fmtB(x.ds_u), fmtM(x.chi), x.chi? fmtN(x.ds/x.chi)+' đ':'–']; }),
    ['Tổng '+list.length+' chiến dịch','',fmtN(T.kh),'','','',fmtB(list.reduce((a,x)=>a+x[1].ds_ma,0)),fmtB(list.reduce((a,x)=>a+x[1].ds_khac,0)),fmtB(list.reduce((a,x)=>a+x[1].ds,0)),fmtB(T.ds_u),fmtM(T.chi),T.chi?fmtN(T.ds_u/T.chi)+' đ':'–']);
  // so sánh nhận / không nhận
  const cr = S.cmp.filter(r=>inPeriod(r.m)), cd = cr.filter(r=>r.du);
  const K = cd.reduce((a,r)=>a+r.kh,0);
  const crT = K? cd.reduce((a,r)=>a+r.mua,0)/K : 0, crC = K? cd.reduce((a,r)=>a+r.cr_c*r.kh,0)/K : 0;
  const dT = K? cd.reduce((a,r)=>a+r.dsk_t*r.kh,0)/K : 0, dC = K? cd.reduce((a,r)=>a+r.dsk_c*r.kh,0)/K : 0, inc = cd.reduce((a,r)=>a+r.ds_tang,0);
  el('sms-ckpis').innerHTML = cd.length ? [
    kpi('Nhận tin mua nhiều hơn', (crT/crC).toLocaleString('vi-VN',{maximumFractionDigits:1})+' lần', fmtP(crT,1)+' so với '+fmtP(crC,1)+' (nhóm không nhận, đã cân)', null, true),
    kpi('% mua – KH cũ nhận tin', fmtP(crT,1), fmtN(K)+' lượt KH cũ nhận', NAVY),
    kpi('% mua – KH cũ không nhận', fmtP(crC,1), 'cân theo lần mua gần nhất', GREY),
    kpi('DS / KH', fmtN(dT/1000)+'k vs '+fmtN(dC/1000)+'k', 'nhận tin vs không nhận'),
    kpi('DS tăng thêm ước tính', fmtB(inc)+' <small style="font-size:14px;color:var(--fg-3)">tr</small>', cd.filter(r=>r.ds_tang>0).length+'/'+cd.length+' chiến dịch dương'),
  ].join('') : '<div class="empty">Không có chiến dịch gửi hàng loạt đủ kỳ đo trong kỳ này – chọn Quý / Năm / Toàn bộ để xem.</div>';
  const bk={}; cd.forEach(r=>{ for(const k in r.bk){ const v=bk[k]||(bk[k]=[0,0]); v[0]+=r.bk[k][0]; v[1]+=r.bk[k][1]; } });
  const rate=(b,t)=>{ const v=bk[b+'|'+t]; return v&&v[0]? 100*v[1]/v[0] : 0; };
  const pctLbl = v=>v.toLocaleString('vi-VN',{maximumFractionDigits:1})+'%';
  mk('c-sms-bk',{type:'bar',data:{labels:SMS_BK,datasets:[barDs('Nhận tin',SMS_BK.map(b=>rate(b,1)),NAVY,{borderWidth:0}),barDs('Không nhận',SMS_BK.map(b=>rate(b,0)),GREY,{borderWidth:0})]},
    options:{plugins:{tooltip:ttP,datalabels:DL.bar(pctLbl)},scales:{x:{},y:{beginAtZero:true,ticks:{callback:v=>v+'%'}}}}});
  legend('lg-sms-bk',[['KH cũ nhận tin',NAVY],['KH cũ không nhận',GREY]]);
  const gk={}; cd.forEach(r=>{ const k=C[r.ck].nhom; const x=gk[k]||(gk[k]={kh:0,mua:0,cc:0}); x.kh+=r.kh; x.mua+=r.mua; x.cc+=r.cr_c*r.kh; });
  const kl=Object.entries(gk).sort((a,b)=>b[1].kh-a[1].kh);
  mk('c-sms-cmp',{type:'bar',data:{labels:kl.map(x=>wrapLbl(x[0],16)),datasets:[barDs('Nhận tin',kl.map(x=>100*x[1].mua/x[1].kh),NAVY,{borderWidth:0}),barDs('Không nhận',kl.map(x=>100*x[1].cc/x[1].kh),GREY,{borderWidth:0})]},
    options:{plugins:{tooltip:ttP,datalabels:DL.bar(pctLbl)},scales:{x:{},y:{beginAtZero:true,ticks:{callback:v=>v+'%'}}}}});
  legend('lg-sms-cmp',[['KH cũ nhận tin',NAVY],['KH cũ không nhận (đã cân)',GREY]]);
  const ord=cr.slice().sort((a,b)=>b.m.localeCompare(a.m)||b.ngay.split('/').reverse().join('').localeCompare(a.ngay.split('/').reverse().join('')));
  table('t-sms-cmp',['Chiến dịch','Khung đo','KH cũ nhận','% mua nhận','% mua không nhận','Chênh lệch','DS/KH nhận (k)','DS/KH không nhận (k)','DS tăng thêm (tr)'],
    ord.map(r=>{ const c=C[r.ck], l=r.cr_c? r.cr_t/r.cr_c-1 : 0;
      return [`<span class="nm" title="${escH(c.mau)}"><b>${escH(c.ten)}</b><br><small style="color:var(--fg-3)">${r.ngay}${r.du?'':' · <b style="color:var(--bad)">chưa đủ kỳ đo</b>'}</small></span>`,
        r.tu+' → '+r.den, fmtN(r.kh), fmtP(r.cr_t,1), fmtP(r.cr_c,1), `<span class="${l>=0?'dpos':'dneg'}">${l>=0?'▲ +':'▼ '}${Math.round(l*100)}%</span>`,
        fmtN(r.dsk_t/1000), fmtN(r.dsk_c/1000), `<span class="${r.ds_tang>=0?'':'dneg'}">${fmtB(r.ds_tang)}</span>`]; }));
}

/* ---------- wiring ---------- */
// Tab Ticket khiếu nại: khối thống kê đọc sống từ n8n qua GET /api/case-stats (server gom theo tháng × cửa hàng; tài khoản cửa hàng chỉ nhận số của mình),
// bên dưới nhúng app Case CSKH qua /sso/case (server ký mã đăng nhập một lần). Mở file HTML trực tiếp (không có window.USER) thì chỉ hiện link.
let CASE=null, caseBusy=false;
const CASE_GROUP = {A:'A. Con người',B:'B. Vi phạm quy định',C:'C. Kỹ thuật / sản phẩm',D:'D. Chính sách / quy trình',E:'E. Cơ sở vật chất / thông tin','?':'Chưa phân nhóm'};
const curMonth = () => { const d=new Date(); return mkey(d.getFullYear(), d.getMonth()+1); };
function caseRange(){   // như periodRange, nhưng MTD / YTD tính theo tháng hiện tại (ticket mới hơn dữ liệu BC21)
  if (state.ptype==='mtd') return [curMonth(), curMonth()];
  if (state.ptype==='ytd') return [curMonth().slice(0,4)+'-01', curMonth()];
  return periodRange();
}
function caseMonths(rowsAll){  // kỳ 1 tháng → 12 tháng gần nhất kết thúc ở tháng đó; kỳ khác → các tháng trong kỳ (chặn ở tháng có ticket đầu tiên và tháng hiện tại)
  const [f,t]=caseRange(), cur=curMonth();
  const seq=(a,b)=>{ const o=[]; let y=+a.slice(0,4), m=+a.slice(5); while(mkey(y,m)<=b && o.length<240){ o.push(mkey(y,m)); if(++m>12){m=1;y++;} } return o; };
  if (state.ptype==='month'||state.ptype==='mtd'){ let y=+t.slice(0,4), m=+t.slice(5)-11; if(m<1){m+=12;y--;} return seq(mkey(y,m), t); }
  const first = rowsAll.length ? rowsAll.map(r=>r.m).sort()[0] : cur;
  return seq(f<first?first:f, t>cur?cur:t);
}
const caseSum = rs => { const T={n:0,open:0,over:0,overAck:0,overContact:0,overClose:0,closed:0,closeN:0,closeH:0,satN:0,sat:0,ackN:0,ackOn:0,ret:0,g:{},s:{},gs:{}};
  for(const r of rs){ for(const k in T){ if(k==='g'||k==='s'||k==='gs'){ for(const q in (r[k]||{})) T[k][q]=(T[k][q]||0)+r[k][q]; } else T[k]+=r[k]||0; } } return T; };
const hrsLbl = h => h>=48 ? f1(h/24)+' ngày' : f1(h)+' giờ';
function loadCase(force){
  if (caseBusy) return; caseBusy=true; if(force) CASE=null;
  el('case-kpis').innerHTML='<div class="kpi"><div class="l">Thống kê ticket</div><div class="v" style="font-size:16px">Đang đọc từ app Case (n8n)…</div></div>';
  fetch('/api/case-stats',{credentials:'same-origin',cache:'no-store'}).then(r=>r.json()).then(j=>{ CASE = j&&j.ok ? j : {error:(j&&j.error)||'Không đọc được số liệu'}; })
    .catch(e=>{ CASE={error:'Không gọi được /api/case-stats: '+(e.message||e)}; }).then(()=>{ caseBusy=false; if(state.view==='case') renderCaseStats(); });
}
function renderCaseStats(){
  const wrap=el('case-stats'); if(!wrap) return;
  if(!window.USER){ wrap.style.display='none'; return; }
  if(!CASE){ loadCase(false); return; }
  const warn=el('case-warn'), grid=el('case-grid');
  if(CASE.error){ el('case-kpis').innerHTML=''; grid.style.display='none'; warn.hidden=false; warn.innerHTML='<b>Chưa đọc được thống kê ticket.</b> '+CASE.error+' <button class="chip" type="button" onclick="loadCase(true)">Thử lại</button>'; el('case-asof').textContent=''; return; }
  grid.style.display=''; warn.hidden=true;
  const asof=new Date(CASE.asOf); el('case-asof').innerHTML=`đọc từ app Case lúc ${asof.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})} ${asof.toLocaleDateString('vi-VN')} · <a href="#" onclick="loadCase(true);return false" style="color:var(--fg-2)">làm mới</a>`;
  const code3 = CASE.scope==='all' && state.store ? state.store.slice(0,3) : '';     // Ops / Quản trị chọn cửa hàng ở bộ lọc → chỉ số của cửa hàng đó
  const all = code3 ? CASE.rows.filter(r=>r.store===code3) : CASE.rows;
  const [f,t]=caseRange(); const rows=all.filter(r=>r.m>=f&&r.m<=t); const T=caseSum(rows), ALL=caseSum(all);
  const scope = CASE.scope!=='all' ? 'cửa hàng '+CASE.scope : code3 ? 'cửa hàng '+code3 : 'toàn hệ thống';
  const avgH = T.closeN ? T.closeH/T.closeN : null;
  el('case-kpis').innerHTML=[
    kpi('Ticket tạo trong kỳ', fmtN(T.n), periodLabel()+' · '+scope, null, true),
    kpi('Đang mở', fmtN(T.open), 'tạo trong kỳ, chưa đóng · toàn bộ đang mở (mọi kỳ): '+fmtN(ALL.open)),
    kpi('Quá hạn', fmtN(T.over), T.over ? `${T.overAck} chờ SM xác nhận · ${T.overContact} chưa liên hệ KH · ${T.overClose} quá hạn đóng` : 'không có ticket quá hạn', T.over?cssv('--bad'):null),
    kpi('Đã đóng', fmtN(T.closed), T.n ? fmtP(T.closed,T.n)+' số ticket trong kỳ' : '–'),
    kpi('Thời gian đóng TB', avgH==null ? '–' : hrsLbl(avgH), avgH==null ? 'chưa có ticket đóng' : (avgH>=48 ? fmtN(avgH)+' giờ · ' : '')+fmtN(T.closeN)+' ticket đã đóng · từ lúc tạo đến lúc đóng'),
    kpi('KH hài lòng sau xử lý', T.satN ? fmtP(T.sat,T.satN) : '–', T.satN ? fmtN(T.sat)+'/'+fmtN(T.satN)+' ticket đóng có ghi nhận' : 'chưa có ghi nhận'),
  ].join('');
  // chart theo tháng tạo (12 tháng / kỳ), xếp chồng theo tình trạng hiện tại
  const ms=caseMonths(all); const NAVY=cssv('--s1'), TURQ=cssv('--s3'), CORAL=cssv('--s2'), YEL=cssv('--s4'), LB=cssv('--t3');
  const byM = fn => ms.map(m=>fn(caseSum(all.filter(r=>r.m===m))));
  mk('c-case-month',{type:'bar',data:{labels:ms.map(mLbl),datasets:[barDs('Đã đóng',byM(x=>x.closed),NAVY,{stack:'s',borderWidth:0}),barDs('Đang mở trong hạn',byM(x=>x.open-x.over),TURQ,{stack:'s',borderWidth:0}),barDs('Quá hạn',byM(x=>x.over),CORAL,{stack:'s',borderWidth:0})]},
    options:{plugins:{tooltip:ttN},scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true,ticks:{precision:0}}}}});
  legend('lg-case-month',[['Đã đóng',NAVY],['Đang mở trong hạn',TURQ],['Quá hạn',CORAL]]);
  // nhóm vấn đề × mức độ (kỳ đang chọn)
  const gk=['A','B','C','D','E'].concat(T.g['?']?['?']:[]);
  mk('c-case-group',{type:'bar',data:{labels:gk.map(k=>wrapLbl(CASE_GROUP[k],18)),datasets:[['1',LB],['2',YEL],['3',CORAL]].map(([sv,col])=>barDs('Mức '+sv,gk.map(k=>T.gs[k+sv]||0),col,{stack:'s',borderWidth:0,maxBarThickness:22}))},
    options:{indexAxis:'y',plugins:{tooltip:ttNx},scales:{x:{stacked:true,beginAtZero:true,ticks:{precision:0}},y:{stacked:true,ticks:{font:{size:10.5}}}}}});
  legend('lg-case-group',[['Mức 1',LB],['Mức 2',YEL],['Mức 3 (nghiêm trọng)',CORAL]]);
  // bảng theo cửa hàng
  const bs={}; rows.forEach(r=>{ (bs[r.store]=bs[r.store]||[]).push(r); });
  const name = c => (CASE.stores||{})[c] ? `${c} · ${CASE.stores[c]}` : c;
  const list=Object.entries(bs).map(([c,rs])=>[c,caseSum(rs)]).sort((a,b)=>b[1].n-a[1].n || b[1].over-a[1].over);
  const cell=(x)=>x.closeN ? hrsLbl(x.closeH/x.closeN) : '–';
  table('t-case-store',['Cửa hàng','Ticket','Đang mở','Quá hạn','Đã đóng','TG đóng TB','SM xác nhận đúng hạn','KH hài lòng','Mức 3','Nhóm A','Nhóm B','Trả về CH'],
    list.map(([c,x])=>[`<span class="nm" style="min-width:200px">${name(c)}</span>`, fmtN(x.n), fmtN(x.open), x.over?`<span class="pill no">${fmtN(x.over)}</span>`:'0', fmtN(x.closed), cell(x), x.ackN?fmtP(x.ackOn,x.ackN):'–', x.satN?fmtP(x.sat,x.satN):'–', fmtN(x.s['3']||0), fmtN(x.g.A||0), fmtN(x.g.B||0), fmtN(x.ret)]),
    list.length>1 ? ['Tổng', fmtN(T.n), fmtN(T.open), fmtN(T.over), fmtN(T.closed), cell(T), T.ackN?fmtP(T.ackOn,T.ackN):'–', T.satN?fmtP(T.sat,T.satN):'–', fmtN(T.s['3']||0), fmtN(T.g.A||0), fmtN(T.g.B||0), fmtN(T.ret)] : null);
}
function renderCase(){
  renderCaseStats();
  const box=el('case-frame'); if(!box||box.dataset.ready) return;
  box.dataset.ready='1';
  if(!window.USER){ box.innerHTML='<p class="note" style="margin:0;padding:14px">Mục này chỉ chạy trên report.cskh.matviet.vn (cần đăng nhập). Mở trực tiếp: <a href="https://case.cskh.matviet.vn" target="_blank" rel="noopener">case.cskh.matviet.vn</a></p>'; return; }
  const f=document.createElement('iframe'); f.src='/sso/case'; f.title='Case CSKH'; f.setAttribute('allow','clipboard-write'); box.innerHTML=''; box.appendChild(f);
}
function render(){
  if (HIDDEN_TABS.includes(state.view)) state.view='over';
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('on', v.id==='v-'+state.view));
  document.querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-selected', t.dataset.v===state.view));
  ({over:renderOver,seg:renderSeg,ttv:renderTTV,sn:()=>{renderSN();renderContact();},km:renderKM,awo:renderAWO,hh:renderHH,sms:renderSMS,xnbh:renderXNBH,fb:renderFB,case:renderCase})[state.view]();
  el('plabel').textContent = periodLabel() + (state.store? ' · '+state.store : '');
  try{ localStorage.setItem('cskh-dash', JSON.stringify({ptype:state.ptype,year:state.year,month:state.month,quarter:state.quarter,store:state.store,view:state.view})); }catch(e){}
}
document.querySelectorAll('.tab').forEach(t=>{ if (HIDDEN_TABS.includes(t.dataset.v)) t.remove(); else t.addEventListener('click',()=>{state.view=t.dataset.v; render();}); });
HIDDEN_TABS.forEach(v=>{ const s=el('v-'+v); if(s){ s.hidden=true; s.classList.remove('on'); } });
if (USER.role!=='admin'){ const ins=el('fb-insight'); if(ins) ins.remove(); }   // Nhận định & đề xuất của CSKH: chỉ admin xem (server cũng đã cắt khỏi HTML)
(function userbar(){ const u=el('userbar'); if(!u||!window.USER) return; u.innerHTML = `<span class="who"><b>${USER.name||USER.email||''}</b> · ${ROLE_LBL[USER.role]||USER.role}${USER.store?' · '+USER.store:''}</span><span class="acts">`+(USER.role==='admin'?'<a href="/admin">Tài khoản</a>':'')+'<a class="ghost" href="/password">Đổi mật khẩu</a><a class="ghost" href="/logout">Đăng xuất</a></span>'; })();
const YEARS=[...new Set(D.meta.months.map(m=>m.slice(0,4)))];
el('fYear').innerHTML=YEARS.map(y=>`<option value="${y}">${y}</option>`).join('');
el('fMonth').innerHTML=Array.from({length:12},(_,i)=>`<option value="${i+1}">Tháng ${i+1}</option>`).join('');
el('fStore').innerHTML='<option value="">Tất cả cửa hàng</option>'+D.stores.filter(s=>/^\d{3}-/.test(s.kho)).sort((a,b)=>a.kho.localeCompare(b.kho)).map(s=>`<option value="${s.kho}">${s.kho}</option>`).join('');
function syncFilters(){
  el('fType').value=state.ptype; el('fYear').value=state.year; el('fMonth').value=state.month; el('fQuarter').value=state.quarter; el('fStore').value=state.store;
  el('wYear').hidden = ['mtd','ytd','all'].includes(state.ptype); el('wMonth').hidden = state.ptype!=='month'; el('wQuarter').hidden = state.ptype!=='quarter';
}
for (const [id,key,fn] of [['fType','ptype',v=>v],['fYear','year',v=>v],['fMonth','month',v=>parseInt(v)],['fQuarter','quarter',v=>parseInt(v)],['fStore','store',v=>v]]){
  el(id).addEventListener('change',()=>{ state[key]=fn(el(id).value); syncFilters(); render(); });
}
syncFilters();
if (USER.role==='store'){   // cửa hàng: ẩn bộ lọc cửa hàng / model và các khối số liệu toàn hệ thống
  for (const id of ['fStore','fModel']){ const e=el(id); e.style.display='none'; if(e.previousElementSibling&&e.previousElementSibling.tagName==='LABEL') e.previousElementSibling.style.display='none'; }   // .chips có display:flex nên phải set style, không dùng hidden
  ['c-seg-gt','c-seg-age','c-ttv-gt','c-ttv-age','t-ttv-seg','c-sn-model','c-sn-gt','c-sn-age','t-sn-nguon','t-sn-voucher'].forEach(id=>{ const e=el(id); const c=e&&e.closest('.card'); if(c) c.style.display='none'; });   // ẩn (không xoá) để code vẽ chart không lỗi
}
el('fModel').innerHTML = MODELS.map(m=>`<button class="chip" id="chip-${m.replace(/\W/g,'')}" data-m="${m}" aria-pressed="true">${MODEL_LBL(m)}</button>`).join('');
document.querySelectorAll('.chip').forEach(c=>c.addEventListener('click',()=>{
  const m=c.dataset.m;
  if (state.models.size===MODELS.length){ state.models=new Set([m]); }          // first click: isolate
  else if (state.models.has(m)){ state.models.delete(m); if(!state.models.size) state.models=new Set(MODELS); }
  else state.models.add(m);
  document.querySelectorAll('.chip').forEach(x=>x.setAttribute('aria-pressed', state.models.has(x.dataset.m)));
  render();
}));
el('gen').textContent = D.meta.generated;
el('src').innerHTML = `Nguồn dữ liệu: <b>Báo cáo › Data BC21</b> (bill-level, T10/2025 → T9/2026 từ file BC21 tháng; 2022 → T9/2025 từ <i>Phân tích KH update V8.xlsx</i>; lịch sử mua trước 2022 từ sheet KH) · <b>CT CRM.2023.xlsx › SN2023</b> (gửi/dùng voucher sinh nhật 2023 → T9/2026). Buyer (khách lẻ) chỉ có từ T10/2025 vì file tổng hợp cũ không gồm khách KL. Model của cửa hàng theo phân loại hiện hành (Boutique / Counter w R / Street / Event / Online). Bộ lọc Model không áp dụng cho các biểu đồ giới tính, độ tuổi và bảng Nguồn/loại voucher.`;
const mq = matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener && mq.addEventListener('change', render);
new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
render();
