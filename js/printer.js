/* js/printer.js — station binding, high-throughput printing, attendance, label settings.
   Local card swipes bypass the cloud queue entirely and print with no cooldown;
   remote/admin jobs arrive through the queue and use the same fast pipeline.
   Manual (typed) operations still require verbal confirmation with the parent. */
(function(){
const LS='plPrinterToken';
const LSP='plPrinterSpeed';
const DEF_SPEED={mode:'fast',settle:70,copies:1,dupe:1200,sound:true};
const S={
  stationKey:null,station:null,started:false,layout:LL.norm(null),
  students:{},byCard:{},att:{},attDay:'',attRef:null,busy:false,
  pipe:[],piping:false,seen:{},printed:0,recent:[],lastCard:{},
  buf:'',bufAt:0,connected:false,speed:loadSpeed(),scanTimer:null,attWarned:false,audio:null
};
const $=id=>document.getElementById(id);
const t=(k,v)=>I18N.t(k,v);
const esc=LL.esc;
const db=()=>Auth.db;
const dayKey=(d=new Date())=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
S.attDay=dayKey();
const fmtT=ts=>ts?new Date(ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'—';
const fmtS=ts=>ts?new Date(ts).toLocaleTimeString('en-GB'):'—';
const normCard=v=>String(v==null?'':v).trim().replace(/^0+/,'').toUpperCase();
const meetOf=s=>({meetTime:String(s.meetTime||''),meetTeacher:String(s.meetTeacher||''),meetRoom:String(s.meetRoom||'')});
const meetHtml=s=>{const m=LL.meetLine(s);return m?'<div class="mline"><b>'+esc(t('m.label'))+'</b> '+esc(m)+'</div>':'';};
const SC={ready:['#e5f0fc','#084c9e'],ok:['#e4f4ec','#16794b'],err:['#fbeaea','#bf3a3a'],dup:['#fbf2dd','#8f6410']};
const setScan=(el,k)=>{el.style.background=SC[k][0];el.style.color=SC[k][1];};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const raf2=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
let toastTimer=null;
function toast(m){const e=$('toast');e.textContent=m;e.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('on'),2600);}
function log(m){const d=document.createElement('div');d.textContent='['+new Date().toLocaleTimeString()+'] '+m;$('log').prepend(d);while($('log').children.length>500)$('log').lastChild.remove();}
const needApproved=()=>{if(!Auth.isApproved()){toast(t('pr.needApproved'));return false;}return true;};
const needAdmin=()=>{if(!Auth.isAdmin()){toast(t('pr.needAdminSave'));return false;}return true;};
const werr=e=>{const c=(e&&e.code)||'';toast(/PERMISSION_DENIED/i.test(c+e)?t('c.denied'):t('c.fail')+': '+(e&&e.message||e));};
function safe(fn,l){try{fn();}catch(e){console.error(l,e);}}

/* ---------- speed settings (per device) ---------- */
function loadSpeed(){
  try{
    const raw=JSON.parse(localStorage.getItem(LSP)||'null');
    if(!raw||typeof raw!=='object')return Object.assign({},DEF_SPEED);
    return {
      mode:raw.mode==='safe'?'safe':'fast',
      settle:clamp(parseInt(raw.settle,10)||0,0,2000),
      copies:clamp(parseInt(raw.copies,10)||1,1,10),
      dupe:clamp(parseInt(raw.dupe,10)||0,0,5000),
      sound:raw.sound!==false
    };
  }catch(e){return Object.assign({},DEF_SPEED);}
}
function saveSpeed(){try{localStorage.setItem(LSP,JSON.stringify(S.speed));}catch(e){}}
function beep(kind){
  if(!S.speed.sound)return;
  try{
    if(!S.audio){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;S.audio=new AC();}
    if(S.audio.state==='suspended')S.audio.resume();
    const o=S.audio.createOscillator(),g=S.audio.createGain(),now=S.audio.currentTime;
    o.type='sine';o.frequency.value=kind==='err'?230:kind==='dup'?520:900;
    g.gain.setValueAtTime(.0001,now);
    g.gain.exponentialRampToValueAtTime(.16,now+.01);
    g.gain.exponentialRampToValueAtTime(.0001,now+(kind==='err'?.20:.08));
    o.connect(g);g.connect(S.audio.destination);o.start(now);o.stop(now+(kind==='err'?.22:.10));
  }catch(e){}
}

/* ================= parent verification (manual entry only) ================= */
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
.sp-recent{margin-top:12px;border-top:1px solid var(--line,#dae6f4);padding-top:10px}
.sp-recent h4{font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--faint,#8ba1bd);margin:0 0 8px}
.sp-line{display:flex;gap:10px;align-items:baseline;font-size:13px;padding:4px 0;border-bottom:1px solid var(--hair,#e9f1fa)}
.sp-line:last-child{border-bottom:0}
.sp-line .tm{font:11.5px var(--mono,monospace);color:var(--faint,#8ba1bd);flex:none}
.sp-line .nm{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sp-line .mt{font-size:12px;color:var(--muted,#5a7391);margin-left:auto;text-align:right;flex:none;max-width:52%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sp-line .src{font:10.5px var(--mono,monospace);color:var(--acd,#084c9e);background:var(--acs,#e5f0fc);border:1px solid var(--acl,#b4d1f2);border-radius:999px;padding:1px 7px;flex:none}
@media(max-width:520px){.vf-row .btn{flex:1 1 auto}.sp-line .mt{display:none}}
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
return {ask,banner,paint,open,mount};
})();

/* ================= print pipeline (no cooldown) ================= */
function updateCount(){
  $('queueChip').textContent=t('pr.queue')+' '+S.pipe.length;
  const p=document.getElementById('printedChip');
  if(p)p.textContent=t('sp.printed')+' '+S.printed;
  const st=document.getElementById('pipeChip');
  if(st)st.textContent=S.piping?t('sp.pipeBusy'):t('sp.pipeIdle');
}
function pushRecent(name,meet,src){
  S.recent.unshift({name:name,meet:meet,src:src,ts:Date.now()});
  if(S.recent.length>6)S.recent.length=6;
  renderRecent();
}
function renderRecent(){
  const box=document.getElementById('spRecent');if(!box)return;
  box.innerHTML='<h4>'+esc(t('sp.recent'))+'</h4>'+(S.recent.length
    ? S.recent.map(r=>'<div class="sp-line"><span class="tm">'+esc(fmtS(r.ts))+'</span><span class="nm">'+esc(r.name)+'</span><span class="src">'+esc(t(r.src==='local'?'sp.local':'sp.queue'))+'</span><span class="mt">'+esc(r.meet||'')+'</span></div>').join('')
    : '<p class="muted" style="font-size:13px;margin:0">'+esc(t('sp.empty'))+'</p>');
}
function enqueue(job){S.pipe.push(job);updateCount();runPipe();}
async function runPipe(){
  if(S.piping)return;S.piping=true;updateCount();
  while(S.pipe.length){
    const j=S.pipe.shift();updateCount();
    /* Remote jobs are cleared from the cloud queue; local swipes never touched it. */
    if(j.key)await db().ref('parents/queues/'+S.stationKey+'/'+j.key).remove().catch(()=>{});
    try{
      $('printArea').innerHTML=LL.stageHTML(S.layout,j.data,true);
      await raf2();
      if(S.speed.settle>0)await sleep(S.speed.settle);
      const c=clamp(parseInt(j.copies,10)||S.speed.copies||1,1,10);
      for(let i=0;i<c;i++){
        window.print();
        S.printed++;updateCount();
        log((j.data.nameEn||j.data.nameZh||'LABEL')+' '+(i+1)+'/'+c+' '+t('pr.sent')+(j.local?' · '+t('sp.local'):''));
        if(i<c-1)await sleep(Math.max(S.speed.settle,40));
      }
      pushRecent(j.data.nameEn||j.data.nameZh||'LABEL',LL.meetLine(j.data),j.local?'local':'queue');
    }catch(e){log(t('c.fail')+': '+(e.message||e));}
    if(S.speed.mode==='safe')await sleep(200);
  }
  S.piping=false;updateCount();
}
function enqueueRemote(k,j){
  if(S.seen[k])return;S.seen[k]=1;
  log(t('pr.jobReceived')+': '+(j.nameEn||'?')+(LL.meetLine(j)?' · '+LL.meetLine(j):''));
  enqueue({key:k,data:j,copies:j.copies});
}

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
function scanLater(ms){clearTimeout(S.scanTimer);S.scanTimer=setTimeout(renderScanReady,ms);}
function renderAttStats(){let p=0,a=0;Object.values(S.att).forEach(r=>r.status==='present'?p++:a++);$('opAtt').textContent=t('pr.today')+': '+t('c.present')+' '+p+' · '+t('c.absent')+' '+a+' · '+t('c.unmarked')+' '+Math.max(0,Object.keys(S.students).length-p-a);}
function renderStationText(){
  $('stationChip').textContent=S.station?S.station.name+' ('+S.station.token+')':t('st.notBound');
  $('stInfo').textContent=S.station?t('st.this')+': '+S.station.name+' · '+t('st.token')+' '+S.station.token:'—';
}
function renderStatus(){$('statusText').textContent=S.connected?t('pr.online'):t('pr.connecting');$('dot').className='dot'+(S.connected?' on':'');}
const attBadge=a=>a?(a.status==='present'?'<span class="ab p">'+esc(t('c.present'))+' <i>'+fmtT(a.time)+'</i></span>':'<span class="ab a">'+esc(t('c.absent'))+' <i>'+fmtT(a.time)+'</i></span>'):'<span class="ab">'+esc(t('c.unmarked'))+'</span>';

/* ---------- injected speed panel + throughput chips ---------- */
function mountSpeedUI(){
  Verify.mount();
  const strip=document.querySelector('.status-strip');
  if(strip&&!document.getElementById('printedChip')){
    const a=document.createElement('span');a.className='chip';a.id='printedChip';
    const b=document.createElement('span');b.className='chip';b.id='pipeChip';
    strip.appendChild(a);strip.appendChild(b);
  }
  const scanCard=$('scan')&&$('scan').closest('.card');
  if(scanCard&&!document.getElementById('spRecent')){
    const d=document.createElement('div');d.className='sp-recent';d.id='spRecent';scanCard.appendChild(d);
  }
  const tab=$('tab-settings');
  if(tab&&!document.getElementById('speedCard')){
    const c=document.createElement('div');c.className='card';c.id='speedCard';
    c.innerHTML='<h3 data-i18n="sp.title"></h3><p class="muted" data-i18n="sp.desc"></p>'
      +'<div class="row" style="margin-bottom:12px"><div class="seg" id="spMode"><button data-m="fast" data-i18n="sp.fast"></button><button data-m="safe" data-i18n="sp.safe"></button></div><span class="tag" id="spState"></span></div>'
      +'<div class="g">'
      +'<div><label data-i18n="sp.settle"></label><input id="spSettle" type="number" min="0" max="2000" step="10"></div>'
      +'<div><label data-i18n="sp.copies"></label><input id="spCopies" type="number" min="1" max="10"></div>'
      +'<div><label data-i18n="sp.dupe"></label><input id="spDupe" type="number" min="0" max="5000" step="100"></div>'
      +'</div>'
      +'<div class="row" style="margin-top:12px"><label class="check" style="padding:0"><input type="checkbox" id="spSound"><span data-i18n="sp.sound"></span></label><span class="spacer"></span><button class="btn gray" id="spReset" data-i18n="sp.reset"></button></div>'
      +'<p class="muted" style="margin-top:10px" data-i18n="sp.settleHint"></p>'
      +'<p class="muted" data-i18n="sp.dupeHint"></p>'
      +'<p class="muted" data-i18n="sp.testHint"></p>';
    tab.insertBefore(c,tab.firstChild);
    I18N.apply(c);
    document.querySelectorAll('#spMode button').forEach(b=>b.onclick=()=>{
      S.speed.mode=b.dataset.m;S.speed.settle=S.speed.mode==='fast'?70:500;
      saveSpeed();syncSpeedUI();toast(t('sp.saved'));
    });
    $('spSettle').addEventListener('input',()=>{const v=parseInt($('spSettle').value,10);if(!Number.isFinite(v))return;S.speed.settle=clamp(v,0,2000);saveSpeed();renderSpeedState();});
    $('spCopies').addEventListener('input',()=>{const v=parseInt($('spCopies').value,10);if(!Number.isFinite(v))return;S.speed.copies=clamp(v,1,10);saveSpeed();renderSpeedState();});
    $('spDupe').addEventListener('input',()=>{const v=parseInt($('spDupe').value,10);if(!Number.isFinite(v))return;S.speed.dupe=clamp(v,0,5000);saveSpeed();renderSpeedState();});
    $('spSound').addEventListener('change',()=>{S.speed.sound=$('spSound').checked;saveSpeed();if(S.speed.sound)beep('ok');});
    $('spReset').onclick=()=>{S.speed=Object.assign({},DEF_SPEED);saveSpeed();syncSpeedUI();toast(t('sp.saved'));};
  }
  syncSpeedUI();renderRecent();updateCount();
}
function renderSpeedState(){
  const el=document.getElementById('spState');
  if(el)el.textContent=(S.speed.mode==='fast'?t('sp.fastOn'):t('sp.safeOn'))+' · '+S.speed.settle+'ms · ×'+S.speed.copies;
}
function syncSpeedUI(){
  if(!document.getElementById('speedCard'))return;
  document.querySelectorAll('#spMode button').forEach(b=>b.classList.toggle('on',b.dataset.m===S.speed.mode));
  $('spSettle').value=S.speed.settle;$('spCopies').value=S.speed.copies;$('spDupe').value=S.speed.dupe;$('spSound').checked=S.speed.sound;
  renderSpeedState();
}

/* ================= data ================= */
function attachAtt(day){
  if(S.attRef)S.attRef.off();
  S.attDay=day;S.att={};
  S.attRef=db().ref('parents/attendance/'+day);
  S.attRef.on('value',s=>{S.att=s.val()||{};safe(renderAttStats,'att');safe(doSearch,'search');},werr);
}
async function markAtt(k,st,by){
  const s=S.students[k];if(!s)return;
  await db().ref('parents/attendance/'+S.attDay+'/'+k).set({status:st,time:Date.now(),by,cls:s.cls||'',classNo:s.classNo||'',nameEn:s.nameEn||'',nameZh:s.nameZh||'',cardId:s.cardId||''});
}
async function findToken(tk){const all=(await db().ref('parents/stations').once('value')).val()||{};return Object.entries(all).find(([k,v])=>String(v.token||'').toUpperCase()===tk);}
function pushJob(s){return db().ref('parents/queues/'+S.stationKey).push(Object.assign({type:'label',cls:s.cls||'',classNo:s.classNo||'',nameEn:s.nameEn||'',nameZh:s.nameZh||'',cardId:s.cardId||''},meetOf(s),{copies:S.speed.copies,createdAt:Date.now(),done:false}));}
function bindStation(key){
  S.stationKey=key;$('bindCard').style.display='none';$('mainArea').style.display='block';
  mountSpeedUI();
  if(S.started)return;S.started=true;
  db().ref('parents/stations/'+key).on('value',s=>{
    S.station=s.val();
    if(!S.station){toast(t('st.deleted'));localStorage.removeItem(LS);setTimeout(()=>location.reload(),1500);return;}
    renderStationText();
  },werr);
  db().ref('parents/queues/'+key).on('value',snap=>{const all=snap.val()||{};Object.keys(all).forEach(k=>{const j=all[k];if(j&&!j.done&&!S.seen[k])enqueueRemote(k,j);});},werr);
  const beat=()=>db().ref('parents/stations/'+key+'/lastSeen').set(Date.now()).catch(()=>{});
  beat();setInterval(beat,20000);log(t('st.bound'));
}

/* ---------- fast local swipe ---------- */
function scan(code){
  showTab('operate');
  const card=normCard(code),now=Date.now(),box=$('scan');
  if(S.speed.dupe>0&&S.lastCard[card]&&now-S.lastCard[card]<S.speed.dupe){
    setScan(box,'dup');box.innerHTML=esc(t('sp.dupeIgnored'))+'<small>'+esc(card)+'</small>';
    beep('dup');scanLater(900);return;
  }
  S.lastCard[card]=now;
  const k=S.byCard[card];
  if(!k){
    setScan(box,'err');box.innerHTML=esc(t('op.unreg'))+': '+esc(code);
    beep('err');log(t('op.unreg')+': '+code);scanLater(2200);return;
  }
  const s=S.students[k];
  /* Print first — no cloud round trip, no cooldown. */
  setScan(box,'ok');
  box.innerHTML=esc(s.nameEn||s.nameZh)+'<small>'+esc(s.cls||'')+' '+esc(s.classNo||'')+(LL.meetLine(s)?' · '+esc(LL.meetLine(s)):'')+'</small><small>'+esc(t('op.markedPresent'))+' '+fmtT(now)+' · '+esc(t('sp.local'))+'</small>';
  beep('ok');
  enqueue({local:true,data:Object.assign({},s),copies:S.speed.copies});
  /* Attendance is written in parallel and never blocks the printer. */
  markAtt(k,'present','scan').catch(e=>{
    log(t('sp.attFail')+' '+(e&&e.message||e));
    if(!S.attWarned){S.attWarned=true;toast(t('sp.attFail'));setTimeout(()=>{S.attWarned=false;},15000);}
  });
  scanLater(1100);
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
  $('btnTest').onclick=()=>{if(!confirm(t('pr.testQ')))return;enqueue({local:true,data:Object.assign({},S.layout.sample),copies:S.speed.copies});log(t('pr.testSent'));};
  $('btnClear').onclick=async()=>{
    if(!needApproved())return;if(!confirm(t('pr.clearQ')))return;
    try{await db().ref('parents/queues/'+S.stationKey).remove();S.pipe=S.pipe.filter(j=>j.local);S.seen={};updateCount();log(t('pr.cleared'));}catch(e){werr(e);}
  };
  $('q').addEventListener('input',()=>safe(doSearch,'search'));

  $('res').onclick=async e=>{
    const b=e.target.closest('button[data-act]');if(!b||!needApproved())return;
    const k=b.dataset.k,s=S.students[k];if(!s||!S.stationKey)return;
    const a=b.dataset.act;
    const ok=await Verify.ask(s);
    if(!ok){toast(t('vf.cancelled'));log(t('vf.cancel')+' — '+(s.nameEn||s.nameZh));return;}
    const who=s.nameEn||s.nameZh;
    if(a==='print'){
      if(S.busy)return;S.busy=true;b.disabled=true;
      try{
        await markAtt(k,'present','printer-v');
        enqueue({local:true,data:Object.assign({},s),copies:S.speed.copies});
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
  document.addEventListener('langchange',()=>{
    I18N.apply();Verify.paint();syncCfg();applyCss();renderScanReady();renderAttStats();
    updateCount();renderStationText();renderStatus();doSearch();syncSpeedUI();renderRecent();
  });
}

I18N.apply();I18N.mountToggle();
syncCfg();applyCss();renderScanReady();renderAttStats();renderStationText();renderStatus();
wire();
Verify.banner('q');
mountSpeedUI();
Auth.start(function(){
  attachAtt(S.attDay);
  setInterval(()=>{const d=dayKey();if(d!==S.attDay)attachAtt(d);},30000);
  db().ref('parents/labelLayout').on('value',s=>{S.layout=LL.norm(s.val());syncCfg();applyCss();},werr);
  db().ref('parents/students').on('value',s=>{S.students=s.val()||{};S.byCard={};Object.entries(S.students).forEach(([k,v])=>{if(v.cardId)S.byCard[normCard(v.cardId)]=k;});renderAttStats();doSearch();},werr);
  db().ref('.info/connected').on('value',s=>{S.connected=s.val()===true;renderStatus();});
  (async()=>{const tk=localStorage.getItem(LS);if(tk){try{const hit=await findToken(tk);if(hit)bindStation(hit[0]);}catch(e){}}})();
});
})();
