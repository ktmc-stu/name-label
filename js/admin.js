/* js/admin.js — Head Admin / Operational Admin console.
   Split Excel merge keyed on Student ID, role gating, and full usage audit for Head Admin. */
(function(){
const AUTH_DELETE_ENDPOINT='';
const LS='plAdminStation';
const PATHS=['students','stations','queues','labelLayout'];
const HEAD_PATHS=['users','admins','audit','sessions','presence'];
const PAGES=['overview','operate','designer','attendance','meetings','stations','students','users','audit','settings'];
const S={
  user:null,profile:null,role:'staff',canManage:false,isHead:false,started:false,
  students:{},bySid:{},byCard:{},byClass:{},byName:{},stations:{},queues:{},att:{},attDay:'',users:{},admins:{},
  audit:[],sessions:{},presence:{},auditView:'live',auditFilter:{uid:'',kind:'',from:'',to:'',q:''},auditSid:null,
  layout:LL.norm(null),selBox:null,zoom:1.4,drag:null,
  station:localStorage.getItem(LS)||null,unknown:null,sent:0,lastScan:'',
  page:'overview',uFilter:'pending',meet:{q:'',teacher:'',room:'',only:false},
  imp:{type:'auto',blank:false,unmatched:[]},
  attRef:null,refs:{},loaded:{},errors:{},counts:{},runtime:[],bannerHidden:false,
  mmUid:null,mmBusy:false,udUid:null,udBusy:false,dgScope:null,dgBusy:false,buf:'',bufAt:0
};
const $=id=>document.getElementById(id);
const t=(k,v)=>I18N.t(k,v);
const esc=LL.esc;
const dayKey=(d=new Date())=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
S.attDay=dayKey();
const fmtT=ts=>ts?new Date(ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'—';
const fmtD=ts=>ts?new Date(ts).toLocaleDateString('en-GB'):'—';
const fmtDT=ts=>ts?new Date(ts).toLocaleString('en-GB'):'—';
const dur=ms=>{ms=Math.max(0,Math.round((ms||0)/1000));const h=Math.floor(ms/3600),m=Math.floor(ms%3600/60),s=ms%60;return (h?h+'h ':'')+(m||h?m+'m ':'')+s+'s';};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const normCard=v=>String(v==null?'':v).trim().replace(/^0+/,'').toUpperCase();
const normSid=v=>String(v==null?'':v).trim().toUpperCase().replace(/[\s]/g,'');
const sidKey=v=>normSid(v).replace(/[.#$/\[\]]/g,'-');
const online=st=>st&&st.lastSeen&&(Date.now()-st.lastSeen<60000);
const qCount=k=>Object.keys(S.queues[k]||{}).length;
const meetOf=s=>({meetTime:String(s.meetTime||''),meetTeacher:String(s.meetTeacher||''),meetRoom:String(s.meetRoom||'')});
const meetStr=s=>LL.meetLine(s);
const meetHtml=s=>{const m=meetStr(s);return m?'<div class="mline"><b>'+esc(t('m.label'))+'</b> '+esc(m)+'</div>':'';};
const byClass=(a,b)=>String(a[1].cls||'').localeCompare(String(b[1].cls||''))||(+a[1].classNo||0)-(+b[1].classNo||0)||String(a[1].nameEn||'').localeCompare(String(b[1].nameEn||''));
const SC={ready:['#e5f0fc','#084c9e'],wait:['#fbf2dd','#8f6410'],ok:['#e4f4ec','#16794b'],err:['#fbeaea','#bf3a3a']};
const setScan=(el,k)=>{el.style.background=SC[k][0];el.style.color=SC[k][1];};
const db=()=>Auth.db;
let toastTimer=null;
function toast(m){const e=$('toast');e.textContent=m;e.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('on'),3200);}
function guard(){if(!S.canManage){toast(t('c.needAdmin'));return false;}return true;}
function guardHead(){if(!S.isHead){toast(t('audit.headOnly'));return false;}return true;}
function werr(e){const c=(e&&e.code)||'';toast(/PERMISSION_DENIED/i.test(c+e)?t('c.denied'):t('c.fail')+': '+(e&&e.message||e));}
function safe(fn,label){try{fn();}catch(e){S.runtime.push((label||fn.name||'render')+': '+(e&&e.message||e));console.error(e);try{renderBanner();}catch(_){}}}
function download(name,obj,type){const b=new Blob([typeof obj==='string'?obj:JSON.stringify(obj,null,2)],{type:type||'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}
function roleLabel(r){return t(r==='head'?'role.head':r==='admin'?'role.admin':'role.staff');}
function byLabel(v){const s=String(v||'');if(!s)return '—';const m={scan:'vf.byScan',admin:'vf.byAdmin',printer:'vf.byPrinter',remote:'vf.byRemote','admin-v':'vf.byAdminV','printer-v':'vf.byPrinterV','remote-v':'vf.byRemoteV'};return m[s]?t(m[s]):s;}
window.addEventListener('error',ev=>{S.runtime.push(String(ev.message||'error'));safe(renderBanner,'banner');});

/* ================= parent verification ================= */
const Verify=(function(){
const CSS=`
.vf-scrim{position:fixed;inset:0;z-index:1500;background:rgba(15,35,64,.52);display:none;align-items:center;justify-content:center;padding:18px}
.vf-scrim.on{display:flex}
.vf-modal{width:min(600px,100%);max-height:calc(100vh - 36px);overflow:auto;background:var(--surface,#fff);border:1px solid var(--line,#dae6f4);border-radius:14px;box-shadow:0 26px 70px rgba(15,35,64,.32);padding:24px}
.vf-eyebrow{display:inline-block;font-size:10.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--wn,#8f6410)}
.vf-modal h3{font-size:19px;margin:6px 0 12px;font-weight:600}
.vf-q{background:var(--wns,#fbf2dd);border:1px solid var(--wnl,#e8d6a8);border-radius:10px;padding:14px 16px;color:var(--wn,#8f6410);font-size:16.5px;line-height:1.75;font-weight:500}
.vf-q2{margin-top:10px;font-size:14.5px;line-height:1.7}
.vf-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:10px;margin:14px 0}
.vf-cell{background:var(--panel,#f6faff);border:1px solid var(--line,#dae6f4);border-radius:8px;padding:9px 12px;min-width:0}
.vf-cell span{display:block;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--faint,#8ba1bd);margin-bottom:2px}
.vf-cell b{display:block;font-size:15px;font-weight:600;word-break:break-word}
.vf-cell.big b{font-size:22px;line-height:1.3}
.vf-hint{font-size:12.5px;color:var(--muted,#5a7391);line-height:1.65}
.vf-row{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}
.vf-banner{display:flex;gap:10px;align-items:flex-start;background:var(--wns,#fbf2dd);border:1px solid var(--wnl,#e8d6a8);color:var(--wn,#8f6410);border-radius:10px;padding:12px 14px;font-size:13px;line-height:1.65;margin-top:10px}
.vf-banner svg{width:17px;height:17px;flex:none;margin-top:2px}
.aud-bar{display:flex;gap:4px;align-items:flex-end;height:56px;margin:10px 0 4px}
.aud-bar div{flex:1;background:var(--acs,#e5f0fc);border:1px solid var(--acl,#b4d1f2);border-radius:3px 3px 0 0;min-height:2px}
.aud-kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:12px 0}
.aud-kv div{background:var(--panel,#f6faff);border:1px solid var(--line,#dae6f4);border-radius:8px;padding:9px 12px;min-width:0}
.aud-kv span{display:block;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--faint,#8ba1bd)}
.aud-kv b{display:block;font-size:14px;font-weight:600;word-break:break-word}
.aud-d{font:11.5px var(--mono,monospace);color:var(--muted,#5a7391);word-break:break-all}
@media(max-width:520px){.vf-row .btn{flex:1 1 auto}}
`;
const ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.9.6c0 1.7-2.5 2.1-2.5 2.1"/><path d="M12 15.4h.01"/></svg>';
let el=null,resolve=null,banners=[];
function mount(){
  if(el)return;
  const st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
  el=document.createElement('div');el.className='vf-scrim';el.setAttribute('aria-hidden','true');
  el.innerHTML='<div class="vf-modal" role="dialog" aria-modal="true" aria-labelledby="vfTitle">'
    +'<span class="vf-eyebrow" id="vfEye"></span><h3 id="vfTitle"></h3>'
    +'<div class="vf-q"><div id="vfQ1"></div><div class="vf-q2" id="vfQ2"></div></div>'
    +'<div class="vf-grid" id="vfGrid"></div><p class="vf-hint" id="vfHint"></p>'
    +'<div class="vf-row"><button class="btn bad" id="vfNo" type="button"></button><button class="btn" id="vfYes" type="button"></button></div></div>';
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target===el)done(false);});
  document.getElementById('vfNo').onclick=()=>done(false);
  document.getElementById('vfYes').onclick=()=>done(true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&el.classList.contains('on')){e.stopPropagation();done(false);}},true);
  labels();
}
function labels(){
  if(!el)return;
  document.getElementById('vfEye').textContent=t('vf.eyebrow');
  document.getElementById('vfTitle').textContent=t('vf.title');
  document.getElementById('vfHint').textContent=t('vf.hint');
  document.getElementById('vfNo').textContent=t('vf.cancel');
  document.getElementById('vfYes').textContent=t('vf.confirm');
}
function done(v){
  if(!el||!el.classList.contains('on'))return;
  el.classList.remove('on');el.setAttribute('aria-hidden','true');document.body.style.overflow='';
  const r=resolve;resolve=null;if(r)r(v);
}
const cell=(l,v,big)=>'<div class="vf-cell'+(big?' big':'')+'"><span>'+esc(l)+'</span><b>'+esc(v||'—')+'</b></div>';
function fill(s){
  const nameEn=String(s.nameEn||''),nameZh=String(s.nameZh||''),cls=String(s.cls||''),no=String(s.classNo||'');
  document.getElementById('vfQ1').textContent=t('vf.ask',{nameEn:nameEn||'—',nameZh:nameZh||'—',cls:cls||'—',no:no||'—'});
  document.getElementById('vfQ2').textContent=meetStr(s)
    ? t('vf.askMeet',{time:String(s.meetTime||'—'),teacher:String(s.meetTeacher||'—'),room:String(s.meetRoom||'—')})
    : t('vf.noMeet');
  document.getElementById('vfGrid').innerHTML=
     cell(t('c.zh'),nameZh,true)+cell(t('c.en'),nameEn)
    +cell(t('sd.sid'),String(s.studentId||''))+cell(t('c.class'),cls)+cell(t('c.no'),no)
    +cell(t('c.card'),String(s.cardId||'')||t('vf.noCard'))
    +cell(t('m.time'),String(s.meetTime||'')||t('m.none'))
    +cell(t('m.teacher'),String(s.meetTeacher||'')||t('m.none'))
    +cell(t('m.room'),String(s.meetRoom||'')||t('m.none'));
}
function ask(s){
  mount();
  if(resolve){const r=resolve;resolve=null;r(false);}
  fill(s);labels();
  el.classList.add('on');el.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
  setTimeout(()=>{const b=document.getElementById('vfNo');if(b)b.focus();},40);
  return new Promise(r=>{resolve=r;});
}
function banner(afterId){
  const host=document.getElementById(afterId);if(!host||!host.parentNode)return;
  mount();
  const d=document.createElement('div');d.className='vf-banner';d.innerHTML=ICON+'<span></span>';
  host.parentNode.insertBefore(d,host.nextSibling);banners.push(d);paint();
}
function paint(){banners.forEach(b=>{const s=b.querySelector('span');if(s)s.textContent=t('vf.banner');});labels();}
const open=()=>!!el&&el.classList.contains('on');
return {ask,banner,paint,open,mount};
})();

/* ---------- banner + diagnostics ---------- */
function renderBanner(){
  const b=$('banner'),errs=Object.keys(S.errors),rt=S.runtime;
  if(S.bannerHidden||(!errs.length&&!rt.length)){b.innerHTML='';return;}
  let h='<div class="banner"><h4>'+esc(t('bn.title'))+'</h4><ul>';
  errs.forEach(k=>h+='<li><span class="mono">'+esc(k)+'</span> — '+esc(S.errors[k])+'</li>');
  rt.slice(0,4).forEach(m=>h+='<li>'+esc(t('bn.runtime'))+': '+esc(m)+'</li>');
  h+='</ul><p class="note">'+esc(t('bn.hint'))+'</p><div class="row"><button class="btn bad sm" id="bnRetry">'+esc(t('c.retry'))+'</button><button class="btn ghost sm" id="bnHide">'+esc(t('bn.dismiss'))+'</button></div></div>';
  b.innerHTML=h;
  $('bnRetry').onclick=()=>{S.bannerHidden=false;S.runtime=[];attachAll();};
  $('bnHide').onclick=()=>{S.bannerHidden=true;renderBanner();};
}
function diagText(){return JSON.stringify({at:new Date().toISOString(),uid:S.user&&S.user.uid,role:S.role,loaded:S.loaded,errors:S.errors,counts:S.counts,runtime:S.runtime},null,2);}
function renderDiag(){
  const rows=PATHS.concat(['attendance/'+S.attDay]).concat(S.isHead?HEAD_PATHS:[]);
  $('diBody').innerHTML=rows.map(p=>{
    const err=S.errors[p],ok=S.loaded[p];
    const st=err?'<span class="ust rejected">'+esc(err)+'</span>':ok?'<span class="ust approved">'+esc(t('di.ok'))+'</span>':'<span class="ust pending">'+esc(t('di.waiting'))+'</span>';
    return '<tr><td class="mono">'+esc(p)+'</td><td>'+st+'</td><td class="mono">'+(S.counts[p]!=null?S.counts[p]:'—')+'</td></tr>';
  }).join('');
  const list=PATHS.concat(S.isHead?HEAD_PATHS:[]),total=list.length,ok=list.filter(p=>S.loaded[p]).length,er=Object.keys(S.errors).length,chip=$('dataChip');
  chip.className='chip'+(er?' err':'');
  chip.textContent=!S.started?t('dt.idle'):er?t('dt.err',{n:er}):ok<total?t('dt.wait'):t('dt.ok',{n:ok,total});
}

/* ---------- routing ---------- */
function showPage(p){
  if(!PAGES.includes(p))p='overview';
  if((p==='users'||p==='audit')&&!S.isHead)p='overview';
  S.page=p;
  document.querySelectorAll('#rail button').forEach(b=>b.classList.toggle('on',b.dataset.page===p));
  document.querySelectorAll('.page').forEach(s=>s.classList.toggle('on',s.id==='pg-'+p));
  if(location.hash.slice(1)!==p)history.replaceState(null,'','#'+p);
  renderPage(p);
}
function renderPage(p){
  if(p==='overview')safe(renderOverview,'overview');
  if(p==='operate'){safe(renderStation,'station');safe(renderScanReady,'scan');safe(renderSearch,'search');}
  if(p==='designer')safe(renderDesigner,'designer');
  if(p==='attendance')safe(renderAttendance,'attendance');
  if(p==='meetings')safe(renderMeetings,'meetings');
  if(p==='stations')safe(renderStations,'stations');
  if(p==='students')safe(renderStudents,'students');
  if(p==='users')safe(renderUsers,'users');
  if(p==='audit')safe(renderAudit,'audit');
  if(p==='settings')safe(renderDiag,'diag');
}
function renderEverything(){
  safe(renderOverview,'overview');safe(renderStation,'station');safe(renderScanReady,'scan');safe(renderScanTags,'scanTags');
  safe(renderSearch,'search');safe(renderDesigner,'designer');safe(renderAttendance,'attendance');safe(renderMeetings,'meetings');
  safe(renderStations,'stations');safe(renderStudents,'students');safe(renderUsers,'users');safe(renderAudit,'audit');
  safe(renderDiag,'diag');safe(renderBanner,'banner');
}

/* ---------- overview ---------- */
function renderOverview(){
  const st=Object.entries(S.stations),on=st.filter(([k,v])=>online(v)).length;
  let q=0;Object.values(S.queues).forEach(x=>q+=Object.keys(x||{}).length);
  let pres=0;Object.values(S.att).forEach(r=>{if(r&&r.status==='present')pres++;});
  const mu=mergedUsers(),pend=Object.values(mu).filter(u=>u.status==='pending').length,mc=Object.values(S.students).filter(s=>meetStr(s)).length;
  $('ovStu').textContent=Object.keys(S.students).length;$('ovMeet').textContent=mc;$('ovOn').textContent=on+'/'+st.length;
  $('ovQ').textContent=q;$('ovPres').textContent=pres;$('ovPend').textContent=S.isHead?pend:'—';
  const ub=$('userBdg');ub.textContent=pend;ub.hidden=!pend||!S.isHead;
  const mb=$('meetBdg');mb.textContent=mc;mb.hidden=!mc;
}

/* ---------- station ---------- */
function renderStation(){
  const e=Object.entries(S.stations),sel=$('stSel');
  sel.innerHTML='<option value="">— '+esc(t('c.selectStation'))+' —</option>'+e.map(([k,v])=>'<option value="'+esc(k)+'">'+esc(v.name)+' ('+esc(v.token)+')</option>').join('');
  sel.value=S.station||'';
  $('stChips').innerHTML=e.map(([k,v])=>'<button class="btn '+(k===S.station?'':'ghost')+' sm" data-k="'+esc(k)+'"><span class="dot'+(online(v)?' on':'')+'"></span>'+esc(v.name)+'<span class="mono" style="opacity:.7">'+esc(v.token)+'</span><span class="mono">'+qCount(k)+'</span></button>').join('')||'<span class="muted">'+esc(t('st.none'))+'</span>';
  const st=S.stations[S.station],pill=$('stPill');
  if(!st){pill.textContent=t('c.notSelected');pill.className='pill off';}
  else if(online(st)){pill.textContent=t('c.online');pill.className='pill';}
  else{pill.textContent=t('c.offline');pill.className='pill off';}
  $('stQI').textContent=t('c.queue')+' '+(S.station?qCount(S.station):0);
  $('stTxt').textContent=st?st.name:t('c.selectStation');
  $('stDot').className='dot'+(S.station&&online(st)?' on':'');
  $('stQ').textContent=t('c.queue')+' '+(S.station?qCount(S.station):0);
}
function pickStation(k){S.station=k&&S.stations[k]?k:null;if(S.station){localStorage.setItem(LS,S.station);toast(t('op.stationSelected')+': '+S.stations[S.station].name);}else localStorage.removeItem(LS);renderStation();$('stModal').classList.remove('on');}

/* ---------- operate ---------- */
function renderScanReady(){const b=$('scan');setScan(b,'ready');b.innerHTML=esc(t('op.ready'))+'<small>'+esc(t('op.readySub'))+'</small>';}
function renderScanTags(){$('lastScan').textContent=t('op.lastScan')+': '+(S.lastScan||'—');$('sentTag').textContent=t('op.sent')+' '+S.sent;}
const attBadge=a=>a?(a.status==='present'?'<span class="ab p">'+esc(t('c.present'))+' <i>'+fmtT(a.time)+'</i></span>':'<span class="ab a">'+esc(t('c.absent'))+' <i>'+fmtT(a.time)+'</i></span>'):'<span class="ab">'+esc(t('c.unmarked'))+'</span>';
function renderSearch(){
  const q=$('q').value.trim();if(!q){$('res').innerHTML='';return;}
  const hits=Object.entries(S.students).filter(([k,s])=>LL.searchMatch(s,q)).sort(byClass).slice(0,40);
  $('res').innerHTML=hits.map(([k,s])=>'<div class="hit"><div><b>'+esc(s.nameEn||s.nameZh)+'</b> ／ '+esc(s.nameZh||'')+' '+attBadge(S.att[k])+'<br><span class="muted">'+esc(t('sd.sid'))+' '+esc(s.studentId||'—')+' · '+esc(s.cls||'')+' '+esc(s.classNo||'')+' · '+esc(t('c.card'))+' '+esc(s.cardId||'—')+'</span>'+meetHtml(s)+'</div><div class="row" style="margin:0"><button class="btn warn mini" data-act="print" data-k="'+esc(k)+'">'+esc(t('c.print'))+'</button><button class="btn ok mini" data-act="pres" data-k="'+esc(k)+'">'+esc(t('c.present'))+'</button><button class="btn bad mini" data-act="abs" data-k="'+esc(k)+'">'+esc(t('c.absent'))+'</button><button class="btn gray mini" data-act="meet" data-k="'+esc(k)+'">'+esc(t('m.edit'))+'</button>'+(S.unknown?'<button class="btn gray mini" data-act="bind" data-k="'+esc(k)+'">'+esc(t('op.bindCard'))+'</button>':'')+'</div></div>').join('')||'<p class="muted" style="margin-top:10px">'+esc(t('c.noMatch'))+'</p>';
}
async function markAtt(k,status,by){
  const s=S.students[k];if(!s)return;
  await db().ref('parents/attendance/'+S.attDay+'/'+k).set({status,time:Date.now(),by,studentId:String(s.studentId||''),cls:s.cls||'',classNo:s.classNo||'',nameEn:s.nameEn||'',nameZh:s.nameZh||'',cardId:s.cardId||''});
}
async function queueLabel(s){
  if(!S.station||!S.stations[S.station]){toast(t('op.needStation'));showPage('operate');$('stModal').classList.add('on');return false;}
  await db().ref('parents/queues/'+S.station).push(Object.assign({type:'label',studentId:String(s.studentId||''),cls:s.cls||'',classNo:s.classNo||'',nameEn:s.nameEn||'',nameZh:s.nameZh||'',cardId:s.cardId||''},meetOf(s),{copies:1,createdAt:Date.now(),done:false}));
  S.sent++;renderScanTags();return true;
}
async function handleScan(code){
  S.lastScan=code;renderScanTags();
  const box=$('scan'),k=S.byCard[normCard(code)];
  if(!k){S.unknown=code;setScan(box,'err');box.innerHTML=esc(t('op.unreg'))+': '+esc(code)+'<small>'+esc(t('op.bindHint'))+'</small>';
    $('bindHelp').style.display='block';$('bindHelp').textContent=t('op.bindHelp',{card:code});renderSearch();setTimeout(renderScanReady,4200);return;}
  S.unknown=null;$('bindHelp').style.display='none';
  const s=S.students[k];setScan(box,'wait');box.innerHTML=esc(t('c.card'))+' '+esc(code)+'<small>'+esc(t('op.marking'))+'</small>';
  try{await markAtt(k,'present','scan');}catch(e){werr(e);}
  let printed=false;try{printed=S.station?await queueLabel(s):false;}catch(e){werr(e);}
  setScan(box,'ok');
  box.innerHTML=esc(s.nameEn||s.nameZh)+'<small>'+esc(t('sd.sid'))+' '+esc(s.studentId||'—')+' · '+esc(s.cls||'')+' '+esc(s.classNo||'')+(meetStr(s)?' · '+esc(meetStr(s)):'')+'</small><small>'+esc(t('op.markedPresent'))+' '+fmtT(Date.now())+(printed?' → '+esc(S.stations[S.station].name):' · '+esc(t('op.onlyMarked')))+'</small>';
  setTimeout(renderScanReady,4200);
}

/* ---------- designer ---------- */
const dzScale=()=>LL.MM*S.zoom;
const curBox=()=>S.layout.boxes.find(b=>b.id===S.selBox)||null;
const effText=()=>{const e=LL.eff(S.layout);return t('dz.eff')+': '+t('dz.origin')+' ('+e.x+', '+e.y+') · '+t('dz.sizeW')+' '+e.w+'×'+e.h+' mm';};
function setMode(m){
  S.layout.mode=m;
  document.querySelectorAll('#modeSeg button').forEach(b=>b.classList.toggle('on',b.dataset.mode===m));
  $('basicSec').style.display=m==='simple'?'block':'none';
  $('boxSec').style.display=m==='designer'?'block':'none';
  $('boxTools').style.display=m==='designer'?'flex':'none';
  $('canvasWrap').style.display=m==='designer'?'flex':'none';
  $('canvasHint').style.display=m==='designer'?'block':'none';
  renderDesigner();
}
function syncDesignerInputs(){
  const l=S.layout;
  $('dcW').value=l.doc.w;$('dcH').value=l.doc.h;$('hdT').value=l.hide.top;$('hdL').value=l.hide.left;
  $('bTop').value=l.simple.topMm;$('bSide').value=l.simple.sideMm;$('bEn').value=l.simple.enSize;$('bZh').value=l.simple.zhSize;$('bMs').value=l.simple.meetSize;$('bGap').value=l.simple.gapMm;
  $('bEnT').value=l.simple.enText;$('bZhT').value=l.simple.zhText;$('bMeT').value=l.simple.meetText;
  $('smCls').value=l.sample.cls||'';$('smNo').value=l.sample.classNo||'';$('smEn').value=l.sample.nameEn||'';$('smZh').value=l.sample.nameZh||'';$('smCard').value=l.sample.cardId||'';
  $('smTime').value=l.sample.meetTime||'';$('smTeacher').value=l.sample.meetTeacher||'';$('smRoom').value=l.sample.meetRoom||'';
  const sid=document.getElementById('smSid');if(sid)sid.value=l.sample.studentId||'';
  $('effInfo').textContent=effText();syncBoxProps();
}
function syncBoxProps(){
  const b=curBox();$('boxNone').style.display=b?'none':'block';$('boxProps').style.display=b?'block':'none';if(!b)return;
  $('tbText').value=b.text;$('tbX').value=b.x;$('tbY').value=b.y;$('tbW').value=b.w;$('tbH').value=b.h;
  $('tbSize').value=b.size;$('tbWeight').value=String(b.weight);$('tbLh').value=b.lineHeight;$('tbAx').value=b.align;$('tbAy').value=b.valign;$('tbColor').value=b.color;
}
function renderChips(){$('phChips').innerHTML=LL.PH.map(k=>'<button type="button" data-k="'+k+'">{'+k+'}<i>'+esc(t('l.'+k))+'</i></button>').join('');}
function renderCanvas(){
  if(S.layout.mode!=='designer')return;
  const e=LL.eff(S.layout),z=dzScale(),c=$('canvas');
  c.style.width=e.w*z+'px';c.style.height=e.h*z+'px';
  c.innerHTML=S.layout.boxes.map(b=>{const j=b.valign==='top'?'flex-start':b.valign==='bottom'?'flex-end':'center';
    return '<div class="tb'+(b.id===S.selBox?' on':'')+'" data-id="'+esc(b.id)+'" style="left:'+b.x*z+'px;top:'+b.y*z+'px;width:'+b.w*z+'px;height:'+b.h*z+'px;font-size:'+b.size*S.zoom+'px;font-weight:'+b.weight+';text-align:'+b.align+';color:'+b.color+';line-height:'+b.lineHeight+';justify-content:'+j+'">'+esc(LL.fill(b.text,S.layout.sample)).replace(/\n/g,'<br>')+'<span class="hd"></span></div>';}).join('');
}
function renderPreview(){const e=LL.eff(S.layout),p=$('preview');p.style.width=e.w+'mm';p.style.height=e.h+'mm';p.innerHTML=LL.stageHTML(S.layout,S.layout.sample,false);$('effInfo').textContent=effText();}
function renderDesigner(){renderChips();renderCanvas();renderPreview();syncBoxProps();}
function moveBoxEl(b){const el=[...$('canvas').querySelectorAll('.tb')].find(x=>x.dataset.id===b.id);if(!el)return;const z=dzScale();el.style.left=b.x*z+'px';el.style.top=b.y*z+'px';el.style.width=b.w*z+'px';el.style.height=b.h*z+'px';}

/* ---------- attendance ---------- */
function attachAtt(day){
  if(S.attRef)S.attRef.off();
  S.attDay=day;S.att={};
  const p='attendance/'+day;delete S.loaded[p];delete S.errors[p];
  S.attRef=db().ref('parents/'+p);
  S.attRef.on('value',snap=>{
    S.att=snap.val()||{};S.loaded[p]=true;delete S.errors[p];S.counts[p]=Object.keys(S.att).length;
    safe(renderAttendance,'attendance');safe(renderSearch,'search');safe(renderOverview,'overview');safe(renderDiag,'diag');safe(renderBanner,'banner');
  },err=>{S.errors[p]=err.code||String(err.message||err);safe(renderDiag,'diag');safe(renderBanner,'banner');});
}
function attRows(){const cf=$('attCls').value;return Object.entries(S.students).filter(([k,s])=>!cf||String(s.cls||'').toUpperCase()===cf).sort(byClass);}
function renderAttendance(){
  const cls=[...new Set(Object.values(S.students).map(s=>String(s.cls||'').toUpperCase()).filter(Boolean))].sort();
  const sel=$('attCls'),cur=sel.value;
  sel.innerHTML='<option value="">'+esc(t('c.all'))+'</option>'+cls.map(c=>'<option>'+esc(c)+'</option>').join('');
  if(cls.includes(cur))sel.value=cur;
  const rows=attRows();let p=0,a=0;rows.forEach(([k])=>{const r=S.att[k];if(r)r.status==='present'?p++:a++;});
  $('attP').textContent=t('c.present')+' '+p;$('attA').textContent=t('c.absent')+' '+a;$('attN').textContent=t('c.unmarked')+' '+(rows.length-p-a);
  $('attBody').innerHTML=rows.slice(0,1000).map(([k,s])=>{const r=S.att[k];
    return '<tr><td>'+esc(s.cls)+'</td><td>'+esc(s.classNo)+'</td><td><b>'+esc(s.nameEn||'')+'</b></td><td>'+esc(s.nameZh||'')+'</td><td class="mc mono">'+esc(s.meetTime||'—')+'</td><td class="mc">'+esc(s.meetTeacher||'—')+'</td><td>'+attBadge(r)+'</td><td class="mono">'+(r?fmtT(r.time):'—')+'</td><td>'+esc(byLabel(r&&r.by))+'</td><td><button class="btn ok mini" data-act="pres" data-k="'+esc(k)+'">'+esc(t('c.present'))+'</button> <button class="btn bad mini" data-act="abs" data-k="'+esc(k)+'">'+esc(t('c.absent'))+'</button>'+(r?' <button class="btn gray mini" data-act="clr" data-k="'+esc(k)+'">'+esc(t('a.clear'))+'</button>':'')+'</td></tr>';}).join('')
    ||'<tr><td colspan="10" style="text-align:center">'+esc(t('c.noData'))+'</td></tr>';
}

/* ---------- meetings ---------- */
function meetRows(){
  const f=S.meet;let rows=Object.entries(S.students);
  if(f.only)rows=rows.filter(([k,s])=>meetStr(s));
  if(f.teacher)rows=rows.filter(([k,s])=>String(s.meetTeacher||'')===f.teacher);
  if(f.room)rows=rows.filter(([k,s])=>String(s.meetRoom||'')===f.room);
  if(f.q)rows=rows.filter(([k,s])=>LL.searchMatch(s,f.q));
  return rows.sort(byClass);
}
function fillSel(el,vals,all){if(!el)return;const cur=el.value;el.innerHTML='<option value="">'+esc(all)+'</option>'+vals.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');if(vals.includes(cur))el.value=cur;}
function renderMeetings(){
  const all=Object.values(S.students);
  const teachers=[...new Set(all.map(s=>String(s.meetTeacher||'').trim()).filter(Boolean))].sort();
  const rooms=[...new Set(all.map(s=>String(s.meetRoom||'').trim()).filter(Boolean))].sort();
  fillSel($('mtTeacher'),teachers,t('m.allTeachers'));fillSel($('mtRoom'),rooms,t('m.allRooms'));
  const sc=all.filter(s=>meetStr(s)).length;
  $('mtS1').textContent=t('m.scheduled')+' '+sc;$('mtS2').textContent=t('m.unscheduled')+' '+(all.length-sc);
  $('mtS3').textContent=t('m.teachers')+' '+teachers.length;$('mtS4').textContent=t('m.rooms')+' '+rooms.length;
  const rows=meetRows(),cell=(v,mono)=>v?'<span class="mc'+(mono?' mono':'')+'">'+esc(v)+'</span>':'<span class="mc no">'+esc(t('m.none'))+'</span>';
  $('mtBody').innerHTML=rows.slice(0,1000).map(([k,s])=>'<tr><td>'+esc(s.cls)+'</td><td>'+esc(s.classNo)+'</td><td><b>'+esc(s.nameEn||'')+'</b></td><td>'+esc(s.nameZh||'')+'</td><td>'+cell(s.meetTime,true)+'</td><td>'+cell(s.meetTeacher)+'</td><td>'+cell(s.meetRoom)+'</td><td><button class="btn gray mini" data-act="meet" data-k="'+esc(k)+'">'+esc(t('m.edit'))+'</button> <button class="btn warn mini" data-act="print" data-k="'+esc(k)+'">'+esc(t('c.print'))+'</button>'+(meetStr(s)?' <span class="mp">'+esc(t('m.scheduled'))+'</span>':'')+'</td></tr>').join('')
    ||'<tr><td colspan="8" style="text-align:center">'+esc(Object.keys(S.students).length?t('m.empty'):t('m.noStudents'))+'</td></tr>';
  renderOverview();
}
function renderMeetPreview(){
  const s=S.students[S.mmUid]||{},d=Object.assign({},s,{meetTime:$('mmTime').value,meetTeacher:$('mmTeacher').value,meetRoom:$('mmRoom').value});
  const e=LL.eff(S.layout),p=$('mmPreview');p.style.width=e.w+'mm';p.style.height=e.h+'mm';p.innerHTML=LL.stageHTML(S.layout,d,false);
}
function openMeet(k){
  if(!guard())return;const s=S.students[k];if(!s)return;
  S.mmUid=k;S.mmBusy=false;
  $('mmWho').innerHTML='<b>'+esc(s.nameEn||'')+'</b> '+esc(s.nameZh||'')+' · '+esc(t('sd.sid'))+' '+esc(s.studentId||'—')+' · '+esc(s.cls||'')+' '+esc(s.classNo||'')+' · '+esc(t('c.card'))+' '+esc(s.cardId||'—');
  $('mmTime').value=s.meetTime||'';$('mmTeacher').value=s.meetTeacher||'';$('mmRoom').value=s.meetRoom||'';
  $('mmStatus').textContent='';$('mmStatus').className='status';
  $('mmSave').disabled=false;$('mmClear').disabled=false;$('mmCancel').disabled=false;
  I18N.apply($('mtModal'));renderMeetPreview();
  $('mtModal').classList.add('on');document.body.style.overflow='hidden';setTimeout(()=>$('mmTime').focus(),30);
}
function closeMeet(){if(S.mmBusy)return;$('mtModal').classList.remove('on');document.body.style.overflow='';S.mmUid=null;}

/* ---------- stations ---------- */
function renderStations(){
  $('stBody').innerHTML=Object.entries(S.stations).map(([k,v])=>'<tr><td><b>'+esc(v.name)+'</b></td><td class="mono">'+esc(v.token)+'</td><td>'+esc(t('st.global'))+'</td><td><span class="dot'+(online(v)?' on':'')+'"></span> '+esc(t(online(v)?'c.online':'c.offline'))+'<br><span class="muted">'+esc(t('c.queue'))+' '+qCount(k)+'</span></td><td><button class="btn ghost mini" data-act="use" data-k="'+esc(k)+'">'+esc(t('c.selectStation'))+'</button> <button class="btn gray mini" data-act="edit" data-k="'+esc(k)+'">'+esc(t('c.edit'))+'</button> <button class="btn bad mini" data-act="del" data-k="'+esc(k)+'">'+esc(t('c.delete'))+'</button></td></tr>').join('')
    ||'<tr><td colspan="5" style="text-align:center">'+esc(t('st.none'))+'</td></tr>';
}

/* ---------- students + split Excel merge ---------- */
function reindex(){
  S.bySid={};S.byCard={};S.byClass={};S.byName={};
  Object.entries(S.students).forEach(([k,s])=>{
    const sid=normSid(s.studentId);if(sid&&!S.bySid[sid])S.bySid[sid]=k;
    const c=normCard(s.cardId);if(c&&!S.byCard[c])S.byCard[c]=k;
    const cn=String(s.cls||'').toUpperCase()+'|'+String(s.classNo||'').replace(/^0+/,'');
    if(cn!=='|'&&!S.byClass[cn])S.byClass[cn]=k;
    const en=String(s.nameEn||'').trim().toLowerCase(),zh=String(s.nameZh||'').trim();
    if(en&&!S.byName['en:'+en])S.byName['en:'+en]=k;
    if(zh&&!S.byName['zh:'+zh])S.byName['zh:'+zh]=k;
  });
}
function renderStudents(){
  const q=$('dbQ').value.trim();let rows=Object.entries(S.students).sort(byClass);
  if(q)rows=rows.filter(([k,s])=>LL.searchMatch(s,q));
  $('dbCount').textContent=rows.length+' '+t('c.records');
  const cell=v=>v?esc(v):'<span class="mc no">—</span>';
  $('dbBody').innerHTML=rows.slice(0,800).map(([k,s])=>'<tr><td class="mono"><b>'+esc(s.studentId||'—')+'</b></td><td class="mono">'+esc(s.cardId||'—')+'</td><td>'+esc(s.cls)+'</td><td>'+esc(s.classNo)+'</td><td>'+esc(s.nameEn||'')+'</td><td>'+esc(s.nameZh||'')+'</td><td class="mc mono">'+cell(s.meetTime)+'</td><td class="mc">'+cell(s.meetTeacher)+'</td><td class="mc">'+cell(s.meetRoom)+'</td><td><button class="btn gray mini" data-act="meet" data-k="'+esc(k)+'">'+esc(t('m.edit'))+'</button> <button class="btn warn mini" data-act="print" data-k="'+esc(k)+'">'+esc(t('c.print'))+'</button> <button class="btn bad mini" data-act="delstu" data-k="'+esc(k)+'">'+esc(t('c.delete'))+'</button></td></tr>').join('')
    ||'<tr><td colspan="10" style="text-align:center">'+esc(t('c.noData'))+'</td></tr>';
}
const nk=s=>String(s==null?'':s).toLowerCase().replace(/[\s_\-()（）:：.\/]/g,'');
const COLS={
  studentId:['studentid','studentno','studentnumber','sid','學生編號','學生編號id','學號','學生id'],
  cardId:['cardid','card','cardno','卡號','學生證號','拍卡號','八達通號'],
  cls:['class','form','班別','班級'],
  classNo:['classno','no','班號','座號','班內編號'],
  nameEn:['englishname','nameen','english','英文姓名','英文名'],
  nameZh:['chinesename','namezh','chinese','中文姓名','中文名','姓名'],
  meetTime:['meettime','meetingtime','time','會面時間','見面時間','約見時間','時間'],
  meetTeacher:['meetteacher','meetingteacher','teacher','會面老師','約見老師','老師','教師'],
  meetRoom:['meetroom','meetingroom','room','location','venue','meetlocation','meetinglocation','會面地點','見面地點','地點','課室','教室']
};
const ID_FIELDS=['studentId','cardId','cls','classNo','nameEn','nameZh'];
const MEET_FIELDS=['meetTime','meetTeacher','meetRoom'];
function mapSheet(rows){
  const present={},out=[];
  rows.forEach(r=>{
    const o={};Object.keys(r).forEach(k=>{o[nk(k)]=r[k];});
    const rec={};
    Object.keys(COLS).forEach(f=>{
      for(const alias of COLS[f]){
        if(Object.prototype.hasOwnProperty.call(o,alias)){
          present[f]=true;
          const v=String(o[alias]==null?'':o[alias]).trim();
          if(v!=='')rec[f]=f==='cls'?v.toUpperCase():v;
          else if(S.imp.blank)rec[f]='';
          break;
        }
      }
    });
    out.push(rec);
  });
  return {rows:out,present:Object.keys(present)};
}
function detectType(present){
  const hasMeet=present.some(f=>MEET_FIELDS.includes(f));
  const hasId=present.some(f=>['nameEn','nameZh','studentId','cardId'].includes(f));
  return hasMeet&&!hasId?'meetings':'students';
}
function resolveKey(rec){
  const sid=normSid(rec.studentId);
  if(sid&&S.bySid[sid])return {key:S.bySid[sid],by:'sid'};
  const card=normCard(rec.cardId);
  if(card&&S.byCard[card])return {key:S.byCard[card],by:'card'};
  if(rec.cls&&rec.classNo){
    const cn=String(rec.cls).toUpperCase()+'|'+String(rec.classNo).replace(/^0+/,'');
    if(S.byClass[cn])return {key:S.byClass[cn],by:'class'};
  }
  const en=String(rec.nameEn||'').trim().toLowerCase(),zh=String(rec.nameZh||'').trim();
  if(en&&S.byName['en:'+en])return {key:S.byName['en:'+en],by:'name'};
  if(zh&&S.byName['zh:'+zh])return {key:S.byName['zh:'+zh],by:'name'};
  return null;
}
async function runImport(file){
  if(!guard())return;
  if(typeof XLSX==='undefined'){toast(t('a.xlsMissing'));return;}
  const msg=$('impMsg');msg.textContent=t('c.processing');
  const buf=await file.arrayBuffer();
  const wb=XLSX.read(buf,{type:'array'});
  const raw=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
  const mapped=mapSheet(raw);
  if(!mapped.rows.length){msg.textContent=t('sd.noValid');return;}
  const type=S.imp.type==='auto'?detectType(mapped.present):S.imp.type;
  const fields=(type==='meetings'?MEET_FIELDS:ID_FIELDS.concat(MEET_FIELDS)).filter(f=>mapped.present.includes(f));
  const det=document.getElementById('impDetected');
  if(det)det.textContent=t('imp.detected')+': '+t(type==='meetings'?'imp.meetings':'imp.students')+' · '+fields.join(', ');
  let add=0,upd=0,skip=0;const unmatched=[];
  for(let i=0;i<mapped.rows.length;i++){
    const rec=mapped.rows[i];
    const patch={};fields.forEach(f=>{if(rec[f]!=null)patch[f]=rec[f];});
    const hasData=Object.keys(patch).some(k=>String(patch[k]||'')!=='');
    if(!hasData){skip++;continue;}
    const hit=resolveKey(rec);
    try{
      if(hit){
        patch.updatedAt=Date.now();patch.updatedBy=S.user.email||S.user.uid;
        await db().ref('parents/students/'+hit.key).update(patch);
        const cur=S.students[hit.key]||{};S.students[hit.key]=Object.assign({},cur,patch);reindex();
        upd++;
      }else if(type==='meetings'){
        unmatched.push(Object.assign({reason:t('imp.noStudent')},rec));skip++;
      }else{
        if(!rec.nameEn&&!rec.nameZh&&!rec.studentId){unmatched.push(Object.assign({reason:t('sd.needName')},rec));skip++;continue;}
        patch.updatedAt=Date.now();patch.updatedBy=S.user.email||S.user.uid;
        const key=rec.studentId?sidKey(rec.studentId):null;
        if(key&&!S.students[key]){await db().ref('parents/students/'+key).set(patch);S.students[key]=patch;}
        else{const r=await db().ref('parents/students').push(patch);S.students[r.key]=patch;}
        reindex();add++;
      }
    }catch(e){unmatched.push(Object.assign({reason:String(e&&e.code||e.message||e)},rec));skip++;}
    if(i%12===0)msg.textContent=t('c.processing')+' '+(i+1)+' / '+mapped.rows.length;
  }
  S.imp.unmatched=unmatched;
  msg.textContent=t('imp.summary',{add,upd,unmatched:unmatched.length,skip});
  const ub=document.getElementById('impUnmatched');if(ub)ub.hidden=!unmatched.length;
  safe(renderStudents,'students');safe(renderMeetings,'meetings');safe(renderAttendance,'attendance');safe(renderOverview,'overview');
}
function mountImportUI(){
  const card=$('xls')&&$('xls').closest('.card');if(!card||document.getElementById('impType'))return;
  const wrap=document.createElement('div');
  wrap.innerHTML='<div class="g" style="margin:10px 0">'
   +'<div><label data-i18n="imp.type"></label><select id="impType"><option value="auto" data-i18n="imp.auto"></option><option value="students" data-i18n="imp.students"></option><option value="meetings" data-i18n="imp.meetings"></option></select></div>'
   +'</div>'
   +'<label class="check" style="padding:0"><input type="checkbox" id="impBlank"><span data-i18n="imp.blank"></span></label>'
   +'<p class="muted" style="margin-top:8px" data-i18n="imp.hint"></p>'
   +'<p class="muted" data-i18n="imp.blankHint"></p>'
   +'<p class="muted" id="impDetected"></p>'
   +'<div class="row"><button class="btn gray sm" id="impUnmatched" hidden data-i18n="imp.download"></button></div>';
  const anchor=$('impMsg');
  card.insertBefore(wrap,anchor);
  I18N.apply(wrap);
  $('impType').onchange=()=>{S.imp.type=$('impType').value;};
  $('impBlank').onchange=()=>{S.imp.blank=$('impBlank').checked;};
  $('impUnmatched').onclick=()=>{
    if(!S.imp.unmatched.length)return toast(t('imp.none'));
    if(typeof XLSX==='undefined'){download('unmatched.json',S.imp.unmatched);return;}
    const ws=XLSX.utils.json_to_sheet(S.imp.unmatched),wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Unmatched');XLSX.writeFile(wb,'unmatched-rows.xlsx');
  };
  const sidWrap=document.createElement('div');
  sidWrap.innerHTML='<label data-i18n="sd.sid"></label><input id="aSid" data-ph="sd.sidPh">';
  const g=$('aCard')&&$('aCard').closest('.g');
  if(g){g.insertBefore(sidWrap,g.firstChild);I18N.apply(sidWrap);}
  const sg=$('smCard')&&$('smCard').closest('.g');
  if(sg&&!document.getElementById('smSid')){
    const d=document.createElement('div');d.innerHTML='<label data-i18n="sd.sid"></label><input id="smSid">';
    sg.insertBefore(d,sg.firstChild);I18N.apply(d);
    $('smSid').addEventListener('input',()=>{S.layout.sample.studentId=$('smSid').value;renderDesigner();});
  }
}

/* ---------- users (Head Admin only) ---------- */
function mergedUsers(){
  const m={};
  Object.entries(S.users).forEach(([uid,u])=>{m[uid]=Object.assign({},u,{_legacy:false});});
  Object.entries(S.admins).forEach(([uid,v])=>{if(v!==true)return;
    if(m[uid]){m[uid].role='head';m[uid].status='approved';}
    else m[uid]={email:'',name:'',role:'head',status:'approved',createdAt:0,_legacy:true};});
  return m;
}
function renderUsers(){
  const box=$('uBody');if(!box)return;
  if(!S.isHead){box.innerHTML='<tr><td colspan="6" style="text-align:center">'+esc(t('audit.usersHeadOnly'))+'</td></tr>';return;}
  const map=mergedUsers(),rows=Object.entries(map).filter(([k,u])=>S.uFilter==='all'||u.status===S.uFilter).sort((a,b)=>(b[1].createdAt||0)-(a[1].createdAt||0));
  $('uCount').textContent=rows.length+' '+t('c.users');
  const me=S.user?S.user.uid:'';
  box.innerHTML=rows.map(([uid,u])=>{
    const self=uid===me,acts=[];
    if(!u._legacy){
      if(u.status!=='approved')acts.push('<button class="btn ok mini" data-act="approve" data-k="'+esc(uid)+'">'+esc(t('u.approve'))+'</button>');
      if(u.status!=='rejected')acts.push('<button class="btn bad mini" data-act="reject" data-k="'+esc(uid)+'">'+esc(t('u.reject'))+'</button>');
      if(u.status==='approved'&&!self)acts.push('<button class="btn gray mini" data-act="revoke" data-k="'+esc(uid)+'">'+esc(t('u.revoke'))+'</button>');
    }
    if(!self)['head','admin','staff'].forEach(r=>{if(u.role!==r)acts.push('<button class="btn gray mini" data-act="role" data-role="'+r+'" data-k="'+esc(uid)+'">'+esc(t(r==='head'?'role.setHead':r==='admin'?'role.setAdmin':'role.setStaff'))+'</button>');});
    if(!self)acts.push('<button class="btn bad mini" data-act="deluser" data-k="'+esc(uid)+'">'+esc(t('ud.title'))+'</button>');
    const mail=u.email?esc(u.email):'<span class="muted">'+esc(t('ud.noEmail'))+'</span><br><span class="uid">'+esc(uid)+'</span>';
    return '<tr><td><b>'+esc(u.name||'—')+'</b>'+(self?' <span class="muted">'+esc(t('c.you'))+'</span>':'')+(u._legacy?'<span class="legacy">'+esc(t('u.legacy'))+'</span>':'')+'</td><td>'+mail+'</td><td>'+esc(roleLabel(u.role))+'</td><td><span class="ust '+esc(u.status||'pending')+'">'+esc(t('c.'+(u.status||'pending')))+'</span></td><td class="mono">'+(u.createdAt?fmtD(u.createdAt):'—')+'</td><td>'+acts.join(' ')+'</td></tr>';
  }).join('')||'<tr><td colspan="6" style="text-align:center">'+esc(t('u.none'))+'</td></tr>';
  renderOverview();
}
async function userSet(uid,patch){
  if(!guardHead())return;
  const me=S.user.uid;
  if(uid===me&&(patch.status||patch.role))return toast(t('u.noSelf'));
  if(patch.status==='rejected'&&!confirm(t('u.rejectQ')))return;
  try{
    const p=Object.assign({},patch);
    if(patch.status==='approved'){p.approvedAt=Date.now();p.approvedBy=me;}
    if(!S.users[uid])await db().ref('users/'+uid).set(Object.assign({email:'',name:'',status:'pending',role:'staff',createdAt:Date.now()},p));
    else await db().ref('users/'+uid).update(p);
    if(patch.role==='head')await db().ref('admins/'+uid).set(true);
    if(patch.role==='admin'||patch.role==='staff')await db().ref('admins/'+uid).remove();
    toast(t('u.updated'));
  }catch(e){werr(e);}
}
const udRec=()=>S.udUid?mergedUsers()[S.udUid]:null;
const udToken=u=>(u&&u.email?String(u.email):String(S.udUid||''));
function renderUserDelete(){
  const u=udRec();if(!u)return;
  const rows=[[t('c.name'),u.name||'—'],[t('c.email'),u.email||t('ud.noEmail')],[t('ud.uid'),S.udUid],[t('c.role'),roleLabel(u.role)],[t('c.status'),t('c.'+(u.status||'pending'))]];
  $('udSum').innerHTML=rows.map(([k,v])=>'<div><span>'+esc(k)+'</span><b>'+esc(v)+'</b></div>').join('');
  let n='<b>'+esc(t('ud.what'))+'</b><ul class="ulist"><li>'+esc(t('ud.r1'))+'</li><li>'+esc(t('ud.r2'))+'</li><li>'+esc(t('ud.r3'))+'</li></ul><div style="margin-top:8px">'+esc(AUTH_DELETE_ENDPOINT?t('ud.willDelete'):t('ud.manual'))+'</div>';
  if(u.role==='head')n+='<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--acl);color:var(--wn)">'+esc(t('ud.adminWarn'))+'</div>';
  $('udNote').innerHTML=n;
  $('udConsoleRow').style.display=AUTH_DELETE_ENDPOINT?'none':'flex';
  $('udConsole').href='https://console.firebase.google.com/project/'+Auth.cfg.projectId+'/authentication/users';
  $('udLabel').textContent=u.email?t('ud.typeEmail'):t('ud.typeUid');
  $('udInput').placeholder=udToken(u);
  validateUd();
}
function validateUd(){const u=udRec();$('udOk').disabled=!u||S.udBusy||$('udInput').value.trim().toLowerCase()!==udToken(u).toLowerCase();}
function openUd(uid){
  if(!guardHead())return;
  if(S.user&&uid===S.user.uid)return toast(t('ud.noSelf'));
  S.udUid=uid;S.udBusy=false;$('udInput').value='';$('udInput').disabled=false;$('udCancel').disabled=false;
  $('udStatus').textContent='';$('udStatus').className='status';
  I18N.apply($('udModal'));renderUserDelete();
  $('udModal').classList.add('on');document.body.style.overflow='hidden';setTimeout(()=>$('udInput').focus(),30);
}
function closeUd(){if(S.udBusy)return;$('udModal').classList.remove('on');document.body.style.overflow='';S.udUid=null;}

/* ---------- audit (Head Admin only) ---------- */
function mountAuditPage(){
  if(document.getElementById('pg-audit'))return;
  const rail=document.getElementById('rail');
  const usersBtn=rail&&rail.querySelector('button[data-page="users"]');
  if(rail&&!rail.querySelector('button[data-page="audit"]')){
    const b=document.createElement('button');b.dataset.page='audit';
    b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-4"/></svg><span class="lbl" data-i18n="audit.nav"></span>';
    b.onclick=()=>showPage('audit');
    if(usersBtn&&usersBtn.nextSibling)rail.insertBefore(b,usersBtn.nextSibling);else rail.appendChild(b);
  }
  const main=document.querySelector('.main');
  const sec=document.createElement('section');sec.className='page';id(sec,'pg-audit');
  sec.innerHTML='<div class="phead"><h2 data-i18n="audit.title"></h2><p data-i18n="audit.desc"></p></div>'
  +'<div class="card">'
  +'<div class="row" style="margin-bottom:12px"><div class="seg" id="audSeg"><button data-v="live" class="on" data-i18n="audit.live"></button><button data-v="sessions" data-i18n="audit.sessions"></button><button data-v="activity" data-i18n="audit.activity"></button><button data-v="byuser" data-i18n="audit.byuser"></button></div><span class="spacer"></span><button class="btn gray sm" id="audRefresh" data-i18n="audit.refresh"></button></div>'
  +'<div class="filters">'
  +'<div><label data-i18n="audit.user"></label><select id="audUser"></select></div>'
  +'<div><label data-i18n="audit.kind"></label><select id="audKind"><option value="" data-i18n="audit.k.all"></option><option value="db" data-i18n="audit.k.db"></option><option value="ui" data-i18n="audit.k.ui"></option><option value="auth" data-i18n="audit.k.auth"></option><option value="print" data-i18n="audit.k.print"></option><option value="view" data-i18n="audit.k.view"></option><option value="session" data-i18n="audit.k.session"></option><option value="error" data-i18n="audit.k.error"></option></select></div>'
  +'<div><label data-i18n="audit.from"></label><input type="date" id="audFrom" style="width:auto"></div>'
  +'<div><label data-i18n="audit.to"></label><input type="date" id="audTo" style="width:auto"></div>'
  +'<div class="grow"><label data-i18n="audit.search"></label><input type="text" id="audQ" autocomplete="off"></div>'
  +'</div>'
  +'<div class="row" style="margin-bottom:12px"><span class="tag" id="audCount"></span><span class="spacer"></span><button class="btn gray sm" id="audXls" data-i18n="audit.export"></button><button class="btn gray sm" id="audJson" data-i18n="audit.exportJson"></button><button class="btn bad sm" id="audPurge" data-i18n="audit.purge"></button></div>'
  +'<div class="scroll" style="max-height:620px" id="audBox"></div>'
  +'<p class="muted" style="margin-top:12px" data-i18n="audit.privacy"></p>'
  +'</div>';
  const settings=document.getElementById('pg-settings');
  main.insertBefore(sec,settings||null);
  I18N.apply(sec);
  document.querySelectorAll('#audSeg button').forEach(b=>b.onclick=()=>{S.auditView=b.dataset.v;S.auditSid=null;document.querySelectorAll('#audSeg button').forEach(x=>x.classList.toggle('on',x===b));renderAudit();});
  ['audUser','audKind','audFrom','audTo'].forEach(id=>$(id).onchange=()=>{S.auditFilter={uid:$('audUser').value,kind:$('audKind').value,from:$('audFrom').value,to:$('audTo').value,q:$('audQ').value.trim().toLowerCase()};renderAudit();});
  $('audQ').addEventListener('input',()=>{S.auditFilter.q=$('audQ').value.trim().toLowerCase();renderAudit();});
  $('audRefresh').onclick=()=>{attachAudit();toast(t('audit.refresh'));};
  $('audXls').onclick=exportAuditXls;
  $('audJson').onclick=()=>download('audit-'+Date.now()+'.json',{sessions:S.sessions,audit:S.audit,presence:S.presence});
  $('audPurge').onclick=purgeAudit;
  $('audBox').addEventListener('click',e=>{
    const b=e.target.closest('button[data-sid]');if(!b)return;
    S.auditSid=b.dataset.sid;S.auditView='activity';S.auditFilter.q='';$('audQ').value='';
    document.querySelectorAll('#audSeg button').forEach(x=>x.classList.toggle('on',x.dataset.v==='activity'));
    renderAudit();
  });
}
function id(el,v){el.id=v;}
function auditUsers(){
  const m=mergedUsers(),seen={};
  Object.values(S.sessions).forEach(s=>{if(s.uid&&!m[s.uid])seen[s.uid]={email:s.email||s.uid,role:s.role||''};});
  return Object.entries(m).map(([uid,u])=>({uid:uid,label:(u.name?u.name+' · ':'')+(u.email||uid)}))
    .concat(Object.entries(seen).map(([uid,u])=>({uid:uid,label:u.email})));
}
function inRange(ts){
  const f=S.auditFilter;
  if(f.from){const a=new Date(f.from+'T00:00:00').getTime();if(ts<a)return false;}
  if(f.to){const b=new Date(f.to+'T23:59:59').getTime();if(ts>b)return false;}
  return true;
}
function filteredAudit(){
  const f=S.auditFilter;
  return S.audit.filter(a=>{
    if(S.auditSid&&a.sid!==S.auditSid)return false;
    if(f.uid&&a.uid!==f.uid)return false;
    if(f.kind&&a.kind!==f.kind)return false;
    if(!inRange(a.ts))return false;
    if(f.q){const blob=(a.page||'')+' '+JSON.stringify(a.d||{});if(!blob.toLowerCase().includes(f.q))return false;}
    return true;
  });
}
function filteredSessions(){
  const f=S.auditFilter;
  return Object.entries(S.sessions).filter(([sid,s])=>{
    if(f.uid&&s.uid!==f.uid)return false;
    if(!inRange(s.start||0))return false;
    if(f.q){const blob=(s.email||'')+' '+(s.ip||'')+' '+(s.page||'')+' '+(s.ua||'');if(!blob.toLowerCase().includes(f.q))return false;}
    return true;
  }).sort((a,b)=>(b[1].start||0)-(a[1].start||0));
}
function renderAudit(){
  const box=document.getElementById('audBox');if(!box)return;
  if(!S.isHead){box.innerHTML='<p class="muted">'+esc(t('audit.headOnly'))+'</p>';return;}
  fillSel($('audUser'),[],t('audit.allUsers'));
  const us=auditUsers();
  $('audUser').innerHTML='<option value="">'+esc(t('audit.allUsers'))+'</option>'+us.map(u=>'<option value="'+esc(u.uid)+'">'+esc(u.label)+'</option>').join('');
  $('audUser').value=S.auditFilter.uid||'';
  const kindWrap=$('audKind').closest('div');
  kindWrap.style.display=S.auditView==='activity'?'':'none';
  if(S.auditView==='live'){
    const rows=Object.entries(S.presence).sort((a,b)=>(b[1].last||0)-(a[1].last||0));
    $('audCount').textContent=rows.length+' '+t('c.users');
    box.innerHTML='<table><thead><tr><th>'+esc(t('audit.user'))+'</th><th>'+esc(t('c.role'))+'</th><th>'+esc(t('audit.online'))+'</th><th>'+esc(t('audit.page'))+'</th><th>'+esc(t('audit.active'))+'</th><th>'+esc(t('audit.ip'))+'</th><th>'+esc(t('audit.last'))+'</th><th>'+esc(t('c.actions'))+'</th></tr></thead><tbody>'
      +(rows.map(([uid,p])=>{const on=p.online&&(Date.now()-(p.last||0)<90000);
        return '<tr><td><b>'+esc(p.email||uid)+'</b></td><td>'+esc(roleLabel(p.role))+'</td><td><span class="dot'+(on?' on':'')+'"></span> '+esc(t(on?'audit.online':'audit.offline'))+'</td><td class="mono">'+esc(p.page||'—')+'</td><td class="mono">'+esc(dur(p.activeMs))+'</td><td class="mono">'+esc(p.ip||t('audit.ipUnknown'))+'</td><td class="mono">'+esc(fmtDT(p.last))+'</td><td><button class="btn gray mini" data-sid="'+esc(p.sid||'')+'">'+esc(t('audit.viewDetail'))+'</button></td></tr>';}).join('')
        ||'<tr><td colspan="8" style="text-align:center">'+esc(t('audit.noData'))+'</td></tr>')+'</tbody></table>';
    return;
  }
  if(S.auditView==='sessions'){
    const rows=filteredSessions();
    $('audCount').textContent=rows.length+' '+t('audit.sessions');
    box.innerHTML='<table><thead><tr><th>'+esc(t('audit.user'))+'</th><th>'+esc(t('c.role'))+'</th><th>'+esc(t('audit.start'))+'</th><th>'+esc(t('audit.end'))+'</th><th>'+esc(t('audit.active'))+'</th><th>'+esc(t('audit.idle'))+'</th><th>'+esc(t('audit.pages'))+'</th><th>'+esc(t('audit.acts'))+'</th><th>'+esc(t('audit.ip'))+'</th><th>'+esc(t('audit.device'))+'</th><th>'+esc(t('c.actions'))+'</th></tr></thead><tbody>'
      +(rows.slice(0,400).map(([sid,s])=>'<tr><td><b>'+esc(s.email||s.uid)+'</b></td><td>'+esc(roleLabel(s.role))+'</td><td class="mono">'+esc(fmtDT(s.start))+'</td><td class="mono">'+esc(s.end?fmtDT(s.end):t('audit.online'))+'</td><td class="mono">'+esc(dur(s.activeMs))+'</td><td class="mono">'+esc(dur(s.idleMs))+'</td><td class="mono">'+(s.views||0)+'</td><td class="mono">'+(s.acts||0)+'</td><td class="mono">'+esc(s.ip||t('audit.ipUnknown'))+'<br><span class="aud-d">'+esc(s.ipSrc||'')+'</span></td><td><span class="aud-d">'+esc(s.plat||'')+' · '+esc(s.screen||'')+' · '+esc(s.tz||'')+'<br>'+esc((s.ua||'').slice(0,90))+'</span></td><td><button class="btn gray mini" data-sid="'+esc(sid)+'">'+esc(t('audit.viewDetail'))+'</button></td></tr>').join('')
        ||'<tr><td colspan="11" style="text-align:center">'+esc(t('audit.noData'))+'</td></tr>')+'</tbody></table>';
    return;
  }
  if(S.auditView==='byuser'){
    const agg={};
    Object.values(S.sessions).forEach(s=>{
      const k=s.uid||'?';const a=agg[k]||(agg[k]={email:s.email||k,role:s.role,n:0,active:0,total:0,acts:0,last:0,ips:{}});
      a.n++;a.active+=s.activeMs||0;a.total+=s.totalMs||0;a.acts+=s.acts||0;a.last=Math.max(a.last,s.start||0);if(s.ip)a.ips[s.ip]=1;
    });
    const rows=Object.entries(agg).sort((a,b)=>b[1].active-a[1].active);
    $('audCount').textContent=rows.length+' '+t('c.users');
    const hours=new Array(24).fill(0);
    S.audit.forEach(a=>{if(a.ts)hours[new Date(a.ts).getHours()]++;});
    const mx=Math.max(1,...hours);
    box.innerHTML='<div class="aud-bar" aria-hidden="true">'+hours.map(h=>'<div style="height:'+Math.round(h/mx*100)+'%" title="'+h+'"></div>').join('')+'</div>'
      +'<p class="muted" style="font-size:12px">00:00 – 23:59</p>'
      +'<table><thead><tr><th>'+esc(t('audit.user'))+'</th><th>'+esc(t('c.role'))+'</th><th>'+esc(t('audit.sessionsN'))+'</th><th>'+esc(t('audit.timeTotal'))+'</th><th>'+esc(t('audit.total'))+'</th><th>'+esc(t('audit.acts'))+'</th><th>'+esc(t('audit.lastLogin'))+'</th><th>'+esc(t('audit.ip'))+'</th></tr></thead><tbody>'
      +(rows.map(([uid,a])=>'<tr><td><b>'+esc(a.email)+'</b></td><td>'+esc(roleLabel(a.role))+'</td><td class="mono">'+a.n+'</td><td class="mono">'+esc(dur(a.active))+'</td><td class="mono">'+esc(dur(a.total))+'</td><td class="mono">'+a.acts+'</td><td class="mono">'+esc(fmtDT(a.last))+'</td><td class="mono">'+esc(Object.keys(a.ips).join(', ')||t('audit.ipUnknown'))+'</td></tr>').join('')
        ||'<tr><td colspan="8" style="text-align:center">'+esc(t('audit.noData'))+'</td></tr>')+'</tbody></table>';
    return;
  }
  const rows=filteredAudit().sort((a,b)=>(b.ts||0)-(a.ts||0));
  $('audCount').textContent=rows.length+' '+t('audit.activity')+(S.auditSid?' · '+t('audit.sessionOf')+' '+S.auditSid:'');
  box.innerHTML='<table><thead><tr><th>'+esc(t('audit.at'))+'</th><th>'+esc(t('audit.user'))+'</th><th>'+esc(t('audit.kind'))+'</th><th>'+esc(t('audit.page'))+'</th><th>'+esc(t('audit.detail'))+'</th></tr></thead><tbody>'
    +(rows.slice(0,600).map(a=>{
      const d=a.d||{};
      const bits=Object.keys(d).map(k=>k+'='+String(d[k])).join(' · ');
      return '<tr><td class="mono">'+esc(fmtDT(a.ts))+'</td><td>'+esc(a.email||a.uid)+'</td><td>'+esc(t('audit.k.'+a.kind)||a.kind)+'</td><td class="mono">'+esc(a.page||'')+'</td><td><span class="aud-d">'+esc(bits)+'</span></td></tr>';}).join('')
      ||'<tr><td colspan="5" style="text-align:center">'+esc(t('audit.noData'))+'</td></tr>')+'</tbody></table>';
}
function exportAuditXls(){
  if(!guardHead())return;
  if(typeof XLSX==='undefined'){download('audit.json',{sessions:S.sessions,audit:S.audit});return;}
  const wb=XLSX.utils.book_new();
  const ses=filteredSessions().map(([sid,s])=>({Session:sid,User:s.email||s.uid,Role:s.role,Start:fmtDT(s.start),End:s.end?fmtDT(s.end):'',ActiveSec:Math.round((s.activeMs||0)/1000),IdleSec:Math.round((s.idleMs||0)/1000),TotalSec:Math.round((s.totalMs||0)/1000),Views:s.views||0,Actions:s.acts||0,IP:s.ip||'',IPSrc:s.ipSrc||'',Entry:s.entry||'',Page:s.page||'',Referrer:s.ref||'',Platform:s.plat||'',Screen:s.screen||'',Viewport:s.view||'',TZ:s.tz||'',Languages:s.langs||'',Cores:s.cores||0,MemoryGB:s.mem||0,Touch:!!s.touch,Network:s.net||'',UA:s.ua||''}));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(ses.length?ses:[{}]),'Sessions');
  const act=filteredAudit().map(a=>Object.assign({Time:fmtDT(a.ts),User:a.email||a.uid,Role:a.role,Kind:a.kind,Page:a.page,Session:a.sid},a.d||{}));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(act.length?act:[{}]),'Activity');
  XLSX.writeFile(wb,'usage-audit-'+dayKey()+'.xlsx');
}
async function purgeAudit(){
  if(!guardHead())return;
  const before=S.auditFilter.from;
  if(!before)return toast(t('audit.from'));
  if(!confirm(t('audit.purgeQ')))return;
  const cut=new Date(before+'T00:00:00').getTime();
  const old=S.audit.filter(a=>(a.ts||0)<cut);
  if(!old.length)return toast(t('audit.noData'));
  const upd={};old.forEach(a=>{if(a._id)upd[a._id]=null;});
  try{await db().ref('audit').update(upd);toast(t('audit.purged',{n:old.length}));}catch(e){werr(e);}
}
function attachAudit(){
  if(!S.isHead)return;
  ['audit','sessions','presence'].forEach(p=>{try{S.refs[p]&&S.refs[p].off();}catch(e){}});
  const bind=(p,ref,fn)=>{
    S.refs[p]=ref;
    ref.on('value',s=>{S.loaded[p]=true;delete S.errors[p];fn(s);safe(renderDiag,'diag');safe(renderBanner,'banner');if(S.page==='audit')safe(renderAudit,'audit');},
      e=>{S.errors[p]=e.code||String(e.message||e);safe(renderDiag,'diag');safe(renderBanner,'banner');});
  };
  bind('audit',db().ref('audit').limitToLast(1200),s=>{const v=s.val()||{};S.audit=Object.entries(v).map(([k,a])=>Object.assign({_id:k},a));S.counts.audit=S.audit.length;});
  bind('sessions',db().ref('sessions').limitToLast(400),s=>{S.sessions=s.val()||{};S.counts.sessions=Object.keys(S.sessions).length;});
  bind('presence',db().ref('presence'),s=>{S.presence=s.val()||{};S.counts.presence=Object.keys(S.presence).length;});
}

/* ---------- danger ---------- */
const DG={students:{title:'dg.delStu',desc:'dg.stuDesc',phrase:'DELETE',btn:'dg.stuBtn'},all:{title:'dg.delAll',desc:'dg.allDesc',phrase:'DELETE ALL',btn:'dg.allBtn'}};
function openDg(sc){
  if(!guard())return;S.dgScope=sc;S.dgBusy=false;const c=DG[sc];
  $('dgTitle').textContent=t(c.title);$('dgDesc').textContent=t(c.desc);
  $('dgLabel').textContent=t('dg.type',{phrase:c.phrase});$('dgInput').value='';$('dgInput').placeholder=c.phrase;$('dgInput').disabled=false;
  $('dgBackup').checked=true;$('dgOk').textContent=t(c.btn);$('dgOk').disabled=true;$('dgCancel').disabled=false;
  $('dgStatus').textContent='';$('dgStatus').className='status';
  $('dgSum').innerHTML='<div><span>'+esc(t('s.students'))+'</span><b>'+Object.keys(S.students).length+'</b></div>'+(sc==='all'?'<div><span>'+esc(t('p.stations'))+'</span><b>'+Object.keys(S.stations).length+'</b></div>':'');
  $('dgModal').classList.add('on');document.body.style.overflow='hidden';setTimeout(()=>$('dgInput').focus(),30);
}
function closeDg(){if(S.dgBusy)return;$('dgModal').classList.remove('on');document.body.style.overflow='';S.dgScope=null;}

/* ---------- listeners ---------- */
function detachAll(){Object.keys(S.refs).forEach(k=>{try{S.refs[k].off();}catch(e){}});S.refs={};if(S.attRef){try{S.attRef.off();}catch(e){}S.attRef=null;}}
function attachAll(){
  detachAll();S.loaded={};S.errors={};S.counts={};S.bannerHidden=false;
  const bind=(path,apply)=>{
    const ref=db().ref(path==='users'||path==='admins'?path:'parents/'+path);
    S.refs[path]=ref;
    ref.on('value',snap=>{
      const v=snap.val()||{};
      S.loaded[path]=true;delete S.errors[path];
      S.counts[path]=path==='labelLayout'?(snap.exists()?1:0):Object.keys(v).length;
      safe(()=>apply(v,snap),path);
      safe(renderDiag,'diag');safe(renderBanner,'banner');safe(renderOverview,'overview');
    },err=>{S.errors[path]=err.code||String(err.message||err);safe(renderDiag,'diag');safe(renderBanner,'banner');});
  };
  bind('students',v=>{S.students=v;reindex();safe(renderStudents,'students');safe(renderAttendance,'attendance');safe(renderMeetings,'meetings');safe(renderSearch,'search');});
  bind('stations',v=>{S.stations=v;if(S.station&&!v[S.station]){S.station=null;localStorage.removeItem(LS);}safe(renderStation,'station');safe(renderStations,'stations');});
  bind('queues',v=>{S.queues=v;safe(renderStation,'station');safe(renderStations,'stations');});
  bind('labelLayout',(v,snap)=>{
    const keep=S.selBox;S.layout=LL.norm(v);
    S.selBox=(keep&&S.layout.boxes.some(b=>b.id===keep))?keep:(S.layout.boxes[0]?S.layout.boxes[0].id:null);
    setMode(S.layout.mode);syncDesignerInputs();safe(renderDesigner,'designer');
    if(S.mmUid)safe(renderMeetPreview,'meetPreview');
    $('dzStatus').textContent=snap.exists()?t('dz.loaded'):t('dz.default');
  });
  if(S.isHead){
    bind('users',v=>{S.users=v;safe(renderUsers,'users');if(S.udUid)safe(renderUserDelete,'ud');});
    bind('admins',v=>{S.admins=v;safe(renderUsers,'users');});
    attachAudit();
  }
  attachAtt(S.attDay);
  renderDiag();
}

/* ---------- wiring ---------- */
function wire(){
  document.querySelectorAll('#rail button').forEach(b=>b.onclick=()=>showPage(b.dataset.page));
  document.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>showPage(b.dataset.goto));
  addEventListener('hashchange',()=>showPage(location.hash.slice(1)));

  $('stBtn').onclick=()=>{renderStation();$('stModal').classList.add('on');};
  $('stClose').onclick=()=>$('stModal').classList.remove('on');
  $('stSel').onchange=function(){pickStation(this.value||null);};
  $('stChips').onclick=e=>{const b=e.target.closest('button[data-k]');if(b)pickStation(b.dataset.k);};
  $('stModal').addEventListener('click',e=>{if(e.target===$('stModal'))$('stModal').classList.remove('on');});

  $('q').addEventListener('input',()=>safe(renderSearch,'search'));
  $('res').onclick=async e=>{
    const b=e.target.closest('button[data-act]');if(!b)return;
    const k=b.dataset.k,s=S.students[k];if(!s)return;
    const a=b.dataset.act;
    if(a==='meet'){openMeet(k);return;}
    if(a==='bind'){
      if(!guard()||!S.unknown)return;
      if(!await Verify.ask(s)){toast(t('vf.cancelled'));return;}
      if(!confirm(t('op.bindQ',{card:S.unknown,name:s.nameEn||s.nameZh})))return;
      try{await db().ref('parents/students/'+k).update({cardId:S.unknown});S.unknown=null;$('bindHelp').style.display='none';renderSearch();toast(t('op.bound'));}catch(x){werr(x);}
      return;
    }
    if(!guard())return;
    if(!await Verify.ask(s)){toast(t('vf.cancelled'));return;}
    const who=s.nameEn||s.nameZh;
    if(a==='print'){
      if(!confirm(t('op.printQ',{name:who})))return;
      try{if(await queueLabel(s))toast(t('vf.verifiedToast')+' · '+t('op.sentTo')+' '+S.stations[S.station].name);}catch(x){werr(x);}
    }else{
      try{await markAtt(k,a==='pres'?'present':'absent','admin-v');toast(t('vf.verifiedToast')+' · '+t(a==='pres'?'c.present':'c.absent')+' '+who);}catch(x){werr(x);}
    }
  };
  document.addEventListener('keydown',e=>{
    if(document.body.classList.contains('auth-locked')||document.querySelector('.scrim.on')||Verify.open())return;
    const a=document.activeElement;if(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName))return;
    const now=Date.now();if(now-S.bufAt>140)S.buf='';S.bufAt=now;
    if(e.key==='Enter'||e.key==='Tab'){if(S.buf.length>=4){e.preventDefault();const c=S.buf;S.buf='';showPage('operate');handleScan(c);}S.buf='';}
    else if(e.key.length===1)S.buf+=e.key;
  });

  document.querySelectorAll('#modeSeg button').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
  $('zoom').onchange=()=>{S.zoom=parseFloat($('zoom').value)||1.4;renderCanvas();};
  [['dcW','doc','w'],['dcH','doc','h'],['hdT','hide','top'],['hdL','hide','left']].forEach(([id,g,k])=>$(id).addEventListener('input',()=>{const v=parseFloat($(id).value);if(!Number.isFinite(v))return;S.layout[g][k]=g==='hide'?Math.max(0,v):Math.max(1,v);renderDesigner();}));
  $('preset').onclick=()=>{S.layout.doc={w:60,h:60};S.layout.hide={top:20,left:0};syncDesignerInputs();renderDesigner();toast(t('dz.presetOk'));};
  [['bTop','topMm'],['bSide','sideMm'],['bEn','enSize'],['bZh','zhSize'],['bMs','meetSize'],['bGap','gapMm']].forEach(([id,k])=>$(id).addEventListener('input',()=>{const v=parseFloat($(id).value);if(!Number.isFinite(v))return;S.layout.simple[k]=v;renderPreview();}));
  [['bEnT','enText'],['bZhT','zhText'],['bMeT','meetText']].forEach(([id,k])=>$(id).addEventListener('input',()=>{S.layout.simple[k]=$(id).value;renderPreview();}));
  [['smCls','cls'],['smNo','classNo'],['smEn','nameEn'],['smZh','nameZh'],['smCard','cardId'],['smTime','meetTime'],['smTeacher','meetTeacher'],['smRoom','meetRoom']].forEach(([id,k])=>$(id).addEventListener('input',()=>{S.layout.sample[k]=$(id).value;renderDesigner();}));
  $('phChips').onclick=e=>{const b=e.target.closest('button[data-k]');if(!b)return;const box=curBox();if(!box)return;
    const ta=$('tbText'),tx='{'+b.dataset.k+'}',s=ta.selectionStart,en=ta.selectionEnd;
    ta.value=ta.value.slice(0,s)+tx+ta.value.slice(en);ta.selectionStart=ta.selectionEnd=s+tx.length;box.text=ta.value;ta.focus();renderDesigner();};
  [['tbX','x'],['tbY','y'],['tbW','w'],['tbH','h'],['tbSize','size'],['tbLh','lineHeight']].forEach(([id,k])=>$(id).addEventListener('input',()=>{const b=curBox();if(!b)return;const v=parseFloat($(id).value);if(!Number.isFinite(v))return;b[k]=v;renderDesigner();}));
  $('tbWeight').onchange=()=>{const b=curBox();if(b){b.weight=parseInt($('tbWeight').value)||600;renderDesigner();}};
  $('tbAx').onchange=()=>{const b=curBox();if(b){b.align=$('tbAx').value;renderDesigner();}};
  $('tbAy').onchange=()=>{const b=curBox();if(b){b.valign=$('tbAy').value;renderDesigner();}};
  $('tbColor').oninput=()=>{const b=curBox();if(b){b.color=$('tbColor').value;renderDesigner();}};
  $('tbText').oninput=()=>{const b=curBox();if(b){b.text=$('tbText').value;renderDesigner();}};
  $('canvas').addEventListener('pointerdown',e=>{
    const el=e.target.closest('.tb');if(!el)return;
    const b=S.layout.boxes.find(x=>x.id===el.dataset.id);if(!b)return;
    S.selBox=b.id;renderCanvas();syncBoxProps();
    S.drag={id:b.id,mode:e.target.classList.contains('hd')?'size':'move',sx:e.clientX,sy:e.clientY,ox:b.x,oy:b.y,ow:b.w,oh:b.h};
    e.preventDefault();
  });
  addEventListener('pointermove',e=>{
    if(!S.drag)return;const b=S.layout.boxes.find(x=>x.id===S.drag.id);if(!b)return;
    const ef=LL.eff(S.layout),z=dzScale(),dx=(e.clientX-S.drag.sx)/z,dy=(e.clientY-S.drag.sy)/z;
    if(S.drag.mode==='move'){b.x=+clamp(S.drag.ox+dx,0,Math.max(0,ef.w-b.w)).toFixed(2);b.y=+clamp(S.drag.oy+dy,0,Math.max(0,ef.h-b.h)).toFixed(2);}
    else{b.w=+clamp(S.drag.ow+dx,1,Math.max(1,ef.w-b.x)).toFixed(2);b.h=+clamp(S.drag.oh+dy,1,Math.max(1,ef.h-b.y)).toFixed(2);}
    moveBoxEl(b);renderPreview();$('tbX').value=b.x;$('tbY').value=b.y;$('tbW').value=b.w;$('tbH').value=b.h;
  });
  addEventListener('pointerup',()=>S.drag=null);addEventListener('pointercancel',()=>S.drag=null);
  $('tbAdd').onclick=()=>{const id='b'+Date.now();S.layout.boxes.push({id,x:4,y:4,w:30,h:8,text:'{nameEn}',size:16,weight:600,align:'center',valign:'middle',color:'#000000',lineHeight:1.2});S.selBox=id;renderDesigner();};
  $('tbMeet').onclick=()=>{const e=LL.eff(S.layout),id='meet'+Date.now();S.layout.boxes.push({id,x:2,y:clamp(e.h-12,0,Math.max(0,e.h-7)),w:Math.max(10,e.w-4),h:7,text:'{meetTime} · {meetTeacher} · {meetRoom}',size:11,weight:500,align:'center',valign:'middle',color:'#000000',lineHeight:1.25});S.selBox=id;renderDesigner();};
  $('tbDup').onclick=()=>{const b=curBox();if(!b)return toast(t('dz.selectFirst'));const e=LL.eff(S.layout),c=LL.clone(b);c.id='b'+Date.now();c.x=clamp(c.x+2,0,Math.max(0,e.w-c.w));c.y=clamp(c.y+2,0,Math.max(0,e.h-c.h));S.layout.boxes.push(c);S.selBox=c.id;renderDesigner();};
  $('tbDel').onclick=()=>{const b=curBox();if(!b)return toast(t('dz.selectFirst'));S.layout.boxes=S.layout.boxes.filter(x=>x.id!==b.id);S.selBox=S.layout.boxes[0]?S.layout.boxes[0].id:null;renderDesigner();};
  $('dzSave').onclick=async()=>{if(!guard())return;try{const p=LL.clone(S.layout);p.version=6;p.updatedAt=Date.now();await db().ref('parents/labelLayout').set(p);toast(t('dz.saved'));}catch(e){werr(e);}};
  $('dzReset').onclick=()=>{if(!confirm(t('dz.resetQ')))return;S.layout=LL.norm(null);S.selBox=S.layout.boxes[0].id;setMode(S.layout.mode);syncDesignerInputs();renderDesigner();};
  $('dzExport').onclick=()=>{download('label-layout.json',S.layout);toast(t('c.exported'));};
  $('dzImport').onclick=()=>$('dzFile').click();
  $('dzFile').addEventListener('change',function(){const f=this.files[0];if(!f)return;const r=new FileReader();
    r.onload=e=>{try{S.layout=LL.norm(JSON.parse(e.target.result));S.selBox=S.layout.boxes[0]?S.layout.boxes[0].id:null;setMode(S.layout.mode);syncDesignerInputs();renderDesigner();toast(t('dz.jsonOk'));}catch(x){toast(t('dz.jsonFail'));}};
    r.readAsText(f);this.value='';});

  $('attDate').value=S.attDay;
  $('attDate').onchange=function(){attachAtt(this.value||dayKey());};
  $('attCls').onchange=()=>safe(renderAttendance,'attendance');
  $('attBody').onclick=async e=>{
    const b=e.target.closest('button[data-act]');if(!b||!guard())return;
    const k=b.dataset.k,a=b.dataset.act;
    try{
      if(a==='clr'){await db().ref('parents/attendance/'+S.attDay+'/'+k).remove();toast(t('c.cleared'));}
      else{await markAtt(k,a==='pres'?'present':'absent','admin');toast(t(a==='pres'?'c.present':'c.absent'));}
    }catch(x){werr(x);}
  };
  $('attAbsAll').onclick=async()=>{
    if(!guard())return;const un=attRows().filter(([k])=>!S.att[k]);
    if(!un.length)return toast(t('a.noUnmarked'));
    if(!confirm(t('a.absQ',{n:un.length})))return;
    const upd={},now=Date.now();un.forEach(([k,s])=>upd[k]={status:'absent',time:now,by:'admin',studentId:String(s.studentId||''),cls:s.cls||'',classNo:s.classNo||'',nameEn:s.nameEn||'',nameZh:s.nameZh||'',cardId:s.cardId||''});
    try{await db().ref('parents/attendance/'+S.attDay).update(upd);toast(t('a.absOk'));}catch(x){werr(x);}
  };
  $('attExport').onclick=()=>{
    if(typeof XLSX==='undefined')return toast(t('a.xlsMissing'));
    const rows=attRows();if(!rows.length)return toast(t('a.noStudents'));
    const aoa=[[t('c.date'),t('sd.sid'),t('c.card'),t('c.class'),t('c.no'),t('c.en'),t('c.zh'),t('m.time'),t('m.teacher'),t('m.room'),t('c.status'),t('c.time'),t('a.by')]];
    rows.forEach(([k,s])=>{const r=S.att[k];aoa.push([S.attDay,s.studentId||'',s.cardId||'',s.cls||'',s.classNo||'',s.nameEn||'',s.nameZh||'',s.meetTime||'',s.meetTeacher||'',s.meetRoom||'',r?(r.status==='present'?t('c.present'):t('c.absent')):t('c.unmarked'),r?new Date(r.time).toLocaleTimeString('en-GB'):'',byLabel(r&&r.by)]);});
    const ws=XLSX.utils.aoa_to_sheet(aoa),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Attendance');XLSX.writeFile(wb,'attendance_'+S.attDay+'.xlsx');toast(t('c.exported'));
  };

  $('mtQ').addEventListener('input',()=>{S.meet.q=$('mtQ').value.trim();safe(renderMeetings,'meetings');});
  $('mtTeacher').onchange=()=>{S.meet.teacher=$('mtTeacher').value;safe(renderMeetings,'meetings');};
  $('mtRoom').onchange=()=>{S.meet.room=$('mtRoom').value;safe(renderMeetings,'meetings');};
  $('mtOnly').onchange=()=>{S.meet.only=$('mtOnly').checked;safe(renderMeetings,'meetings');};
  $('mtBody').onclick=async e=>{
    const b=e.target.closest('button[data-act]');if(!b)return;
    const k=b.dataset.k,s=S.students[k];if(!s)return;
    if(b.dataset.act==='meet'){openMeet(k);return;}
    if(!guard())return;
    if(!await Verify.ask(s)){toast(t('vf.cancelled'));return;}
    if(!confirm(t('op.printQ',{name:s.nameEn||s.nameZh})))return;
    try{if(await queueLabel(s))toast(t('vf.verifiedToast')+' · '+t('op.sentTo')+' '+S.stations[S.station].name);}catch(x){werr(x);}
  };
  $('mtExport').onclick=()=>{
    if(typeof XLSX==='undefined')return toast(t('a.xlsMissing'));
    const rows=meetRows();if(!rows.length)return toast(t('m.empty'));
    const aoa=[['Student ID','Class','Class No','English Name','Chinese Name','Card ID','Meeting Time','Meeting Teacher','Meeting Location']];
    rows.forEach(([k,s])=>aoa.push([s.studentId||'',s.cls||'',s.classNo||'',s.nameEn||'',s.nameZh||'',s.cardId||'',s.meetTime||'',s.meetTeacher||'',s.meetRoom||'']));
    const ws=XLSX.utils.aoa_to_sheet(aoa),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Meetings');XLSX.writeFile(wb,'meetings.xlsx');toast(t('c.exported'));
  };
  ['mmTime','mmTeacher','mmRoom'].forEach(id=>$(id).addEventListener('input',()=>safe(renderMeetPreview,'meetPreview')));
  $('mmCancel').onclick=closeMeet;
  $('mtModal').addEventListener('click',e=>{if(e.target===$('mtModal'))closeMeet();});
  $('mmSave').onclick=async()=>{
    if(!guard()||!S.mmUid||S.mmBusy)return;S.mmBusy=true;$('mmSave').disabled=true;$('mmClear').disabled=true;$('mmCancel').disabled=true;
    try{await db().ref('parents/students/'+S.mmUid).update({meetTime:$('mmTime').value.trim(),meetTeacher:$('mmTeacher').value.trim(),meetRoom:$('mmRoom').value.trim(),updatedAt:Date.now(),updatedBy:S.user.email||S.user.uid});S.mmBusy=false;closeMeet();toast(t('m.saved'));}
    catch(x){S.mmBusy=false;$('mmSave').disabled=false;$('mmClear').disabled=false;$('mmCancel').disabled=false;$('mmStatus').textContent=t('c.fail')+': '+(x.message||x);$('mmStatus').className='status err';}
  };
  $('mmClear').onclick=async()=>{
    if(!guard()||!S.mmUid||S.mmBusy)return;if(!confirm(t('m.clearQ')))return;
    S.mmBusy=true;$('mmSave').disabled=true;$('mmClear').disabled=true;
    try{await db().ref('parents/students/'+S.mmUid).update({meetTime:'',meetTeacher:'',meetRoom:''});S.mmBusy=false;closeMeet();toast(t('m.cleared'));}
    catch(x){S.mmBusy=false;$('mmSave').disabled=false;$('mmClear').disabled=false;$('mmStatus').textContent=t('c.fail')+': '+(x.message||x);$('mmStatus').className='status err';}
  };

  $('stAdd').onclick=async()=>{
    if(!guard())return;const n=$('nsName').value.trim(),tk=$('nsToken').value.trim().toUpperCase();
    if(!n||!tk)return toast(t('st.needBoth'));
    if(Object.values(S.stations).some(v=>String(v.token||'').toUpperCase()===tk))return toast(t('st.exists'));
    try{const ref=await db().ref('parents/stations').push({name:n,token:tk,settings:{},createdAt:Date.now(),lastSeen:0});
      $('nsName').value='';$('nsToken').value='';S.station=ref.key;localStorage.setItem(LS,ref.key);toast(t('st.added'));}catch(x){werr(x);}
  };
  $('stBody').onclick=async e=>{
    const b=e.target.closest('button[data-act]');if(!b)return;
    const k=b.dataset.k,a=b.dataset.act,v=S.stations[k];
    if(a==='use'){pickStation(k);return;}
    if(!guard()||!v)return;
    if(a==='edit'){const n=prompt(t('st.name'),v.name);if(n===null)return;const tk=prompt(t('st.token'),v.token);if(tk===null)return;
      try{await db().ref('parents/stations/'+k).update({name:n.trim()||v.name,token:tk.trim().toUpperCase()||v.token});toast(t('c.updated'));}catch(x){werr(x);}}
    if(a==='del'){if(!confirm(t('st.delQ')))return;
      try{await db().ref('parents/stations/'+k).remove();await db().ref('parents/queues/'+k).remove();
        if(S.station===k){S.station=null;localStorage.removeItem(LS);}toast(t('c.deleted'));}catch(x){werr(x);}}
  };

  $('dbQ').addEventListener('input',()=>safe(renderStudents,'students'));
  $('dbBody').onclick=async e=>{
    const b=e.target.closest('button[data-act]');if(!b)return;
    const k=b.dataset.k,s=S.students[k];if(!s)return;
    const a=b.dataset.act;
    if(a==='meet'){openMeet(k);return;}
    if(!guard())return;
    if(a==='print'){
      if(!await Verify.ask(s)){toast(t('vf.cancelled'));return;}
      if(!confirm(t('op.printQ',{name:s.nameEn||s.nameZh})))return;
      try{if(await queueLabel(s))toast(t('vf.verifiedToast')+' · '+t('op.sentTo')+' '+S.stations[S.station].name);}catch(x){werr(x);}
    }
    if(a==='delstu'){if(!confirm(t('sd.delQ')))return;try{await db().ref('parents/students/'+k).remove();toast(t('c.deleted'));}catch(x){werr(x);}}
  };
  $('stuAdd').onclick=async()=>{
    if(!guard())return;
    const sidEl=document.getElementById('aSid');
    const sid=sidEl?normSid(sidEl.value):'';
    const rec={studentId:sid,cardId:$('aCard').value.trim(),cls:$('aCls').value.trim().toUpperCase(),classNo:$('aNo').value.trim(),nameEn:$('aEn').value.trim(),nameZh:$('aZh').value.trim(),meetTime:$('aTime').value.trim(),meetTeacher:$('aTeacher').value.trim(),meetRoom:$('aRoom').value.trim(),updatedAt:Date.now(),updatedBy:S.user.email||S.user.uid};
    if(!rec.studentId&&!rec.nameEn&&!rec.nameZh)return toast(t('sd.needName'));
    const hit=resolveKey(rec);
    try{
      if(hit)await db().ref('parents/students/'+hit.key).update(rec);
      else if(sid)await db().ref('parents/students/'+sidKey(sid)).set(rec);
      else await db().ref('parents/students').push(rec);
      ['aCard','aCls','aNo','aEn','aZh','aTime','aTeacher','aRoom'].forEach(id=>$(id).value='');
      if(sidEl)sidEl.value='';
      toast(t('c.saved'));
    }catch(x){werr(x);}
  };
  $('tpl').onclick=()=>{
    if(typeof XLSX==='undefined')return toast(t('a.xlsMissing'));
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
      ['Student ID','Card ID','Class','Class No','English Name','Chinese Name'],
      ['20260001','0001234567','3A','15','CHAN TAI MAN','陳大文'],
      ['20260002','0001234568','3A','16','LEE SIU MING','李小明']]),'Students');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
      ['Student ID','Meeting Time','Meeting Teacher','Meeting Location'],
      ['20260001','15:30–15:45','陳老師','204 室'],
      ['20260002','15:45–16:00','李老師','禮堂']]),'Meetings');
    XLSX.writeFile(wb,'parent-label-templates.xlsx');
  };
  $('xls').addEventListener('change',function(){
    const f=this.files[0];if(!f){return;}
    runImport(f).catch(e=>{$('impMsg').textContent=t('c.fail')+': '+(e.message||e);});
    this.value='';
  });

  document.querySelectorAll('#uSeg button').forEach(b=>b.onclick=()=>{S.uFilter=b.dataset.f;document.querySelectorAll('#uSeg button').forEach(x=>x.classList.toggle('on',x===b));safe(renderUsers,'users');});
  $('uBody').onclick=e=>{
    const b=e.target.closest('button[data-act]');if(!b)return;
    const uid=b.dataset.k,a=b.dataset.act;
    if(a==='approve')userSet(uid,{status:'approved'});
    if(a==='reject')userSet(uid,{status:'rejected'});
    if(a==='revoke')userSet(uid,{status:'pending'});
    if(a==='role')userSet(uid,{role:b.dataset.role});
    if(a==='deluser')openUd(uid);
  };
  $('udCancel').onclick=closeUd;
  $('udModal').addEventListener('click',e=>{if(e.target===$('udModal'))closeUd();});
  $('udInput').addEventListener('input',validateUd);
  $('udInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!$('udOk').disabled)$('udOk').click();});
  $('udOk').onclick=async()=>{
    const u=udRec();if(!u||S.udBusy||!guardHead())return;
    if(S.user&&S.udUid===S.user.uid)return toast(t('ud.noSelf'));
    if($('udInput').value.trim().toLowerCase()!==udToken(u).toLowerCase())return;
    S.udBusy=true;$('udOk').disabled=true;$('udCancel').disabled=true;$('udInput').disabled=true;
    $('udStatus').textContent=t('c.processing');$('udStatus').className='status';
    const uid=S.udUid;let authDeleted=false;
    try{
      if(AUTH_DELETE_ENDPOINT){
        const token=await S.user.getIdToken();
        const res=await fetch(AUTH_DELETE_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({data:{uid}})});
        const j=await res.json().catch(()=>({}));
        if(!res.ok||j.error)throw new Error((j.error&&j.error.message)||('HTTP '+res.status));
        authDeleted=true;
      }
      await db().ref('admins/'+uid).remove();
      await db().ref('users/'+uid).remove();
      S.udBusy=false;closeUd();toast(authDeleted?t('ud.allDone'):t('ud.done'));
    }catch(x){S.udBusy=false;$('udCancel').disabled=false;$('udInput').disabled=false;validateUd();
      $('udStatus').textContent=t('ud.fail')+': '+(x.message||x);$('udStatus').className='status err';}
  };

  $('backup').onclick=async()=>{if(!guard())return;try{const s=await db().ref('parents').once('value');download('parents-backup-'+Date.now()+'.json',{exportedAt:new Date().toISOString(),data:s.val()||{}});toast(t('se.backupOk'));}catch(x){werr(x);}};
  $('retry').onclick=()=>{S.runtime=[];attachAll();toast(t('c.retry'));};
  $('copyDiag').onclick=async()=>{try{await navigator.clipboard.writeText(diagText());toast(t('di.copied'));}catch(x){download('diagnostics.json',diagText());toast(t('c.exported'));}};
  $('delStu').onclick=()=>openDg('students');
  $('delAll').onclick=()=>openDg('all');
  $('dgCancel').onclick=closeDg;
  $('dgModal').addEventListener('click',e=>{if(e.target===$('dgModal'))closeDg();});
  $('dgInput').addEventListener('input',()=>{const c=DG[S.dgScope];if(c)$('dgOk').disabled=$('dgInput').value.trim().toUpperCase()!==c.phrase;});
  $('dgOk').onclick=async()=>{
    const sc=S.dgScope,c=DG[sc];if(!c||S.dgBusy)return;
    if($('dgInput').value.trim().toUpperCase()!==c.phrase)return;
    S.dgBusy=true;$('dgOk').disabled=true;$('dgCancel').disabled=true;$('dgInput').disabled=true;
    try{
      if($('dgBackup').checked){const snap=await db().ref(sc==='all'?'parents':'parents/students').once('value');download('backup-'+sc+'-'+Date.now()+'.json',{scope:sc,exportedAt:new Date().toISOString(),data:snap.val()||{}});}
      await db().ref(sc==='all'?'parents':'parents/students').remove();
      if(sc==='all'){localStorage.removeItem(LS);S.station=null;}
      S.unknown=null;$('q').value='';$('res').innerHTML='';
      S.dgBusy=false;closeDg();toast(t('c.deleted'));
    }catch(x){S.dgBusy=false;$('dgCancel').disabled=false;$('dgInput').disabled=false;
      $('dgStatus').textContent=t('dg.fail')+': '+(x.message||x);$('dgStatus').className='status err';}
  };
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape'||Verify.open())return;
    if($('mtModal').classList.contains('on'))closeMeet();
    if($('udModal').classList.contains('on'))closeUd();
    if($('dgModal').classList.contains('on'))closeDg();
    $('stModal').classList.remove('on');
  });
  document.addEventListener('langchange',()=>{
    I18N.apply();Verify.paint();renderEverything();
    if(S.mmUid){I18N.apply($('mtModal'));renderMeetPreview();}
    if(S.udUid){I18N.apply($('udModal'));renderUserDelete();}
    if(S.dgScope)openDg(S.dgScope);
    if(S.profile)$('acRole').value=roleLabel(S.profile.role);
    applyRoleGates();
  });
  setInterval(()=>{safe(renderOverview,'overview');safe(renderStation,'station');if(S.page==='stations')safe(renderStations,'stations');if(S.page==='audit'&&S.auditView==='live')safe(renderAudit,'audit');},15000);
}
function applyRoleGates(){
  const rail=document.getElementById('rail');
  ['users','audit'].forEach(p=>{const b=rail&&rail.querySelector('button[data-page="'+p+'"]');if(b)b.style.display=S.isHead?'':'none';});
  const pendCard=$('ovPend')&&$('ovPend').closest('.ovc');if(pendCard)pendCard.style.display=S.isHead?'':'none';
}

/* ---------- boot ---------- */
I18N.apply();I18N.mountToggle();
setMode(S.layout.mode);syncDesignerInputs();
renderScanReady();renderScanTags();renderEverything();
wire();
mountImportUI();
mountAuditPage();
Verify.banner('q');Verify.banner('dbQ');
applyRoleGates();
showPage(location.hash.slice(1)||'overview');
function start(user,profile){
  S.user=user;S.profile=profile;S.role=profile.role||'staff';
  S.isHead=S.role==='head';S.canManage=S.role==='head'||S.role==='admin';
  $('acEmail').value=user.email||'';$('acRole').value=roleLabel(S.role);$('acUid').value=user.uid;
  applyRoleGates();
  if(!S.canManage){$('console').style.display='none';$('denied').style.display='block';renderDiag();return;}
  $('console').style.display='';$('denied').style.display='none';
  mountImportUI();mountAuditPage();
  S.started=true;attachAll();renderEverything();
}
Auth.start(start);
document.addEventListener('auth-profile',e=>{
  const p=e.detail.profile;
  S.user=e.detail.user;S.profile=p;S.role=p.role||'staff';S.isHead=S.role==='head';S.canManage=S.role==='head'||S.role==='admin';
  $('acRole').value=roleLabel(S.role);applyRoleGates();
  if(!S.canManage){$('console').style.display='none';$('denied').style.display='block';}
  else{$('console').style.display='';$('denied').style.display='none';if(!S.started)start(S.user,p);else attachAll();}
});
})();
