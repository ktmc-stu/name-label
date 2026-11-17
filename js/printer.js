/* js/printer.js — station binding, queue printing, attendance, label settings.
   Manual (typed) operations require verbal confirmation with the parent;
   card swipes do not, because the card itself identifies the student. */
(function(){
const LS='plPrinterToken';
const S={stationKey:null,station:null,started:false,layout:LL.norm(null),students:{},byCard:{},att:{},attDay:'',attRef:null,busy:false,jobs:[],seen:{},printing:false,buf:'',bufAt:0,connected:false};
const $=id=>document.getElementById(id);
const t=(k,v)=>I18N.t(k,v);
const esc=LL.esc;
const db=()=>Auth.db;
const dayKey=(d=new Date())=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
S.attDay=dayKey();
const fmtT=ts=>ts?new Date(ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'—';
const normCard=v=>String(v==null?'':v).trim().replace(/^0+/,'').toUpperCase();
const meetOf=s=>({meetTime:String(s.meetTime||''),meetTeacher:String(s.meetTeacher||''),meetRoom:String(s.meetRoom||'')});
const meetHtml=s=>{const m=LL.meetLine(s);return m?'<div class="mline"><b>'+esc(t('m.label'))+'</b> '+esc(m)+'</div>':'';};
const SC={ready:['#e5f0fc','#084c9e'],ok:['#e4f4ec','#16794b'],err:['#fbeaea','#bf3a3a']};
const setScan=(el,k)=>{el.style.background=SC[k][0];el.style.color=SC[k][1];};
let toastTimer=null;
function toast(m){const e=$('toast');e.textContent=m;e.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('on'),3000);}
function log(m){const d=document.createElement('div');d.textContent='['+new Date().toLocaleTimeString()+'] '+m;$('log').prepend(d);while($('log').children.length>400)$('log').lastChild.remove();}
const needApproved=()=>{if(!Auth.isApproved()){toast(t('pr.needApproved'));return false;}return true;};
const needAdmin=()=>{if(!Auth.isAdmin()){toast(t('pr.needAdminSave'));return false;}return true;};
const werr=e=>{const c=(e&&e.code)||'';toast(/PERMISSION_DENIED/i.test(c+e)?t('c.denied'):t('c.fail')+': '+(e&&e.message||e));};
function safe(fn,l){try{fn();}catch(e){console.error(l,e);}}

/* ================= parent verification ================= */
const Verify=(function(){
const CSS=`
.vf-scrim{position:fixed;inset:0;z-index:1500;background:rgba(15,35,64,.52);display:none;align-items:center;justify-content:center;padding:18px}
.vf-scrim.on{display:flex}
.vf-modal{width:min(580px,100%);max-height:calc(100vh - 36px);overflow:auto;background:var(--surface,#fff);border:1px solid var(--line,#dae6f4);border-radius:14px;box-shadow:0 26px 70px rgba(15,35,64,.32);padding:24px}
.vf-eyebrow{display:inline-block;font-size:10.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--wn,#8f6410)}
.vf-modal h3{font-size:19px;margin:6px 0 12px;font-weight:600}
.vf-q{background:var(--wns,#fbf2dd);border:1px solid var(--wnl,#e8d6a8);border-radius:10px;padding:14px 16px;color:var(--wn,#8f6410);font-size:16.5px;line-height:1.75;font-weight:500}
.vf-q2{margin-top:10px;font-size:14.5px;line-height:1.7}
.vf-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(136px,1fr));gap:10px;margin:14px 0}
.vf-cell{background:var(--panel,#f6faff);border:1px solid var(--line,#dae6f4);border-radius:8px;padding:9px 12px;min-width:0}
.vf-cell span{display:block;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--faint,#8ba1bd);margin-bottom:2px}
.vf-cell b{display:block;font-size:15px;font-weight:600;word-break:break-word}
.vf-cell.big b{font-size:22px;line-height:1.3}
.vf-hint{font-size:12.5px;color:var(--muted,#5a7391);line-height:1.65}
.vf-row{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}
.vf-banner{display:flex;gap:10px;align-items:flex-start;background:var(--wns,#fbf2dd);border:1px solid var(--wnl,#e8d6a8);color:var(--wn,#8f6410);border-radius:10px;padding:12px 14px;font-size:13px;line-height:1.65;margin-top:10px}
.vf-banner svg{width:17px;height:17px;flex:none;margin-top:2px}
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
  document.getElementById('vfQ2').textContent=LL.meetLine(s)
    ? t('vf.askMeet',{time:String(s.meetTime||'—'),teacher:String(s.meetTeacher||'—'),room:String(s.meetRoom||'—')})
    : t('vf.noMeet');
  document.getElementById('vfGrid').innerHTML=
     cell(t('c.zh'),nameZh,true)+cell(t('c.en'),nameEn)+cell(t('c.class'),cls)+cell(t('c.no'),no)
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
return {ask,banner,paint,open};
})();

/* ================= ui ================= */
function showTab(n){document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===n));document.querySelectorAll('.tabpanel').forEach(p=>p.classList.toggle('on',p.id==='tab-'+n));}
const effText=()=>{const e=LL.eff(S.layout);return t('dz.eff')+': '+t('dz.origin')+' ('+e.x+', '+e.y+') · '+t('dz.sizeW')+' '+e.w+'×'+e.h+' mm · '+t('po.hide')+' '+t('po.top')+' '+S.layout.hide.top+' / '+t('po.left')+' '+S.layout.hide.left+' mm';};
function syncCfg(){
  const l=S.layout;
  $('pDcW').value=l.doc.w;$('pDcH').value=l.doc.h;$('pHdT').value=l.hide.top;$('pHdL').value=l.hide.left;
  $('pTop').value=l.simple.topMm;$('pSide').value=l.simple.sideMm;$('pEn').value=l.simple.enSize;$('pZh').value=l.simple.zhSize;$('pMs').value=l.simple.meetSize;$('pGap').value=l.simple.gapMm;
  $('pEnT').value=l.simple.enText;$('pZhT').value=l.simple.zhText;$('pMeT').value=l.simple.meetText;
  $('pBasic').style.display=l.mode==='simple'?'block':'none';
  $('pDesignerNote').style.display=l.mode==='designer'?'block':'none';
  $('lyInfo').textContent=effText();
}
function renderPreview(){const e=LL.eff(S.layout),p=$('prev');p.style.width=e.w+'mm';p.style.height=e.h+'mm';p.innerHTML=LL.stageHTML(S.layout,S.layout.sample,false);}
function applyCss(){$('labelCss').textContent=LL.printCss(S.layout);renderPreview();}
function renderScanReady(){const b=$('scan');setScan(b,'ready');b.innerHTML=esc(t('op.ready'))+'<small>'+esc(t('op.readySub'))+'</small>';}
function renderAttStats(){let p=0,a=0;Object.values(S.att).forEach(r=>r.status==='present'?p++:a++);$('opAtt').textContent=t('pr.today')+': '+t('c.present')+' '+p+' · '+t('c.absent')+' '+a+' · '+t('c.unmarked')+' '+Math.max(0,Object.keys(S.students).length-p-a);}
function updateCount(){$('queueChip').textContent=t('pr.queue')+' '+S.jobs.length;}
function renderStationText(){
  $('stationChip').textContent=S.station?S.station.name+' ('+S.station.token+')':t('st.notBound');
  $('stInfo').textContent=S.station?t('st.this')+': '+S.station.name+' · '+t('st.token')+' '+S.station.token:'—';
}
function renderStatus(){$('statusText').textContent=S.connected?t('pr.online'):t('pr.connecting');$('dot').className='dot'+(S.connected?' on':'');}
const attBadge=a=>a?(a.status==='present'?'<span class="ab p">'+esc(t('c.present'))+' <i>'+fmtT(a.time)+'</i></span>':'<span class="ab a">'+esc(t('c.absent'))+' <i>'+fmtT(a.time)+'</i></span>'):'<span class="ab">'+esc(t('c.unmarked'))+'</span>';

/* ================= data ================= */
function attachAtt(day){
  if(S.attRef)S.attRef.off();
  S.attDay=day;S.att={};
  S.attRef=db().ref('parents/attendance/'+day);
  S.attRef.on('value',s=>{S.att=s.val()||{};safe(renderAttStats,'att');safe(doSearch,'search');},werr);
}
async function markAtt(k,st,by){const s=S.students[k];if(!s)return;await db().ref('parents/attendance/'+S.attDay+'/'+k).set({status:st,time:Date.now(),by,cls:s.cls||'',classNo:s.classNo||'',nameEn:s.nameEn||'',nameZh:s.nameZh||'',cardId:s.cardId||''});}
async function findToken(tk){const all=(await db().ref('parents/stations').once('value')).val()||{};return Object.entries(all).find(([k,v])=>String(v.token||'').toUpperCase()===tk);}
function pushJob(s){return db().ref('parents/queues/'+S.stationKey).push(Object.assign({type:'label',cls:s.cls||'',classNo:s.classNo||'',nameEn:s.nameEn||'',nameZh:s.nameZh||'',cardId:s.cardId||''},meetOf(s),{copies:1,createdAt:Date.now(),done:false}));}
function enqueue(k,j){if(S.seen[k])return;S.seen[k]=1;S.jobs.push(Object.assign({key:k},j));updateCount();log(t('pr.jobReceived')+': '+(j.nameEn||'?')+(LL.meetLine(j)?' · '+LL.meetLine(j):''));processJobs();}
async function processJobs(){
  if(S.printing)return;S.printing=true;
  while(S.jobs.length){
    const j=S.jobs.shift();updateCount();
    await db().ref('parents/queues/'+S.stationKey+'/'+j.key).remove().catch(()=>{});
    log(t('pr.preparing')+' '+(j.nameEn||''));
    $('printArea').innerHTML=LL.stageHTML(S.layout,j,true);
    await new Promise(r=>setTimeout(r,2000));
    const c=Math.max(1,j.copies||1);
    for(let i=0;i<c;i++){window.print();log((j.nameEn||'LABEL')+' '+(i+1)+'/'+c+' '+t('pr.sent'));if(i<c-1)await new Promise(r=>setTimeout(r,2000));}
    await new Promise(r=>setTimeout(r,2000));
  }
  S.printing=false;
}
function bindStation(key){
  S.stationKey=key;$('bindCard').style.display='none';$('mainArea').style.display='block';
  if(S.started)return;S.started=true;
  db().ref('parents/stations/'+key).on('value',s=>{
    S.station=s.val();
    if(!S.station){toast(t('st.deleted'));localStorage.removeItem(LS);setTimeout(()=>location.reload(),1500);return;}
    renderStationText();
  },werr);
  db().ref('parents/queues/'+key).on('value',snap=>{const all=snap.val()||{};Object.keys(all).forEach(k=>{const j=all[k];if(j&&!j.done&&!S.seen[k])enqueue(k,j);});},werr);
  const beat=()=>db().ref('parents/stations/'+key+'/lastSeen').set(Date.now()).catch(()=>{});
  beat();setInterval(beat,20000);log(t('st.bound'));
}
async function scan(code){
  showTab('operate');
  const box=$('scan'),k=S.byCard[normCard(code)];
  if(k){
    const s=S.students[k];setScan(box,'ok');
    try{await markAtt(k,'present','scan');await pushJob(s);box.innerHTML=esc(s.nameEn||s.nameZh)+' — '+esc(t('pr.markedPrint',{t:fmtT(Date.now())}))+meetHtml(s);}catch(e){werr(e);}
  }else{setScan(box,'err');box.innerHTML=esc(t('op.unreg'))+': '+esc(code);}
  setTimeout(renderScanReady,3500);
}
function doSearch(){
  const q=$('q').value.trim();if(!q){$('res').innerHTML='';return;}
  const hits=Object.entries(S.students).filter(([k,s])=>LL.searchMatch(s,q)).slice(0,30);
  $('res').innerHTML=hits.map(([k,s])=>'<div class="stu-card"><div class="stu-head"><span class="stu-name">'+esc(s.nameEn||s.nameZh)+'</span><span class="stu-sub">'+esc(s.nameZh||'')+'</span><span class="stu-sub">'+esc(s.cls||'')+' '+esc(s.classNo||'')+'</span>'+attBadge(S.att[k])+'</div>'+meetHtml(s)+'<div class="act-row"><button class="btn lg" data-act="print" data-k="'+esc(k)+'">'+esc(t('rm.presentPrint'))+'</button><button class="btn lg ok" data-act="pres" data-k="'+esc(k)+'">'+esc(t('rm.presentOnly'))+'</button><button class="btn lg bad" data-act="abs" data-k="'+esc(k)+'">'+esc(t('rm.absentOnly'))+'</button></div></div>').join('')||'<p class="muted">'+esc(t('c.noMatch'))+'</p>';
}

/* ================= wiring ================= */
function wire(){
  document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
  [['pDcW','doc','w'],['pDcH','doc','h'],['pHdT','hide','top'],['pHdL','hide','left']].forEach(([id,g,k])=>$(id).addEventListener('input',()=>{const v=parseFloat($(id).value);if(!Number.isFinite(v))return;S.layout[g][k]=g==='hide'?Math.max(0,v):Math.max(1,v);applyCss();$('lyInfo').textContent=effText();}));
  [['pTop','topMm'],['pSide','sideMm'],['pEn','enSize'],['pZh','zhSize'],['pMs','meetSize'],['pGap','gapMm']].forEach(([id,k])=>$(id).addEventListener('input',()=>{const v=parseFloat($(id).value);if(!Number.isFinite(v))return;S.layout.simple[k]=v;applyCss();}));
  [['pEnT','enText'],['pZhT','zhText'],['pMeT','meetText']].forEach(([id,k])=>$(id).addEventListener('input',()=>{S.layout.simple[k]=$(id).value;applyCss();}));
  $('btnPreset').onclick=()=>{S.layout.doc={w:60,h:60};S.layout.hide={top:20,left:0};syncCfg();applyCss();toast(t('dz.presetOk'));};
  $('btnSaveCfg').onclick=async()=>{if(!needAdmin())return;try{const p=LL.clone(S.layout);p.version=5;p.updatedAt=Date.now();await db().ref('parents/labelLayout').set(p);toast(t('c.saved'));}catch(e){werr(e);}};
  $('btnBind').onclick=async()=>{
    if(!needApproved())return;
    const tk=$('bToken').value.trim().toUpperCase();if(!tk)return $('bindMsg').textContent=t('st.needToken');
    try{const hit=await findToken(tk);if(!hit)return $('bindMsg').textContent=t('st.notFound');localStorage.setItem(LS,tk);bindStation(hit[0]);}catch(e){werr(e);}
  };
  $('btnCreate').onclick=async()=>{
    if(!needApproved())return;
    const tk=$('bToken').value.trim().toUpperCase(),n=$('bName').value.trim();
    if(!tk||!n)return $('bindMsg').textContent=t('st.needTokenName');
    try{if(await findToken(tk))return $('bindMsg').textContent=t('st.existsBind');
      const ref=await db().ref('parents/stations').push({name:n,token:tk,settings:{},createdAt:Date.now(),lastSeen:Date.now()});
      localStorage.setItem(LS,tk);bindStation(ref.key);}catch(e){werr(e);}
  };
  $('btnUnbind').onclick=()=>{if(confirm(t('st.unbindQ'))){localStorage.removeItem(LS);location.reload();}};
  $('btnTest').onclick=async()=>{if(!confirm(t('pr.testQ')))return;$('printArea').innerHTML=LL.stageHTML(S.layout,S.layout.sample,true);await new Promise(r=>setTimeout(r,2000));window.print();log(t('pr.testSent'));};
  $('btnClear').onclick=async()=>{if(!needApproved())return;if(!confirm(t('pr.clearQ')))return;try{await db().ref('parents/queues/'+S.stationKey).remove();S.jobs.length=0;S.seen={};updateCount();log(t('pr.cleared'));}catch(e){werr(e);}};
  $('q').addEventListener('input',()=>safe(doSearch,'search'));

  $('res').onclick=async e=>{
    const b=e.target.closest('button[data-act]');if(!b||!needApproved())return;
    const k=b.dataset.k,s=S.students[k];if(!s||!S.stationKey)return;
    const a=b.dataset.act;
    /* Mandatory: ask the parent to confirm the manually found student. */
    const ok=await Verify.ask(s);
    if(!ok){toast(t('vf.cancelled'));log(t('vf.cancel')+' — '+(s.nameEn||s.nameZh));return;}
    const who=s.nameEn||s.nameZh;
    if(a==='print'){
      if(S.busy)return;S.busy=true;b.disabled=true;
      try{
        await markAtt(k,'present','printer-v');await pushJob(s);
        toast(t('vf.verifiedToast')+' · '+t('pr.queued'));
        log(t('rm.sPrint')+' '+who+(LL.meetLine(s)?' · '+LL.meetLine(s):'')+' '+t('vf.logVerified'));
      }catch(x){werr(x);}finally{S.busy=false;b.disabled=false;}
    }else{
      try{
        await markAtt(k,a==='pres'?'present':'absent','printer-v');
        toast(t('vf.verifiedToast')+' · '+(a==='pres'?t('rm.markedPresent'):t('rm.markedAbsent'))+' '+who);
        log(t('pr.marked')+' '+who+' '+t(a==='pres'?'c.present':'c.absent')+' '+t('vf.logVerified'));
      }catch(x){werr(x);}
    }
  };

  document.addEventListener('keydown',e=>{
    if(document.body.classList.contains('auth-locked')||Verify.open())return;
    const a=document.activeElement;if(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName))return;
    if(!S.stationKey)return;
    const now=Date.now();if(now-S.bufAt>140)S.buf='';S.bufAt=now;
    if(e.key==='Enter'||e.key==='Tab'){if(S.buf.length>=4){e.preventDefault();const c=S.buf;S.buf='';scan(c);}S.buf='';}
    else if(e.key.length===1)S.buf+=e.key;
  });
  document.addEventListener('langchange',()=>{I18N.apply();Verify.paint();syncCfg();applyCss();renderScanReady();renderAttStats();updateCount();renderStationText();renderStatus();doSearch();});
}

I18N.apply();I18N.mountToggle();
syncCfg();applyCss();renderScanReady();renderAttStats();updateCount();renderStationText();renderStatus();
wire();
Verify.banner('q');
Auth.start(function(){
  attachAtt(S.attDay);
  setInterval(()=>{const d=dayKey();if(d!==S.attDay)attachAtt(d);},30000);
  db().ref('parents/labelLayout').on('value',s=>{S.layout=LL.norm(s.val());syncCfg();applyCss();},werr);
  db().ref('parents/students').on('value',s=>{S.students=s.val()||{};S.byCard={};Object.entries(S.students).forEach(([k,v])=>{if(v.cardId)S.byCard[normCard(v.cardId)]=k;});renderAttStats();doSearch();},werr);
  db().ref('.info/connected').on('value',s=>{S.connected=s.val()===true;renderStatus();});
  (async()=>{const tk=localStorage.getItem(LS);if(tk){try{const hit=await findToken(tk);if(hit)bindStation(hit[0]);}catch(e){}}})();
});
})();
