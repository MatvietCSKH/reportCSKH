const D = JSON.parse(document.getElementById('data').textContent);
const SEGS = ['1. KH mới','2. Quay lại ≤12T','3. KH cũ >12T','4. Buyer (khách lẻ)'];
const SEG_LBL = {'1. KH mới':'KH mới','2. Quay lại ≤12T':'Quay lại ≤12T','3. KH cũ >12T':'KH cũ >12T','4. Buyer (khách lẻ)':'Buyer (khách lẻ)'};
const CARDS = ['1. Diamond15','2. Platinum10','3. Gold7','4. Silver5','5. Member','6. Non-MB'];
const CARD_LBL = c => c.replace(/^\d\. /,'');
const MODELS = D.meta.models;
const MODEL_LBL = m => (m==='#N/A'||!m) ? '–' : m.replace(/^\d\. /,'');
const LAST = D.meta.months[D.meta.months.length-1];
const state = { ptype:'month', year:LAST.slice(0,4), month:parseInt(LAST.slice(5)), quarter:Math.ceil(parseInt(LAST.slice(5))/3), store:'', models:new Set(MODELS), view:'over' };
try { const s = JSON.parse(localStorage.getItem('cskh-dash')||'{}'); for (const k of ['ptype','year','month','quarter','store','view']) if (s[k]!==undefined) state[k]=s[k]; } catch(e){}
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
  const rowsAll=D.contact_month.filter(r=>r.month<='2026-09'&&okS(r.store));
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
  const ys=yearsSel(2024);
  const gm={}; for(const r of D.contact_method.filter(r=>ys.includes(r.year))){ const g=gm[r.meth]||(gm[r.meth]={n:0,red:0,rev:0}); g.n+=r.n; g.red+=r.red; g.rev+=r.rev; }
  const mName=k=>k==='Khác/không ghi'?'Có ghi nhận, không rõ hình thức':k;
  table('t-ct-method',['Hình thức','Số KH','Dùng voucher','CR','Doanh số (tr)'],Object.entries(gm).sort((a,b)=>b[1].n-a[1].n).map(([k,g])=>[mName(k),fmtN(g.n),fmtN(g.red),fmtP(g.red,g.n),fmtB(g.rev)]));
  const gs={}; for(const r of D.contact_staff.filter(r=>ys.includes(r.year)&&okS(r.store))){ const key=r.store+'|'+r.staff; const g=gs[key]||(gs[key]={store:r.store,staff:r.staff,n:0,red:0,rev:0}); g.n+=r.n; g.red+=r.red; g.rev+=r.rev; }
  table('t-ct-staff',['Nhân viên','CH','KH đã liên hệ','Dùng voucher','CR','Doanh số (tr)'],Object.values(gs).sort((a,b)=>b.n-a.n).slice(0,15).map(g=>[g.staff,g.store,fmtN(g.n),fmtN(g.red),fmtP(g.red,g.n),fmtB(g.rev)]));
  const bs={}; for(const r of rows){ const g=bs[r.store]||(bs[r.store]={listed:0,noted:0,red_n:0,red_u:0,rev_n:0,rev_u:0,months:new Set(),active:new Set()}); for(const k of ['listed','noted','red_n','red_u','rev_n','rev_u']) g[k]+=r[k]; g.months.add(r.month); if(r.noted/r.listed>=.05) g.active.add(r.month); }
  const brow=Object.entries(bs).sort((a,b)=>pct(b[1].noted,b[1].listed)-pct(a[1].noted,a[1].listed));
  const pill=p=>p>=50?'<span class="pill ok">Thực hiện tốt</span>':p>=5?'<span class="pill mid">Làm một phần</span>':'<span class="pill no">Chưa thực hiện</span>';
  table('t-ct-store',['Cửa hàng','Model','AM','Trạng thái','Tháng có làm','KH trong DS','KH đã liên hệ','% liên hệ','Dùng (có LH)','CR có LH','Dùng (không LH)','CR không LH','DS có LH (tr)'],
    brow.map(([code,g])=>{ const s=storeKho(code)||{}; const p=pct(g.noted,g.listed); return [s.kho||code,MODEL_LBL(s.model||''),s.am||'–',pill(p),g.active.size+'/'+g.months.size,fmtN(g.listed),fmtN(g.noted),bar(fP(p),100),fmtN(g.red_n),fmtP(g.red_n,g.noted),fmtN(g.red_u),fmtP(g.red_u,g.listed-g.noted),fmtB(g.rev_n)]; }),
    ['Tổng','','','',''+periodMonths().length,fmtN(T.listed),fmtN(T.noted),fP(pct(T.noted,T.listed)),fmtN(T.red_n),fP1(crN),fmtN(T.red_u),fP1(crU),fmtB(T.rev_n)]);
}
/* ================= CTKM ================= */
const K = D.ctkm || {kho:[],progs:[],day:[],prog:[],months:[],awo_kpi:14};
const KSM = {}; D.stores.forEach(s=>KSM[s.kho]=s);
const kModel = kho => { const m=(KSM[kho]||{}).model; return MODELS.includes(m) ? m : '6. Khác'; };
const KDAY = K.day.map(r=>({d:r[0], m:r[0].slice(0,7), kho:K.kho[r[1]], ns:r[2]*1e3, ck:r[3]*1e3, b:r[4], bp:r[5], ba:r[6], nsp:r[7]*1e3}));
const KPRG = K.prog.map(r=>({m:r[0], kho:K.kho[r[1]], p:r[2], ns:r[3]*1e3, ck:r[4]*1e3, b:r[5]}));
const PNAME=i=>K.progs[i][0], PGRP=i=>K.progs[i][1], PCAMP=i=>K.progs[i][2], PAWO=i=>K.progs[i][3];
const FULL='Full Price';
const kstate = {camp:'', grp:''};
try { const s=JSON.parse(localStorage.getItem('cskh-km')||'{}'); Object.assign(kstate, s); } catch(e){}
const okKho = kho => (!state.store || kho===state.store) && state.models.has(kModel(kho));
const okProg = p => (!kstate.camp || PCAMP(p)===kstate.camp) && (!kstate.grp || PGRP(p)===kstate.grp);
const ckPct = (ck,ns) => (ns+ck) ? 100*ck/(ns+ck) : 0;
const fCK = (ck,ns) => fP1(ckPct(ck,ns));
const GRP_COL = () => { const c=[cssv('--s1'),cssv('--s4'),cssv('--s3'),cssv('--s2'),cssv('--t3'),cssv('--t2'),cssv('--t5'),cssv('--s8'),cssv('--t4')]; return (g,i) => g===FULL ? cssv('--t6') : c[i % c.length]; };
function isoWeek(ds){ const d=new Date(ds+'T00:00:00Z'); const day=(d.getUTCDay()+6)%7; d.setUTCDate(d.getUTCDate()-day+3); const y=d.getUTCFullYear(); const f=new Date(Date.UTC(y,0,4)); return [y, 1+Math.round(((d-f)/864e5-3+((f.getUTCDay()+6)%7))/7)]; }
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
  el('km-week-note').textContent = 'Tuần ISO (thứ 2 → CN) trong kỳ đang chọn · tổng toàn bộ bán hàng, không lọc theo chiến dịch / group';
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
  const pg=kmAgg(Pp, r=>r.p); const pl=Object.entries(pg).filter(([p])=>PGRP(+p)!==FULL).sort((a,b)=>b[1].ns-a[1].ns);
  const top=pl.slice(0,10);
  mk('c-km-top',{type:'bar',data:{labels:top.map(([p])=>{const n=PNAME(+p); return n.length>46?n.slice(0,44)+'…':n;}),datasets:[barDs('Doanh số',top.map(([,v])=>v.ns/1e6),cssv('--s1'),{maxBarThickness:22})]},
    options:{indexAxis:'y',plugins:{tooltip:{callbacks:{title:c=>PNAME(+top[c[0].dataIndex][0]),label:c=>` ${fmtN(c.parsed.x)} tr · ${fmtP(top[c.dataIndex][1].ns,Tall.ns)} · %CK ${fCK(top[c.dataIndex][1].ck,top[c.dataIndex][1].ns)}`}},
      datalabels:DL.bar((v,c)=>fmtN(v)+' · '+fmtP(top[c.dataIndex][1].ns,Tall.ns),{align:'end',anchor:'end',offset:2})},
      layout:{padding:{right:90}},scales:{x:{beginAtZero:true,ticks:{callback:v=>fmtN(v)}},y:{ticks:{font:{size:10.5}}}}}});
  const pmax=pl.length?pl[0][1].ns:0;
  table('t-km-prog',['#','CTKM','Group','Chiến dịch','Bill','Doanh số (tr)','% DS','Chiết khấu (tr)','%CK','ATV (tr)','DS / 1đ CK'],
    pl.slice(0,30).map(([p,v],i)=>[i+1,`<span class="nm">${PNAME(+p)}</span>`,`<span class="tag">${PGRP(+p)}</span>`,PCAMP(+p),fmtN(v.b),bar(fmtB(v.ns),pmax),fmtP(v.ns,Tall.ns),fmtB(v.ck),fCK(v.ck,v.ns),fmtM(v.b?v.ns/v.b:0),v.ck>0?(v.ns/v.ck).toLocaleString('vi-VN',{maximumFractionDigits:1}):'–']));
  // chiến dịch
  const cm=pm.filter(m=>K.months.includes(m)); const showM=cm.length>1&&cm.length<=12;
  const cg={}; for(const r of Pp){ const c=PCAMP(r.p); if(c==='Nguyên giá') continue; const g=cg[c]||(cg[c]={ns:0,ck:0,b:0,progs:new Set(),bym:{}}); g.ns+=r.ns; g.ck+=r.ck; g.b+=r.b; g.progs.add(r.p); g.bym[r.m]=(g.bym[r.m]||0)+r.ns; }
  const cl=Object.entries(cg).sort((a,b)=>b[1].ns-a[1].ns); const cmax=cl.length?cl[0][1].ns:0;
  table('t-km-camp',['Chiến dịch','Số CTKM','Bill','Doanh số (tr)','% DS','Chiết khấu (tr)','%CK','ATV (tr)'].concat(showM?cm.map(mLbl):[]),
    cl.slice(0,40).map(([c,v])=>[c,v.progs.size,fmtN(v.b),bar(fmtB(v.ns),cmax),fmtP(v.ns,Tall.ns),fmtB(v.ck),fCK(v.ck,v.ns),fmtM(v.b?v.ns/v.b:0)].concat(showM?cm.map(m=>v.bym[m]?fmtB(v.bym[m]):'·'):[])));
  // cửa hàng
  const sg={}; for(const r of Pp){ const g=sg[r.kho]||(sg[r.kho]={ns:0,ck:0,nsp:0,bp:0,byp:{}}); g.ns+=r.ns; g.ck+=r.ck; if(PGRP(r.p)!==FULL){ g.nsp+=r.ns; g.bp+=r.b; g.byp[r.p]=(g.byp[r.p]||0)+r.ns; } }
  const sl=Object.entries(sg).sort((a,b)=>b[1].ns-a[1].ns); const smax=sl.length?sl[0][1].ns:0;
  table('t-km-store',['Cửa hàng','Model','Doanh số (tr)','DS có CTKM (tr)','% DS có CTKM','Chiết khấu (tr)','%CK','CTKM doanh số cao nhất'],
    sl.map(([k,v])=>{ const tp=Object.entries(v.byp).sort((a,b)=>b[1]-a[1])[0]; return [k,MODEL_LBL(kModel(k)),bar(fmtB(v.ns),smax),fmtB(v.nsp),fmtP(v.nsp,v.ns),fmtB(v.ck),fCK(v.ck,v.ns),tp?`<span class="nm">${PNAME(+tp[0])}</span>`:'–']; }),
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
  const pg=kmAgg(Ap, r=>r.p); const pl=Object.entries(pg).sort((a,b)=>b[1].ns-a[1].ns);
  table('t-awo-prog',['CT AWO','Mã / tên CT','Group','Bill','Doanh số (tr)','% tỷ trọng DS','Chiết khấu (tr)','%CK'],
    pl.map(([p,v])=>[PAWO(+p),`<span class="nm">${PNAME(+p)}</span>`,`<span class="tag">${PGRP(+p)}</span>`,fmtN(v.b),fmtB(v.ns),fmtP(v.ns,tot.ns),fmtB(v.ck),fCK(v.ck,v.ns)]));
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

/* ================= XNBH — BNR & xác nhận bảo hành ================= */
const X = D.xnbh || {rows:[],months:[],stores:{},mode:{},mism:{},src:''};
const XSM = X.stores || {};
const xAgg = () => ({kh:0,sets:0,xnb:0,xno:0,npsb:0,npso:0,mism:0,rows:0});
function xSum(list){ const t=xAgg(); for(const r of list) for(const k in t) t[k]+=r[k]||0; return t; }
const xOK = r => (!state.store || r.kho===state.store) && (!r.model || state.models.has(r.model) || !MODELS.includes(r.model));
const xProf = (kho,f) => (XSM[kho]||{})[f] || '–';
const xRate = t => t.kh ? 100*t.xnb/t.kh : 0;

function renderXNBH(){
  const S1=cssv('--s1'), S3=cssv('--s3'), GREY=cssv('--t6'), ACC=cssv('--accent'), BAD=cssv('--bad');
  const all = X.rows.filter(xOK);
  const ms  = X.months.filter(inChart);
  const pm  = X.months.filter(inPeriod);
  const cur = all.filter(r=>inPeriod(r.month));
  const T   = xSum(cur);
  const byM = {}; for(const r of all.filter(x=>inChart(x.month))){ const g=byM[r.month]||(byM[r.month]=xAgg()); for(const k in g) g[k]+=r[k]||0; }
  const G = m => byM[m] || xAgg();

  if (!X.rows.length || !pm.length){
    el('xn-kpis').innerHTML = '';
    el('xn-warn').innerHTML = '<b>Chưa có dữ liệu BNR cho kỳ này.</b> Dữ liệu XNBH hiện có từ ' + (X.months[0]||'–') + ' đến ' + (X.months[X.months.length-1]||'–') + '.';
    ['t-xn-store','t-xn-month'].forEach(i=>el(i).innerHTML='<div class="empty">Không có dữ liệu cho kỳ này</div>');
    ['c-xn-month','c-xn-pie','c-xn-am','c-xn-tier'].forEach(i=>{ if(charts[i]){charts[i].destroy(); delete charts[i];} });
    el('xn-src').textContent = X.src || '–';
    return;
  }

  el('xn-kpis').innerHTML = [
    kpi('Tỷ lệ XNBH / KH nhận BNR', fP1(xRate(T)), fmtN(T.xnb)+' / '+fmtN(T.kh)+' KH nhận BNR', null, true),
    kpi('KH nhận BNR', fmtN(T.kh), periodLabel()+' · TB '+fmtN(pm.length?T.kh/pm.length:0)+'/tháng', S1),
    kpi('Số BNR đã tặng', fmtN(T.sets), (T.kh? (T.sets/T.kh).toLocaleString('vi-VN',{maximumFractionDigits:2}):'–')+' bộ / khách'),
    kpi('Lượt XNBH / NPS', fmtN(T.xnb+T.xno), fmtN(T.xno)+' lượt không kèm BNR', S3),
    kpi('KH nhận BNR chưa XNBH', fmtN(T.kh-T.xnb), fP1(T.kh?100*(T.kh-T.xnb)/T.kh:0)+' — dư địa khai thác', GREY),
  ].join('');

  const grantMs = pm.filter(m=>(X.mode[m]||'flag')==='grant');
  const mismT   = pm.reduce((a,m)=>a+((X.mism||{})[m]||0),0);
  el('xn-warn').innerHTML = grantMs.length
    ? '<b>Cảnh báo cách ghi dữ liệu — '+grantMs.map(mLbl).join(', ')+'.</b> Trong (các) tháng này mọi dòng có SL KH đều mang XNBH = Yes, nên cột XNBH chỉ lặp lại việc “có nhận BNR hay không” và <b>không cho biết ai đã xác nhận bảo hành</b>. Tỷ lệ của các tháng đó sẽ đội lên gần 100% — cần sửa file nguồn trước khi dùng con số này.'
    : mismT
    ? '<b>Cột XNBH và cột NPS đang lệch nhau ở '+fmtN(mismT)+' dòng</b> trong kỳ này. Báo cáo lấy cột XNBH làm chuẩn; nên rà lại file nguồn để hai cột khớp.'
    : 'Cột <b>XNBH</b> và cột <b>NPS</b> khớp nhau hoàn toàn trong kỳ này ('+fmtN(T.xnb+T.xno)+' lượt) nên hai chỉ số báo cáo chung. Trong đó <b>'+fmtN(T.xno)+'</b> lượt đến từ khách không nhận BNR — các lượt này không nằm trong mẫu số của tỷ lệ chuyển đổi.';

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

  const avg = xRate(T);
  const byKey = f => { const o={}; for(const r of cur){ const k=xProf(r.kho,f); const g=o[k]||(o[k]=xAgg()); for(const kk in g) g[kk]+=r[kk]||0; } return o; };
  const amG = byKey('am'), amK = Object.keys(amG).filter(k=>k!=='–'&&k!=='Online'&&k!=='ZNS_CTA'&&amG[k].kh).sort((a,b)=>xRate(amG[b])-xRate(amG[a]));
  mk('c-xn-am',{type:'bar',data:{labels:amK.map(k=>'AM '+k),datasets:[barDs('% đã XNBH',amK.map(k=>xRate(amG[k])),amK.map(k=>xRate(amG[k])>=avg?S3:BAD),{borderWidth:0,maxBarThickness:30})]},
    options:{indexAxis:'y',plugins:{tooltip:{callbacks:{label:c=>{const g=amG[amK[c.dataIndex]];return ` ${fmtN(g.xnb)}/${fmtN(g.kh)} KH · ${c.parsed.x.toFixed(1)}% (TB ${avg.toFixed(1)}%)`;}}}},scales:{x:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%'}},y:{}}}});

  const tierG = byKey('tier'), areaG = byKey('khuvuc');
  const TK = ['Platinum','Gold','Silver'].filter(k=>tierG[k]&&tierG[k].kh);
  const AK = Object.keys(areaG).filter(k=>k!=='–'&&k!=='Online'&&k!=='ZNS_CTA'&&areaG[k].kh).sort((a,b)=>areaG[b].kh-areaG[a].kh).slice(0,8);
  const tLbl = [...TK.map(k=>'Tier: '+k), ...AK.map(k=>'KV: '+k)];
  const tVal = [...TK.map(k=>xRate(tierG[k])), ...AK.map(k=>xRate(areaG[k]))];
  const tG   = [...TK.map(k=>tierG[k]), ...AK.map(k=>areaG[k])];
  mk('c-xn-tier',{type:'bar',data:{labels:tLbl,datasets:[barDs('% đã XNBH',tVal,tLbl.map((l,i)=>l.startsWith('Tier')?ACC:(tVal[i]>=avg?S3:BAD)),{borderWidth:0,maxBarThickness:18})]},
    options:{indexAxis:'y',plugins:{tooltip:{callbacks:{label:c=>` ${fmtN(tG[c.dataIndex].xnb)}/${fmtN(tG[c.dataIndex].kh)} KH · ${c.parsed.x.toFixed(1)}%`}}},scales:{x:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%'}},y:{}}}});

  const stG = {}; for(const r of cur){ const g=stG[r.kho]||(stG[r.kho]=xAgg()); for(const k in g) g[k]+=r[k]||0; }
  const srow = Object.entries(stG).sort((a,b)=>b[1].kh-a[1].kh);
  const smax = srow.length? srow[0][1].kh : 0;
  const pillX = p => p>=avg ? '<span class="pill ok">Trên TB</span>' : p>=avg/2 ? '<span class="pill mid">Dưới TB</span>' : '<span class="pill no">Rất thấp</span>';
  table('t-xn-store',['Cửa hàng','Tier','Khu vực','AM','KH nhận BNR','BNR tặng','BNR/KH','Đã XNBH','% đã XNBH','XNBH lẻ','Đánh giá'],
    srow.map(([kho,g])=>[kho,xProf(kho,'tier'),xProf(kho,'khuvuc'),xProf(kho,'am'),bar(fmtN(g.kh),smax),fmtN(g.sets),g.kh?(g.sets/g.kh).toLocaleString('vi-VN',{maximumFractionDigits:2}):'–',fmtN(g.xnb),g.kh?fP1(xRate(g)):'–',fmtN(g.xno),g.kh?pillX(xRate(g)):'–']),
    ['Tổng '+srow.length+' CH','','','',fmtN(T.kh),fmtN(T.sets),T.kh?(T.sets/T.kh).toLocaleString('vi-VN',{maximumFractionDigits:2}):'–',fmtN(T.xnb),fP1(avg),fmtN(T.xno),'']);

  const allM = X.months.filter(m=>all.some(r=>r.month===m));
  const byMa = {}; for(const r of all){ const g=byMa[r.month]||(byMa[r.month]=xAgg()); for(const k in g) g[k]+=r[k]||0; }
  const Ta = xSum(all);
  table('t-xn-month',['Tháng','KH nhận BNR','BNR tặng','BNR/KH','Đã XNBH','% đã XNBH','XNBH không kèm BNR','XNBH lệch NPS'],
    allM.map(m=>{const g=byMa[m];return [mLbl(m)+(X.mode[m]==='grant'?' <span class="pill no">cột XNBH không dùng được</span>':''),fmtN(g.kh),fmtN(g.sets),g.kh?(g.sets/g.kh).toLocaleString('vi-VN',{maximumFractionDigits:2}):'–',fmtN(g.xnb),g.kh?fP1(xRate(g)):'–',fmtN(g.xno),fmtN((X.mism||{})[m]||0)];}),
    ['Tổng '+allM.length+' tháng',fmtN(Ta.kh),fmtN(Ta.sets),Ta.kh?(Ta.sets/Ta.kh).toLocaleString('vi-VN',{maximumFractionDigits:2}):'–',fmtN(Ta.xnb),fP1(xRate(Ta)),fmtN(Ta.xno),fmtN(Ta.mism)]);

  el('xn-src').textContent = X.src || '–';
}

/* ---------- wiring ---------- */
function render(){
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('on', v.id==='v-'+state.view));
  document.querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-selected', t.dataset.v===state.view));
  ({over:renderOver,seg:renderSeg,ttv:renderTTV,sn:()=>{renderSN();renderContact();},km:renderKM,awo:renderAWO,xnbh:renderXNBH})[state.view]();
  el('plabel').textContent = periodLabel() + (state.store? ' · '+state.store : '');
  try{ localStorage.setItem('cskh-dash', JSON.stringify({ptype:state.ptype,year:state.year,month:state.month,quarter:state.quarter,store:state.store,view:state.view})); }catch(e){}
}
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{state.view=t.dataset.v; render();}));
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
