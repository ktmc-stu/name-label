/* js/printer.js — station binding, no-cooldown printing, attendance, label settings,
   and Quick Enrol: create a student at the desk when no record (or no card) exists,
   then mark attendance and print in one action. */
(function(){
const LS='plPrinterToken',LSP='plPrinterSpeed';
const DEF_SPEED={mode:'fast',settle:70,copies:1,dupe:1200,sound:true};
const S={stationKey:null,station:null,started:false,layout:LL.norm(null),students:{},byCard:{},att:{},attDay:'',attRef:null,busy:false,
 pipe:[],piping:false,seen:{},printed:0,recent:[],lastCard:{},buf:'',bufAt:0,connected:false,speed:loadSpeed(),scanTimer:null,attWarned:false,audio:null,
 dir:{teachers:{},rooms:{}},dirRef:null,enrolled:0};
const $=id=>document.getElementById(id);
const t=(k,v)=>I18N.t(k,v);
const esc=LL.esc;
const db=()=>Auth.db;
const dayKey=(d=new Date())=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
S.attDay=dayKey();
const fmtT=ts=>ts?new Date(ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'—';
const fmtS=ts=>ts?new Date(ts).toLocaleTimeString('en-GB'):'—';
const normCard=v=>String(v==null?'':v).trim().replace(/^0+/,'').toUpperCase();
const normSid=v=>String(v==null?'':v).trim().toUpperCase().replace(/\s/g,'');
const sidKey=v=>normSid(v).replace(/[.#$/\[\]]/g,'-');
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const meetOf=s=>({meetTime:String(s.meetTime||''),meetTeacher:String(s.meetTeacher||''),meetRoom:String(s.meetRoom||'')});
const meetHtml=s=>{const m=LL.meetLine(s);return m?'<div class="mline"><b>'+esc(t('m.label'))+'</b> '+esc(m)+'</div>':'';};
const SC={ready:['#e5f0fc','#084c9e'],ok:['#e4f4ec','#16794b'],err:['#fbeaea','#bf3a3a'],dup:['#fbf2dd','#8f6410']};
const setScan=(el,k)=>{el.style.background=SC[k][0];el.style.color=SC[k][1];};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const raf2=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
let toastTimer=null;
function toast(m){const e=$('toast');if(!e)return;e.textContent=m;e.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('on'),3000);}
function log(m){const d=document.createElement('div');d.textContent='['+new Date().toLocaleTimeString()+'] '+m;$('log').prepend(d);while($('log').children.length>500)$('log').lastChild.remove();}
const needApproved=()=>{if(!Auth.isApproved()){toast(t('pr.needApproved'));return false;}return true;};
const needAdmin=()=>{if(!Auth.isAdmin()){toast(t('pr.needAdminSave'));return false;}return true;};
const werr=e=>{const c=(e&&e.code)||'';toast(/PERMISSION_DENIED/i.test(c+e)?t('c.denied'):t('c.fail')+': '+(e&&e.message||e));};
function safe(fn,l){try{return fn();}catch(e){console.error(l,e);}}
function loadSpeed(){
  try{const raw=JSON.parse(localStorage.getItem(LSP)||'null');
    if(!raw||typeof raw!=='object')return Object.assign({},DEF_SPEED);
    return {mode:raw.mode==='safe'?'safe':'fast',settle:clamp(parseInt(raw.settle,10)||0,0,2000),copies:clamp(parseInt(raw.copies,10)||1,1,10),dupe:clamp(parseInt(raw.dupe,10)||0,0,5000),sound:raw.sound!==false};
  }catch(e){return Object.assign({},DEF_SPEED);}
}
function saveSpeed(){try{localStorage.setItem(LSP,JSON.stringify(S.speed));}catch(e){}}
function beep(kind){
  if(!S.speed.sound)return;
  try{
    if(!S.audio){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;S.audio=new AC();}
    if(S.audio.state==='suspended')S.audio.resume();
    const o=S.audio.createOscillator(),g=S.audio.createGain(),n=S.audio.currentTime;
    o.type='sine';o.frequency.value=kind==='err'?230:kind==='dup'?520:kind==='new'?1180:900;
    g.gain.setValueAtTime(.0001,n);g.gain.exponentialRampToValueAtTime(.16,n+.01);
    g.gain.exponentialRampToValueAtTime(.0001,n+(kind==='err'?.20:.09));
    o.connect(g);g.connect(S.audio.destination);o.start(n);o.stop(n+(kind==='err'?.22:.11));
  }catch(e){}
}

/* ================= parent verification (manual search only) ================= */
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
.vf-banner{display:flex;gap:10px;align-items:flex-start;background:var(--wns,#fbf2dd);border:1px solid var(--wnl,#e8d6a8);color:var(--wn,#8f6410);border-radius:10px;padding:12px 14px;font-size:13px;line-height:1.65;margin-top:10px;width:100%}
.vf-banner svg{width:17px;height:17px;flex:none;margin-top:2px}
.sp-recent{margin-top:12px;border-top:1px solid var(--line,#dae6f4);padding-top:10px}
.sp-recent h4{font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--faint,#8ba1bd);margin:0 0 8px}
.sp-line{display:flex;gap:10px;align-items:baseline;font-size:13px;padding:4px 0;border-bottom:1px solid var(--hair,#e9f1fa)}
.sp-line:last-child{border-bottom:0}
.sp-line .tm{font:11.5px var(--mono,monospace);color:var(--faint,#8ba1bd);flex:none}
.sp-line .nm{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sp-line .mt{font-size:12px;color:var(--muted,#5a7391);margin-left:auto;text-align:right;flex:none;max-width:50%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
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
  const host=document.getElementById(afterId);if(!host)return;
  mount();
  const anchor=host.closest('.row')||host;
  const parent=anchor.parentNode;if(!parent)return;
  const d=document.createElement('div');d.className='vf-banner';d.innerHTML=ICON+'<span></span>';
  parent.insertBefore(d,anchor.nextSibling);banners.push(d);paint();
}
function paint(){banners.forEach(b=>{const s=b.querySelector('span');if(s)s.textContent=t('vf.banner');});labels();}
const open=()=>!!el&&el.classList.contains('on');
return {ask,banner,paint,open,mount};
})();

/* ================= quick enrol ================= */
const Enrol=(function(){
const CSS=`
.qe-scrim{position:fixed;inset:0;z-index:1600;background:rgba(15,35,64,.55);display:none;align-items:flex-start;justify-content:center;padding:18px;overflow:auto}
.qe-scrim.on{display:flex}
.qe-modal{width:min(1000px,100%);margin:auto;background:var(--surface,#fff);border:1px solid var(--line,#dae6f4);border-radius:16px;box-shadow:0 30px 80px rgba(15,35,64,.34);overflow:hidden;animation:qeIn .22s cubic-bezier(.25,.6,.3,1) both}
@keyframes qeIn{from{opacity:0;transform:translateY(12px) scale(.99)}to{opacity:1;transform:none}}
.qe-head{display:flex;gap:12px;align-items:flex-start;padding:18px 22px;border-bottom:1px solid var(--line,#dae6f4);background:linear-gradient(180deg,#fbfdff,#eff6fd)}
.qe-head h3{font-size:19px;margin:2px 0 3px;font-weight:600}
.qe-head p{margin:0;font-size:12.8px;color:var(--muted,#5a7391);max-width:640px;line-height:1.55}
.qe-head .x{margin-left:auto;flex:none}
.qe-body{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr)}
.qe-form{padding:18px 22px;min-width:0}
.qe-side{padding:18px 22px;border-left:1px solid var(--line,#dae6f4);background:var(--panel,#f6faff);min-width:0}
.qe-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(138px,1fr));gap:11px}
.qe-f{display:grid;gap:4px;min-width:0}
.qe-f.wide{grid-column:1/-1}
.qe-f label{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--faint,#8ba1bd)}
.qe-f input,.qe-f select{min-height:44px;font-size:15px}
.qe-f.big input{font-size:21px;min-height:54px;font-weight:600}
.qe-inline{display:flex;gap:6px}
.qe-inline select{flex:1 1 auto;min-width:0}
.qe-inline .btn{flex:none}
.qe-newrow{display:none;gap:6px;margin-top:6px}
.qe-newrow.on{display:flex}
.qe-newrow input{flex:1 1 auto;min-width:0;min-height:38px;font-size:14px}
.qe-chip{display:inline-flex;align-items:center;gap:6px;font:11px var(--mono,monospace);border-radius:999px;padding:3px 10px;border:1px solid var(--line2,#bed3e9);background:var(--surface,#fff);color:var(--muted,#5a7391)}
.qe-chip.temp{background:var(--wns,#fbf2dd);border-color:var(--wnl,#e8d6a8);color:var(--wn,#8f6410)}
.qe-chip.real{background:var(--greens,#e2f3ea);border-color:var(--greenl,#b9dfcb);color:var(--ok,#15734a)}
.qe-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:9px}
.qe-warn{display:none;gap:9px;align-items:flex-start;margin-top:12px;background:var(--wns,#fbf2dd);border:1px solid var(--wnl,#e8d6a8);color:var(--wn,#8f6410);border-radius:10px;padding:11px 13px;font-size:13px;line-height:1.6}
.qe-warn.on{display:flex}
.qe-warn .btn{margin-top:7px}
.qe-err{display:none;margin-top:12px;background:var(--bds,#fce9e9);border:1px solid var(--redl,#efc0c0);color:var(--red,#c03434);border-radius:10px;padding:11px 13px;font-size:13px;line-height:1.6}
.qe-err.on{display:block}
.qe-err .row{margin-top:9px}
.qe-sec{margin-top:14px;border-top:1px solid var(--line,#dae6f4);padding-top:12px}
.qe-toggle{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;color:var(--ink2,#25405f);cursor:pointer}
.qe-toggle .car{margin-left:auto;transition:transform .18s;font-size:11px;color:var(--faint,#8ba1bd)}
.qe-toggle.open .car{transform:rotate(90deg)}
.qe-meet{display:none;margin-top:11px}
.qe-meet.on{display:block}
.qe-opts{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:14px}
.qe-check{display:inline-flex;align-items:center;gap:7px;font-size:13.5px;color:var(--ink2,#25405f);cursor:pointer}
.qe-check input{width:17px;height:17px;min-height:0;flex:none;accent-color:var(--blue,#0a5fd0)}
.qe-step{display:inline-flex;align-items:center;gap:6px}
.qe-step .btn{min-width:34px;padding:6px 0}
.qe-step .v{font:600 15px var(--mono,monospace);min-width:26px;text-align:center}
.qe-foot{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:14px 22px;border-top:1px solid var(--line,#dae6f4);background:var(--surface,#fff)}
.qe-foot .hint{font:11.5px var(--mono,monospace);color:var(--faint,#8ba1bd)}
.qe-foot .grow{flex:1}
.qe-foot .btn{min-height:46px}
.qe-proof{background:#fff;border:1px solid var(--line2,#bed3e9);border-radius:8px;box-shadow:0 3px 14px rgba(15,35,64,.10);position:relative;overflow:hidden;margin:0 auto}
.qe-proofwrap{padding:12px;background:
  repeating-linear-gradient(0deg,transparent,transparent 15px,rgba(15,35,64,.045) 15px,rgba(15,35,64,.045) 16px),
  repeating-linear-gradient(90deg,transparent,transparent 15px,rgba(15,35,64,.045) 15px,rgba(15,35,64,.045) 16px),#f2f7fd;
  border:1px solid var(--line,#dae6f4);border-radius:10px;overflow:auto}
.qe-side h4{font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--faint,#8ba1bd);margin:0 0 9px}
.qe-side .note{font-size:12px;color:var(--muted,#5a7391);margin-top:10px;line-height:1.6}
.qe-sum{display:grid;gap:6px;margin-top:12px}
.qe-sum div{display:flex;gap:10px;justify-content:space-between;font-size:12.5px;color:var(--ink2,#25405f);border-bottom:1px dashed var(--line,#dae6f4);padding-bottom:5px}
.qe-sum div:last-child{border-bottom:0}
.qe-sum b{font-weight:600;text-align:right;word-break:break-word}
.qe-list{margin-top:12px;border-top:1px solid var(--line,#dae6f4);padding-top:10px}
.qe-list h4{font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--faint,#8ba1bd);margin:0 0 8px;display:flex;gap:8px;align-items:center}
.qe-list h4 .n{margin-left:auto;font:11px var(--mono,monospace);color:var(--muted,#5a7391)}
.qe-row{display:flex;gap:9px;align-items:center;padding:6px 0;border-bottom:1px solid var(--hair,#e9f1fa);font-size:13px}
.qe-row:last-child{border-bottom:0}
.qe-row .nm{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qe-row .id{font:11px var(--mono,monospace);color:var(--muted,#5a7391);flex:none}
.qe-row .st{font:10.5px var(--mono,monospace);border-radius:999px;padding:1px 7px;flex:none;border:1px solid var(--greenl,#b9dfcb);background:var(--greens,#e2f3ea);color:var(--ok,#15734a)}
.qe-row .st.no{border-color:var(--redl,#efc0c0);background:var(--bds,#fce9e9);color:var(--red,#c03434)}
.qe-row .act{margin-left:auto;display:flex;gap:6px;flex:none}
.qe-empty{font-size:12.5px;color:var(--faint,#8ba1bd);padding:6px 0}
.qe-launch{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px}
@media(max-width:860px){.qe-body{grid-template-columns:1fr}.qe-side{border-left:0;border-top:1px solid var(--line,#dae6f4)}}
`;
let el=null,busy=false,dupKey=null,unsaved=null,recent=[];
const F=['qeNameZh','qeNameEn','qeCls','qeNo','qeSid','qeCard','qeTime','qeTeacher','qeRoom'];
const tempId=()=>'TMP-'+Date.now().toString(36).toUpperCase().slice(-6)+'-'+Math.random().toString(36).toUpperCase().slice(2,4);
function mount(){
  if(el)return;
  const st=document.createElement('style');st.id='qeCss';st.textContent=CSS;document.head.appendChild(st);
  el=document.createElement('div');el.className='qe-scrim';el.id='qeModal';el.setAttribute('aria-hidden','true');
  el.innerHTML='<div class="qe-modal" role="dialog" aria-modal="true" aria-labelledby="qeTitle">'
  +'<div class="qe-head"><div><span class="eyebrow" data-i18n="qe.title"></span><h3 id="qeTitle" data-i18n="qe.title"></h3><p id="qeSub" data-i18n="qe.sub"></p></div>'
  +'<button class="btn ghost sm x" id="qeX" type="button" data-i18n="qe.close"></button></div>'
  +'<div class="qe-body"><div class="qe-form">'
  +'<div class="qe-grid">'
  +'<div class="qe-f big wide"><label data-i18n="qe.nameZh"></label><input id="qeNameZh" autocomplete="off" spellcheck="false"></div>'
  +'<div class="qe-f wide"><label data-i18n="qe.nameEn"></label><input id="qeNameEn" autocomplete="off" spellcheck="false"></div>'
  +'<div class="qe-f"><label data-i18n="qe.cls"></label><input id="qeCls" autocomplete="off" placeholder="1E" style="text-transform:uppercase"></div>'
  +'<div class="qe-f"><label data-i18n="qe.no"></label><input id="qeNo" autocomplete="off" inputmode="numeric" placeholder="35"></div>'
  +'<div class="qe-f"><label data-i18n="qe.sid"></label><input id="qeSid" autocomplete="off" spellcheck="false"></div>'
  +'<div class="qe-f"><label data-i18n="qe.card"></label><input id="qeCard" autocomplete="off" spellcheck="false"></div>'
  +'</div>'
  +'<div class="qe-meta"><span class="qe-chip" id="qeIdChip"></span><span class="qe-chip" id="qeCardChip"></span></div>'
  +'<p class="qe-f" style="margin-top:8px"><span style="font-size:12px;color:var(--muted,#5a7391);line-height:1.6" data-i18n="qe.tempHint"></span></p>'
  +'<div class="qe-warn" id="qeWarn"><div><div id="qeWarnTxt"></div><button class="btn warn sm" id="qeUse" type="button" data-i18n="qe.useExisting"></button></div></div>'
  +'<div class="qe-err" id="qeErr"><div id="qeErrTxt"></div><div class="row"><button class="btn bad sm" id="qeRetry" type="button" data-i18n="c.retry"></button><button class="btn ghost sm" id="qePrintOnly" type="button" data-i18n="qe.printOnly"></button></div></div>'
  +'<div class="qe-sec"><button class="qe-toggle" id="qeMeetTog" type="button"><span data-i18n="qe.meetingToggle"></span><span class="car">▶</span></button>'
  +'<div class="qe-meet" id="qeMeet"><div class="qe-grid">'
  +'<div class="qe-f wide"><label data-i18n="qe.time"></label><input id="qeTime" autocomplete="off" placeholder="15:30–15:45"></div>'
  +'<div class="qe-f wide"><label data-i18n="qe.teacher"></label><div class="qe-inline"><select id="qeTeacher"></select><button class="btn ghost sm" id="qeAddT" type="button" data-i18n="qe.newEntry"></button></div>'
  +'<div class="qe-newrow" id="qeNewTRow"><input id="qeNewT" data-ph="dir.newTeacher"><button class="btn sm" id="qeSaveT" type="button" data-i18n="dir.add"></button></div></div>'
  +'<div class="qe-f wide"><label data-i18n="qe.room"></label><div class="qe-inline"><select id="qeRoom"></select><button class="btn ghost sm" id="qeAddR" type="button" data-i18n="qe.newEntry"></button></div>'
  +'<div class="qe-newrow" id="qeNewRRow"><input id="qeNewR" data-ph="dir.newRoom"><button class="btn sm" id="qeSaveR" type="button" data-i18n="dir.add"></button></div></div>'
  +'</div></div></div>'
  +'<div class="qe-opts"><label class="qe-check"><input type="checkbox" id="qePresent" checked><span data-i18n="qe.markPresent"></span></label>'
  +'<span class="qe-step"><span style="font-size:12.5px;color:var(--muted,#5a7391)" data-i18n="qe.copies"></span>'
  +'<button class="btn ghost sm" id="qeMinus" type="button">−</button><span class="v" id="qeCopies">1</span><button class="btn ghost sm" id="qePlus" type="button">+</button></span></div>'
  +'</div>'
  +'<div class="qe-side"><h4 data-i18n="qe.preview"></h4><div class="qe-proofwrap"><div class="qe-proof" id="qeProof"></div></div>'
  +'<p class="note" data-i18n="qe.previewNote"></p><div class="qe-sum" id="qeSum"></div></div></div>'
  +'<div class="qe-foot"><span class="hint" data-i18n="qe.enterHint"></span><span class="grow"></span>'
  +'<button class="btn ghost" id="qeOnly" type="button" data-i18n="qe.createOnly"></button>'
  +'<button class="btn" id="qeGo" type="button" data-i18n="qe.create"></button></div>'
  +'</div>';
  document.body.appendChild(el);
  I18N.apply(el);
  el.addEventListener('click',e=>{if(e.target===el)close();});
  $('qeX').onclick=close;
  $('qeGo').onclick=()=>submit(true);
  $('qeOnly').onclick=()=>submit(false);
  $('qeRetry').onclick=()=>submit(!$('qeOnly').disabled);
  $('qePrintOnly').onclick=printUnsaved;
  $('qeUse').onclick=useExisting;
  $('qeMeetTog').onclick=()=>{
    const on=$('qeMeet').classList.toggle('on');
    $('qeMeetTog').classList.toggle('open',on);
    if(on)setTimeout(()=>$('qeTime').focus(),20);
  };
  $('qeMinus').onclick=()=>{copies=clamp(copies-1,1,10);$('qeCopies').textContent=copies;};
  $('qePlus').onclick=()=>{copies=clamp(copies+1,1,10);$('qeCopies').textContent=copies;};
  $('qeAddT').onclick=()=>{$('qeNewTRow').classList.toggle('on');const i=$('qeNewT');if($('qeNewTRow').classList.contains('on'))i.focus();};
  $('qeAddR').onclick=()=>{$('qeNewRRow').classList.toggle('on');const i=$('qeNewR');if($('qeNewRRow').classList.contains('on'))i.focus();};
  $('qeSaveT').onclick=()=>addDir('teachers');
  $('qeSaveR').onclick=()=>addDir('rooms');
  $('qeNewT').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();addDir('teachers');}});
  $('qeNewR').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();addDir('rooms');}});
  F.forEach(id=>{
    const n=$(id);if(!n)return;
    const h=()=>{refresh();};
    n.addEventListener('input',h);n.addEventListener('change',h);
  });
  el.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
    if(e.key==='Enter'&&!/TEXTAREA/.test(e.target.tagName)&&!e.target.closest('.qe-newrow')){
      e.preventDefault();e.stopPropagation();submit(true);
    }
  },true);
  addEventListener('resize',()=>{if(isOpen())safe(preview,'qePreview');});
}
let copies=1;
const val=id=>{const n=$(id);return n?String(n.value||'').trim():'';};
function record(){
  const sid=normSid(val('qeSid'));
  return {studentId:sid||tempPreviewId,cardId:normCard(val('qeCard')),cls:val('qeCls').toUpperCase(),classNo:val('qeNo'),
    nameEn:val('qeNameEn'),nameZh:val('qeNameZh'),meetTime:val('qeTime'),meetTeacher:val('qeTeacher'),meetRoom:val('qeRoom')};
}
let tempPreviewId=tempId();
function dirNames(kind){return Object.values(S.dir[kind]||{}).map(x=>String((x&&x.name)||'').trim()).filter(Boolean).sort((a,b)=>a.localeCompare(b,'zh-Hant-HK'));}
function observed(kind){
  const f=kind==='teachers'?'meetTeacher':'meetRoom',set={};
  Object.values(S.students).forEach(s=>{const v=String(s[f]||'').trim();if(v)set[v]=1;});
  return Object.keys(set).sort((a,b)=>a.localeCompare(b,'zh-Hant-HK'));
}
function fillPick(id,kind){
  const n=$(id);if(!n)return;
  const cur=n.value,list=dirNames(kind),have=list.map(x=>x.toLowerCase());
  const extra=observed(kind).filter(x=>have.indexOf(x.toLowerCase())<0);
  let h='<option value="">'+esc(t('dir.pick'))+'</option>';
  if(list.length)h+='<optgroup label="'+esc(t('dir.groupList'))+'">'+list.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('')+'</optgroup>';
  if(extra.length)h+='<optgroup label="'+esc(t('dir.groupData'))+'">'+extra.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('')+'</optgroup>';
  n.innerHTML=h;
  if(cur&&list.concat(extra).indexOf(cur)>=0)n.value=cur;
}
function fillPicks(){fillPick('qeTeacher','teachers');fillPick('qeRoom','rooms');}
async function addDir(kind){
  if(!needApproved())return;
  const T=kind==='teachers';
  const inp=$(T?'qeNewT':'qeNewR'),name=String(inp.value||'').trim();
  if(!name)return toast(t('dir.needName'));
  if(dirNames(kind).some(x=>x.toLowerCase()===name.toLowerCase())){
    $(T?'qeTeacher':'qeRoom').value=name;inp.value='';$(T?'qeNewTRow':'qeNewRRow').classList.remove('on');refresh();return;
  }
  try{
    await db().ref('parents/directory/'+kind).push({name:name,createdAt:Date.now()});
    if(!S.dir[kind])S.dir[kind]={};
    S.dir[kind]['local'+Date.now()]={name:name};
    fillPicks();$(T?'qeTeacher':'qeRoom').value=name;
    inp.value='';$(T?'qeNewTRow':'qeNewRRow').classList.remove('on');
    toast(t('qe.added'));refresh();
  }catch(e){werr(e);}
}
function preview(){
  const host=$('qeProof');if(!host)return;
  const wrap=host.parentNode;
  const avail=Math.max(180,(wrap.clientWidth||300)-26);
  const z=clamp(avail/(LL.MM*LL.eff(S.layout).w),.9,2.6);
  const e=LL.eff(S.layout),ppm=LL.MM*z;
  host.style.width=(e.w*ppm)+'px';host.style.height=(e.h*ppm)+'px';
  const d=record();
  host.innerHTML=LL.stageHTML(S.layout,d,false).replace('class="stage"','class="stage" style="transform:scale('+z+');transform-origin:0 0;left:0;top:0"');
}
function summary(){
  const d=record(),box=$('qeSum');if(!box)return;
  const rows=[[t('qe.nameZh'),d.nameZh||'—'],[t('qe.nameEn'),d.nameEn||'—'],[t('qe.cls')+' / '+t('qe.no'),(d.cls||'—')+' '+(d.classNo||'')],
    [t('sd.sid'),d.studentId],[t('qe.card'),d.cardId||t('qe.noCard')],[t('m.label'),LL.meetLine(d)||t('m.none')]];
  box.innerHTML=rows.map(r=>'<div><span>'+esc(r[0])+'</span><b>'+esc(r[1])+'</b></div>').join('');
}
function findDup(d){
  if(d.cardId){
    const k=Object.keys(S.students).find(k=>normCard(S.students[k].cardId)===d.cardId);
    if(k)return {key:k,s:S.students[k],why:'card'};
  }
  const sid=normSid(val('qeSid'));
  if(sid){
    const k=Object.keys(S.students).find(k=>normSid(S.students[k].studentId)===sid);
    if(k)return {key:k,s:S.students[k],why:'sid'};
  }
  return null;
}
function refresh(){
  const d=record();
  const chip=$('qeIdChip');
  if(chip){
    const real=!!normSid(val('qeSid'));
    chip.className='qe-chip '+(real?'real':'temp');
    chip.textContent=(real?t('qe.real'):t('qe.temp'))+' · '+d.studentId;
  }
  const cc=$('qeCardChip');
  if(cc)cc.textContent=d.cardId?(t('qe.card')+' · '+d.cardId):t('qe.noCard');
  const dup=findDup(d);dupKey=dup?dup.key:null;
  const w=$('qeWarn');
  if(w){
    if(dup){
      const s=dup.s;
      $('qeWarnTxt').textContent=t(dup.why==='card'?'qe.dupCard':'qe.dupSid',{name:s.nameZh||s.nameEn||'—',cls:s.cls||'—',no:s.classNo||'—'});
      w.classList.add('on');
    }else w.classList.remove('on');
  }
  safe(preview,'qePreview');safe(summary,'qeSummary');
}
function open(prefill){
  if(!needApproved())return;
  if(!S.stationKey){toast(t('qe.needBind'));return;}
  mount();
  busy=false;dupKey=null;unsaved=null;copies=clamp(S.speed.copies||1,1,10);
  tempPreviewId=tempId();
  F.forEach(id=>{const n=$(id);if(n)n.value='';});
  $('qeCard').value=normCard((prefill&&prefill.cardId)||'');
  $('qePresent').checked=true;
  $('qeCopies').textContent=copies;
  $('qeErr').classList.remove('on');$('qeWarn').classList.remove('on');
  $('qeNewTRow').classList.remove('on');$('qeNewRRow').classList.remove('on');
  $('qeMeet').classList.remove('on');$('qeMeetTog').classList.remove('open');
  ['qeGo','qeOnly','qeRetry','qePrintOnly'].forEach(id=>{const n=$(id);if(n)n.disabled=false;});
  $('qeSub').textContent=(prefill&&prefill.cardId)?t('qe.fromScan',{card:normCard(prefill.cardId)}):t('qe.sub');
  fillPicks();I18N.apply(el);refresh();
  el.classList.add('on');el.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
  showTab('operate');
  setTimeout(()=>{const n=$('qeNameZh');if(n)n.focus();},50);
}
function close(){
  if(busy)return;
  if(el){el.classList.remove('on');el.setAttribute('aria-hidden','true');}
  document.body.style.overflow='';
}
const isOpen=()=>!!el&&el.classList.contains('on');
function setBusy(b){
  busy=b;
  ['qeGo','qeOnly','qeRetry','qePrintOnly','qeX'].forEach(id=>{const n=$(id);if(n)n.disabled=b;});
}
function fail(msg){
  $('qeErrTxt').textContent=msg;
  $('qeErr').classList.add('on');
  beep('err');
}
async function useExisting(){
  if(!dupKey)return;
  const s=S.students[dupKey];if(!s)return;
  close();
  await finish(dupKey,s,{print:true,present:$('qePresent').checked,copies:copies,existing:true});
}
async function submit(doPrint){
  if(busy)return;
  if(!needApproved())return;
  const d=record();
  if(!d.nameZh&&!d.nameEn){fail(t('qe.needName'));const n=$('qeNameZh');if(n)n.focus();return;}
  if(dupKey){fail(t('qe.dupCard',{name:(S.students[dupKey].nameZh||S.students[dupKey].nameEn||'—'),cls:S.students[dupKey].cls||'—',no:S.students[dupKey].classNo||'—'}));return;}
  $('qeErr').classList.remove('on');
  setBusy(true);
  const real=!!normSid(val('qeSid'));
  const key=real?sidKey(d.studentId):null;
  const rec=Object.assign({},d,{updatedAt:Date.now(),updatedBy:(Auth.user()&&Auth.user().email)||'printer'});
  try{
    let k;
    if(key&&!S.students[key]){await db().ref('parents/students/'+key).set(rec);k=key;}
    else{const r=await db().ref('parents/students').push(rec);k=r.key;}
    S.students[k]=rec;
    if(rec.cardId)S.byCard[normCard(rec.cardId)]=k;
    try{
      if(rec.meetTeacher)await ensureDir('teachers',rec.meetTeacher);
      if(rec.meetRoom)await ensureDir('rooms',rec.meetRoom);
    }catch(e){}
    setBusy(false);close();
    await finish(k,rec,{print:doPrint,present:$('qePresent').checked,copies:copies,existing:false});
  }catch(e){
    setBusy(false);
    unsaved={rec:rec,key:key};
    fail(t('qe.failed')+': '+((e&&e.code)||e.message||e));
  }
}
async function printUnsaved(){
  if(!unsaved)return;
  const rec=unsaved.rec;
  close();
  pushRecent({key:null,rec:rec,saved:false});
  enqueue({local:true,data:rec,copies:copies});
  beep('new');
  toast(t('qe.printedUnsaved'));
  log(t('qe.printedUnsaved')+' '+(rec.nameZh||rec.nameEn));
  unsaved=null;
}
async function ensureDir(kind,name){
  const n=String(name||'').trim();if(!n)return;
  if(dirNames(kind).some(x=>x.toLowerCase()===n.toLowerCase()))return;
  await db().ref('parents/directory/'+kind).push({name:n,createdAt:Date.now()});
}
async function finish(key,rec,opt){
  if(opt.present){try{await markAtt(key,'present','scan');}catch(e){werr(e);}}
  if(opt.print){enqueue({local:true,data:rec,copies:opt.copies||1});}
  if(!opt.existing){S.enrolled++;pushRecent({key:key,rec:rec,saved:true});}
  beep('new');
  const name=rec.nameZh||rec.nameEn||'—';
  toast(t(opt.print?'qe.created':'qe.createdOnly',{name:name}));
  log((opt.existing?'↺ ':'+ ')+name+' ['+(rec.studentId||'—')+']'+(opt.print?' → '+t('c.print'):''));
  const box=$('scan');
  if(box){
    setScan(box,'ok');
    box.innerHTML=esc(name)+'<small>'+esc(t('sd.sid'))+' '+esc(rec.studentId||'—')+' · '+esc(rec.cls||'')+' '+esc(rec.classNo||'')+(LL.meetLine(rec)?' · '+esc(LL.meetLine(rec)):'')+'</small><small>'+esc(t(opt.existing?'op.markedPresent':'qe.created',{name:name}))+'</small>';
    scanLater(2600);
  }
  safe(renderAttStats,'att');safe(doSearch,'search');safe(renderRecentEnrol,'recentEnrol');
}
function pushRecent(e){recent.unshift(Object.assign({ts:Date.now()},e));if(recent.length>6)recent.length=6;renderRecentEnrol();}
function renderRecentEnrol(){
  const box=$('qeList');if(!box)return;
  const head='<h4><span>'+esc(t('qe.recent'))+'</span><span class="n">'+esc(t('qe.count',{n:S.enrolled}))+'</span></h4>';
  if(!recent.length){box.innerHTML=head+'<div class="qe-empty">'+esc(t('qe.none'))+'</div>';return;}
  box.innerHTML=head+recent.map((e,i)=>{
    const r=e.rec;
    return '<div class="qe-row"><span class="nm">'+esc(r.nameZh||r.nameEn||'—')+'</span>'+
      '<span class="id">'+esc(r.studentId||'—')+'</span>'+
      '<span class="st'+(e.saved?'':' no')+'">'+esc(t(e.saved?'qe.saved':'qe.unsaved'))+'</span>'+
      '<span class="act">'+(e.saved?'':'<button class="btn ghost mini" data-act="save" data-i="'+i+'">'+esc(t('qe.retry'))+'</button>')+
      '<button class="btn gray mini" data-act="print" data-i="'+i+'">'+esc(t('qe.reprint'))+'</button></span></div>';
  }).join('');
}
async function retrySave(i){
  const e=recent[i];if(!e||e.saved)return;
  try{
    const key=e.rec.studentId&&!/^TMP-/.test(e.rec.studentId)?sidKey(e.rec.studentId):null;
    let k;
    if(key&&!S.students[key]){await db().ref('parents/students/'+key).set(e.rec);k=key;}
    else{const r=await db().ref('parents/students').push(e.rec);k=r.key;}
    S.students[k]=e.rec;if(e.rec.cardId)S.byCard[normCard(e.rec.cardId)]=k;
    e.key=k;e.saved=true;S.enrolled++;
    renderRecentEnrol();toast(t('qe.retried',{name:e.rec.nameZh||e.rec.nameEn||'—'}));
  }catch(x){werr(x);}
}
function mountLauncher(){
  const right=document.querySelector('.topbar .right');
  if(right&&!$('qeTop')){
    const b=document.createElement('button');b.className='btn sm';b.id='qeTop';b.type='button';
    b.setAttribute('data-i18n','qe.open');b.textContent=t('qe.open');b.title=t('qe.shortcut');
    b.onclick=()=>open();
    right.insertBefore(b,right.firstChild);
  }
  const card=$('scan')&&$('scan').closest('.card');
  if(card&&!$('qeLaunch')){
    const d=document.createElement('div');d.className='qe-launch';d.id='qeLaunch';
    d.innerHTML='<button class="btn" id="qeBig" type="button" data-i18n="qe.openBig"></button><span class="chip" data-i18n="qe.shortcut"></span>';
    const anchor=$('opAtt')?$('opAtt').closest('.row'):null;
    if(anchor&&anchor.parentNode===card)card.insertBefore(d,anchor.nextSibling);else card.appendChild(d);
    I18N.apply(d);
    $('qeBig').onclick=()=>open();
  }
  if(card&&!$('qeList')){
    const d=document.createElement('div');d.className='qe-list';d.id='qeList';card.appendChild(d);
    d.addEventListener('click',ev=>{
      const b=ev.target.closest('button[data-act]');if(!b)return;
      const i=parseInt(b.dataset.i,10),e=recent[i];if(!e)return;
      if(b.dataset.act==='print'){enqueue({local:true,data:e.rec,copies:1});beep('ok');}
      else retrySave(i);
    });
    renderRecentEnrol();
  }
}
function paint(){
  if(!el)return;
  I18N.apply(el);fillPicks();refresh();
  const top=$('qeTop');if(top)top.textContent=t('qe.open');
  const big=$('qeBig');if(big)big.textContent=t('qe.openBig');
  renderRecentEnrol();
}
return {open,close,isOpen,mount,mountLauncher,paint,renderRecentEnrol};
})();

/* ================= print pipeline ================= */
function updateCount(){
  $('queueChip').textContent=t('pr.queue')+' '+S.pipe.length;
  const p=document.getElementById('printedChip');if(p)p.textContent=t('sp.printed')+' '+S.printed;
  const st=document.getElementById('pipeChip');if(st)st.textContent=S.piping?t('sp.pipeBusy'):t('sp.pipeIdle');
}
function pushRecent(name,sid,meet,src){
  S.recent.unshift({name:name,sid:sid,meet:meet,src:src,ts:Date.now()});
  if(S.recent.length>6)S.recent.length=6;
  renderRecent();
}
function renderRecent(){
  const box=document.getElementById('spRecent');if(!box)return;
  box.innerHTML='<h4>'+esc(t('sp.recent'))+'</h4>'+(S.recent.length
    ? S.recent.map(r=>'<div class="sp-line"><span class="tm">'+esc(fmtS(r.ts))+'</span><span class="nm">'+esc(r.name)+'</span><span class="src">'+esc(r.sid||'—')+'</span><span class="mt">'+esc(r.meet||'')+'</span></div>').join('')
    : '<p class="muted" style="font-size:13px;margin:0">'+esc(t('sp.empty'))+'</p>');
}
function enqueue(job){S.pipe.push(job);updateCount();runPipe();}
async function runPipe(){
  if(S.piping)return;S.piping=true;updateCount();
  while(S.pipe.length){
    const j=S.pipe.shift();updateCount();
    if(j.key)await db().ref('parents/queues/'+S.stationKey+'/'+j.key).remove().catch(()=>{});
    try{
      $('printArea').innerHTML=LL.stageHTML(S.layout,j.data,true);
      await raf2();
      if(S.speed.settle>0)await sleep(S.speed.settle);
      const c=clamp(parseInt(j.copies,10)||S.speed.copies||1,1,10);
      for(let i=0;i<c;i++){
        window.print();S.printed++;updateCount();
        log((j.data.nameEn||j.data.nameZh||'LABEL')+' '+(i+1)+'/'+c+' '+t('pr.sent')+(j.local?' · '+t('sp.local'):''));
        if(i<c-1)await sleep(Math.max(S.speed.settle,40));
      }
      pushRecent(j.data.nameEn||j.data.nameZh||'LABEL',String(j.data.studentId||''),LL.meetLine(j.data),j.local?'local':'queue');
    }catch(e){log(t('c.fail')+': '+(e.message||e));}
    if(S.speed.mode==='safe')await sleep(200);
  }
  S.piping=false;updateCount();
}
function enqueueRemote(k,j){
  if(S.seen[k])return;S.seen[k]=1;
  log(t('pr.jobReceived')+': '+(j.nameEn||'?')+(j.studentId?' ['+j.studentId+']':'')+(LL.meetLine(j)?' · '+LL.meetLine(j):''));
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
function renderScanReady(){const b=$('scan');if(!b)return;setScan(b,'ready');b.innerHTML=esc(t('op.ready'))+'<small>'+esc(t('op.readySub'))+'</small>';}
function scanLater(ms){clearTimeout(S.scanTimer);S.scanTimer=setTimeout(renderScanReady,ms);}
function renderAttStats(){let p=0,a=0;Object.values(S.att).forEach(r=>r.status==='present'?p++:a++);$('opAtt').textContent=t('pr.today')+': '+t('c.present')+' '+p+' · '+t('c.absent')+' '+a+' · '+t('c.unmarked')+' '+Math.max(0,Object.keys(S.students).length-p-a);}
function renderStationText(){
  $('stationChip').textContent=S.station?S.station.name+' ('+S.station.token+')':t('st.notBound');
  $('stInfo').textContent=S.station?t('st.this')+': '+S.station.name+' · '+t('st.token')+' '+S.station.token:'—';
}
function renderStatus(){$('statusText').textContent=S.connected?t('pr.online'):t('pr.connecting');$('dot').className='dot'+(S.connected?' on':'');}
const attBadge=a=>a?(a.status==='present'?'<span class="ab p">'+esc(t('c.present'))+' <i>'+fmtT(a.time)+'</i></span>':'<span class="ab a">'+esc(t('c.absent'))+' <i>'+fmtT(a.time)+'</i></span>'):'<span class="ab">'+esc(t('c.unmarked'))+'</span>';
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
      +'<div class="g"><div><label data-i18n="sp.settle"></label><input id="spSettle" type="number" min="0" max="2000" step="10"></div>'
      +'<div><label data-i18n="sp.copies"></label><input id="spCopies" type="number" min="1" max="10"></div>'
      +'<div><label data-i18n="sp.dupe"></label><input id="spDupe" type="number" min="0" max="5000" step="100"></div></div>'
      +'<div class="row" style="margin-top:12px"><label class="check" style="padding:0"><input type="checkbox" id="spSound"><span data-i18n="sp.sound"></span></label><span class="spacer"></span><button class="btn gray" id="spReset" data-i18n="sp.reset"></button></div>'
      +'<p class="muted" style="margin-top:10px" data-i18n="sp.settleHint"></p><p class="muted" data-i18n="sp.dupeHint"></p><p class="muted" data-i18n="sp.testHint"></p>';
    tab.insertBefore(c,tab.firstChild);
    I18N.apply(c);
    document.querySelectorAll('#spMode button').forEach(b=>b.onclick=()=>{S.speed.mode=b.dataset.m;S.speed.settle=S.speed.mode==='fast'?70:500;saveSpeed();syncSpeedUI();toast(t('sp.saved'));});
    $('spSettle').addEventListener('input',()=>{const v=parseInt($('spSettle').value,10);if(!Number.isFinite(v))return;S.speed.settle=clamp(v,0,2000);saveSpeed();renderSpeedState();});
    $('spCopies').addEventListener('input',()=>{const v=parseInt($('spCopies').value,10);if(!Number.isFinite(v))return;S.speed.copies=clamp(v,1,10);saveSpeed();renderSpeedState();});
    $('spDupe').addEventListener('input',()=>{const v=parseInt($('spDupe').value,10);if(!Number.isFinite(v))return;S.speed.dupe=clamp(v,0,5000);saveSpeed();renderSpeedState();});
    $('spSound').addEventListener('change',()=>{S.speed.sound=$('spSound').checked;saveSpeed();if(S.speed.sound)beep('ok');});
    $('spReset').onclick=()=>{S.speed=Object.assign({},DEF_SPEED);saveSpeed();syncSpeedUI();toast(t('sp.saved'));};
  }
  syncSpeedUI();renderRecent();updateCount();
}
function renderSpeedState(){const el=document.getElementById('spState');if(el)el.textContent=(S.speed.mode==='fast'?t('sp.fastOn'):t('sp.safeOn'))+' · '+S.speed.settle+'ms · ×'+S.speed.copies;}
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
  await db().ref('parents/attendance/'+S.attDay+'/'+k).set({status:st,time:Date.now(),by,studentId:String(s.studentId||''),cls:s.cls||'',classNo:s.classNo||'',nameEn:s.nameEn||'',nameZh:s.nameZh||'',cardId:s.cardId||''});
}
async function findToken(tk){const all=(await db().ref('parents/stations').once('value')).val()||{};return Object.entries(all).find(([k,v])=>String(v.token||'').toUpperCase()===tk);}
function bindStation(key){
  S.stationKey=key;$('bindCard').style.display='none';$('mainArea').style.display='block';
  mountSpeedUI();Enrol.mountLauncher();
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
    setScan(box,'err');
    box.innerHTML=esc(t('op.unreg'))+': '+esc(card)+'<small>'+esc(t('qe.fromScan',{card:card}))+'</small>';
    beep('err');log(t('op.unreg')+': '+card);
    scanLater(6000);
    Enrol.open({cardId:card});
    return;
  }
  const s=S.students[k];
  setScan(box,'ok');
  box.innerHTML=esc(s.nameEn||s.nameZh)+'<small>'+esc(t('sd.sid'))+' '+esc(s.studentId||'—')+' · '+esc(s.cls||'')+' '+esc(s.classNo||'')+(LL.meetLine(s)?' · '+esc(LL.meetLine(s)):'')+'</small><small>'+esc(t('op.markedPresent'))+' '+fmtT(now)+' · '+esc(t('sp.local'))+'</small>';
  beep('ok');
  enqueue({local:true,data:Object.assign({},s),copies:S.speed.copies});
  markAtt(k,'present','scan').catch(e=>{
    log(t('sp.attFail')+' '+(e&&e.message||e));
    if(!S.attWarned){S.attWarned=true;toast(t('sp.attFail'));setTimeout(()=>{S.attWarned=false;},15000);}
  });
  scanLater(1100);
}
function doSearch(){
  const q=$('q').value.trim();if(!q){$('res').innerHTML='';return;}
  const hits=Object.entries(S.students).filter(([k,s])=>LL.searchMatch(s,q)).slice(0,30);
  $('res').innerHTML=hits.map(([k,s])=>'<div class="stu-card"><div class="stu-head"><span class="stu-name">'+esc(s.nameEn||s.nameZh)+'</span><span class="stu-sub">'+esc(s.nameZh||'')+'</span><span class="stu-sub">'+esc(t('sd.sid'))+' '+esc(s.studentId||'—')+' · '+esc(s.cls||'')+' '+esc(s.classNo||'')+'</span>'+attBadge(S.att[k])+'</div>'+meetHtml(s)+'<div class="act-row"><button class="btn lg" data-act="print" data-k="'+esc(k)+'">'+esc(t('rm.presentPrint'))+'</button><button class="btn lg ok" data-act="pres" data-k="'+esc(k)+'">'+esc(t('rm.presentOnly'))+'</button><button class="btn lg bad" data-act="abs" data-k="'+esc(k)+'">'+esc(t('rm.absentOnly'))+'</button></div></div>').join('')
    ||'<div class="stu-card"><p class="muted" style="margin:0">'+esc(t('c.noMatch'))+'</p><div class="act-row"><button class="btn" data-act="enrol" data-q="'+esc(q)+'">'+esc(t('qe.openBig'))+'</button></div></div>';
}

/* ================= wiring ================= */
function wire(){
  document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
  [['pDcW','doc','w'],['pDcH','doc','h'],['pHdT','hide','top'],['pHdL','hide','left']].forEach(([id,g,k])=>$(id).addEventListener('input',()=>{const v=parseFloat($(id).value);if(!Number.isFinite(v))return;S.layout[g][k]=g==='hide'?Math.max(0,v):Math.max(1,v);applyCss();$('lyInfo').textContent=effText();}));
  [['pTop','topMm'],['pSide','sideMm'],['pEn','enSize'],['pZh','zhSize'],['pMs','meetSize'],['pGap','gapMm']].forEach(([id,k])=>$(id).addEventListener('input',()=>{const v=parseFloat($(id).value);if(!Number.isFinite(v))return;S.layout.simple[k]=v;applyCss();}));
  [['pEnT','enText'],['pZhT','zhText'],['pMeT','meetText']].forEach(([id,k])=>$(id).addEventListener('input',()=>{S.layout.simple[k]=$(id).value;applyCss();}));
  $('btnPreset').onclick=()=>{S.layout.doc={w:60,h:60};S.layout.hide={top:20,left:0};syncCfg();applyCss();toast(t('dz.presetOk'));};
  $('btnSaveCfg').onclick=async()=>{if(!needAdmin())return;try{const p=LL.clone(S.layout);p.version=6;p.updatedAt=Date.now();await db().ref('parents/labelLayout').set(p);toast(t('c.saved'));}catch(e){werr(e);}};
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
    if(b.dataset.act==='enrol'){Enrol.open({});return;}
    const k=b.dataset.k,s=S.students[k];if(!s||!S.stationKey)return;
    const a=b.dataset.act;
    if(!await Verify.ask(s)){toast(t('vf.cancelled'));log(t('vf.cancel')+' — '+(s.nameEn||s.nameZh));return;}
    const who=s.nameEn||s.nameZh;
    if(a==='print'){
      if(S.busy)return;S.busy=true;b.disabled=true;
      try{await markAtt(k,'present','printer-v');enqueue({local:true,data:Object.assign({},s),copies:S.speed.copies});
        toast(t('vf.verifiedToast')+' · '+t('pr.queued'));
        log(t('rm.sPrint')+' '+who+(LL.meetLine(s)?' · '+LL.meetLine(s):'')+' '+t('vf.logVerified'));
      }catch(x){werr(x);}finally{S.busy=false;b.disabled=false;}
    }else{
      try{await markAtt(k,a==='pres'?'present':'absent','printer-v');
        toast(t('vf.verifiedToast')+' · '+(a==='pres'?t('rm.markedPresent'):t('rm.markedAbsent'))+' '+who);
        log(t('pr.marked')+' '+who+' '+t(a==='pres'?'c.present':'c.absent')+' '+t('vf.logVerified'));
      }catch(x){werr(x);}
    }
  };
  document.addEventListener('keydown',e=>{
    if(document.body.classList.contains('auth-locked'))return;
    if(e.key==='F2'&&!Verify.open()&&!Enrol.isOpen()){e.preventDefault();Enrol.open({});return;}
    if(Verify.open()||Enrol.isOpen())return;
    const a=document.activeElement;if(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName))return;
    if(!S.stationKey)return;
    const now=Date.now();if(now-S.bufAt>140)S.buf='';S.bufAt=now;
    if(e.key==='Enter'||e.key==='Tab'){if(S.buf.length>=4){e.preventDefault();const c=S.buf;S.buf='';scan(c);}S.buf='';}
    else if(e.key.length===1)S.buf+=e.key;
  });
  document.addEventListener('langchange',()=>{
    I18N.apply();Verify.paint();Enrol.paint();syncCfg();applyCss();renderScanReady();renderAttStats();
    updateCount();renderStationText();renderStatus();doSearch();syncSpeedUI();renderRecent();
  });
}

I18N.apply();I18N.mountToggle();
syncCfg();applyCss();renderScanReady();renderAttStats();renderStationText();renderStatus();
wire();Verify.banner('q');mountSpeedUI();Enrol.mountLauncher();
Auth.start(function(){
  attachAtt(S.attDay);
  setInterval(()=>{const d=dayKey();if(d!==S.attDay)attachAtt(d);},30000);
  db().ref('parents/labelLayout').on('value',s=>{S.layout=LL.norm(s.val());syncCfg();applyCss();if(Enrol.isOpen())Enrol.paint();},werr);
  db().ref('parents/directory').on('value',s=>{const v=s.val()||{};S.dir={teachers:v.teachers||{},rooms:v.rooms||{}};if(Enrol.isOpen())Enrol.paint();},()=>{});
  db().ref('parents/students').on('value',s=>{
    S.students=s.val()||{};S.byCard={};
    Object.entries(S.students).forEach(([k,v])=>{if(v.cardId)S.byCard[normCard(v.cardId)]=k;});
    renderAttStats();doSearch();if(Enrol.isOpen())Enrol.paint();
  },werr);
  db().ref('.info/connected').on('value',s=>{S.connected=s.val()===true;renderStatus();});
  (async()=>{const tk=localStorage.getItem(LS);if(tk){try{const hit=await findToken(tk);if(hit)bindStation(hit[0]);}catch(e){}}})();
});
})();
