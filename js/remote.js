/* js/remote.js — handheld terminal. Student ID is the identity shown to the parent. */
(function(){
const LS='plRemoteStation';
const S={students:{},stations:{},queues:{},station:localStorage.getItem(LS)||null,att:{},attDay:'',attRef:null,busy:false};
const $=id=>document.getElementById(id);
const t=(k,v)=>I18N.t(k,v);
const esc=LL.esc;
const db=()=>Auth.db;
const dayKey=(d=new Date())=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
S.attDay=dayKey();
const fmtT=ts=>ts?new Date(ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'—';
const online=st=>st&&st.lastSeen&&(Date.now()-st.lastSeen<60000);
const qCount=k=>Object.keys(S.queues[k]||{}).length;
const meetOf=s=>({meetTime:String(s.meetTime||''),meetTeacher:String(s.meetTeacher||''),meetRoom:String(s.meetRoom||'')});
const meetHtml=s=>{const m=LL.meetLine(s);return m?'<div class="mline"><b>'+esc(t('m.label'))+'</b> '+esc(m)+'</div>':'<div class="mline">'+esc(t('m.none'))+'</div>';};
let toastTimer=null;
function toast(m){const e=$('toast');e.textContent=m;e.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('on'),3000);}
const needApproved=()=>{if(!Auth.isApproved()){toast(t('pr.needApproved'));return false;}return true;};
const werr=e=>{const c=(e&&e.code)||'';toast(/PERMISSION_DENIED/i.test(c+e)?t('c.denied'):t('c.fail')+': '+(e&&e.message||e));};
function safe(fn,l){try{fn();}catch(e){console.error(l,e);}}
function sess(m){const d=document.createElement('div');d.textContent='['+fmtT(Date.now())+'] '+m;const s=$('session');if(s.firstChild&&s.firstChild.textContent==='—')s.innerHTML='';s.prepend(d);while(s.children.length>14)s.lastChild.remove();}
const attBadge=a=>a?(a.status==='present'?'<span class="ab p">'+esc(t('c.present'))+' <i>'+fmtT(a.time)+'</i></span>':'<span class="ab a">'+esc(t('c.absent'))+' <i>'+fmtT(a.time)+'</i></span>'):'<span class="ab">'+esc(t('c.unmarked'))+'</span>';

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
return {ask,banner,paint,open};
})();

function renderStats(){
  let p=0,a=0;Object.values(S.att).forEach(r=>r.status==='present'?p++:a++);
  const mc=Object.values(S.students).filter(s=>LL.meetLine(s)).length;
  $('sP').textContent=t('c.present')+' '+p;$('sA').textContent=t('c.absent')+' '+a;
  $('sN').textContent=t('c.unmarked')+' '+Math.max(0,Object.keys(S.students).length-p-a);
  $('sM').textContent=t('m.scheduled')+' '+mc;
}
function renderStation(){
  const e=Object.entries(S.stations),sel=$('stSel');
  sel.innerHTML='<option value="">— '+esc(t('c.selectStation'))+' —</option>'+e.map(([k,v])=>'<option value="'+esc(k)+'">'+esc(v.name)+' ('+esc(v.token)+')</option>').join('');
  sel.value=S.station||'';
  $('stChips').innerHTML=e.map(([k,v])=>'<button class="btn '+(k===S.station?'':'ghost')+' sm" data-k="'+esc(k)+'"><span class="dot'+(online(v)?' on':'')+'"></span>'+esc(v.name)+'<span class="mono" style="opacity:.7">'+esc(v.token)+'</span><span class="mono">'+qCount(k)+'</span></button>').join('')||'<span class="muted">'+esc(t('rm.noStations'))+'</span>';
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
function attachAtt(day){
  if(S.attRef)S.attRef.off();
  S.attDay=day;S.att={};$('dayChip').textContent=day;
  S.attRef=db().ref('parents/attendance/'+day);
  S.attRef.on('value',s=>{S.att=s.val()||{};safe(renderStats,'stats');safe(doSearch,'search');},werr);
}
async function markAtt(k,status,by){
  const s=S.students[k];if(!s)return;
  await db().ref('parents/attendance/'+S.attDay+'/'+k).set({status,time:Date.now(),by:by||'remote',studentId:String(s.studentId||''),cls:s.cls||'',classNo:s.classNo||'',nameEn:s.nameEn||'',nameZh:s.nameZh||'',cardId:s.cardId||''});
}
function doSearch(){
  const q=$('q').value.trim();
  if(!q){$('res').innerHTML='<p class="muted" style="margin-top:10px">'+esc(t('c.typeSearch'))+'</p>';return;}
  const hits=Object.entries(S.students).filter(([k,s])=>LL.searchMatch(s,q)).slice(0,30);
  $('res').innerHTML=hits.map(([k,s])=>'<div class="stu-card"><div class="stu-head"><span class="stu-name">'+esc(s.nameEn||s.nameZh)+'</span><span class="stu-sub">'+esc(s.nameZh||'')+'</span><span class="stu-sub">'+esc(t('sd.sid'))+' '+esc(s.studentId||'—')+' · '+esc(s.cls||'')+' '+esc(s.classNo||'')+'</span>'+attBadge(S.att[k])+'</div>'+meetHtml(s)+'<div class="act-row"><button class="btn lg" data-act="print" data-k="'+esc(k)+'">'+esc(t('rm.presentPrint'))+'</button><button class="btn lg ok" data-act="pres" data-k="'+esc(k)+'">'+esc(t('rm.presentOnly'))+'</button><button class="btn lg bad" data-act="abs" data-k="'+esc(k)+'">'+esc(t('rm.absentOnly'))+'</button></div></div>').join('')||'<p class="muted" style="margin-top:10px">'+esc(t('c.noMatch'))+'</p>';
}
function wire(){
  $('stBtn').onclick=()=>{renderStation();$('stModal').classList.add('on');};
  $('stClose').onclick=()=>$('stModal').classList.remove('on');
  $('stSel').onchange=function(){pickStation(this.value||null);};
  $('stChips').onclick=e=>{const b=e.target.closest('button[data-k]');if(b)pickStation(b.dataset.k);};
  $('stModal').addEventListener('click',e=>{if(e.target===$('stModal'))$('stModal').classList.remove('on');});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!Verify.open())$('stModal').classList.remove('on');});
  $('q').addEventListener('input',()=>safe(doSearch,'search'));
  $('res').onclick=async e=>{
    const b=e.target.closest('button[data-act]');if(!b||!needApproved())return;
    const k=b.dataset.k,s=S.students[k];if(!s)return;
    const a=b.dataset.act;
    if(!await Verify.ask(s)){toast(t('vf.cancelled'));sess((s.nameEn||s.nameZh)+' — '+t('vf.cancel'));return;}
    const who=s.nameEn||s.nameZh;
    if(a==='print'){
      if(S.busy)return;S.busy=true;b.disabled=true;
      try{
        await markAtt(k,'present','remote-v');
        if(S.station&&S.stations[S.station]){
          await db().ref('parents/queues/'+S.station).push(Object.assign({type:'label',studentId:String(s.studentId||''),cls:s.cls||'',classNo:s.classNo||'',nameEn:s.nameEn||'',nameZh:s.nameZh||'',cardId:s.cardId||''},meetOf(s),{copies:1,createdAt:Date.now(),done:false}));
          toast(t('vf.verifiedToast')+' · '+t('rm.sentTo')+' '+S.stations[S.station].name);
          sess(who+' '+t('rm.sPrint')+' → '+S.stations[S.station].name+(LL.meetLine(s)?' · '+LL.meetLine(s):'')+' '+t('vf.logVerified'));
        }else{toast(t('vf.verifiedToast')+' · '+t('rm.noPrint'));sess(who+' '+t('rm.sNoPrint')+' '+t('vf.logVerified'));}
      }catch(x){werr(x);}finally{S.busy=false;b.disabled=false;}
    }else{
      try{await markAtt(k,a==='pres'?'present':'absent','remote-v');
        toast(t('vf.verifiedToast')+' · '+(a==='pres'?t('rm.markedPresent'):t('rm.markedAbsent'))+' '+who);
        sess(who+' '+t(a==='pres'?'rm.sPresent':'rm.sAbsent')+' '+t('vf.logVerified'));
      }catch(x){werr(x);}
    }
  };
  document.addEventListener('langchange',()=>{I18N.apply();Verify.paint();renderStats();renderStation();doSearch();});
  setInterval(()=>safe(renderStation,'station'),15000);
}
I18N.apply();I18N.mountToggle();
renderStats();renderStation();doSearch();
wire();
Verify.banner('q');
Auth.start(function(){
  attachAtt(S.attDay);
  setInterval(()=>{const d=dayKey();if(d!==S.attDay){attachAtt(d);toast(t('rm.newDay')+' '+d);}},30000);
  db().ref('parents/stations').on('value',s=>{S.stations=s.val()||{};if(S.station&&!S.stations[S.station]){S.station=null;localStorage.removeItem(LS);}renderStation();},werr);
  db().ref('parents/queues').on('value',s=>{S.queues=s.val()||{};renderStation();},werr);
  db().ref('parents/students').on('value',s=>{S.students=s.val()||{};renderStats();doSearch();},werr);
});
})();
