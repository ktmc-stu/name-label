/* js/portal.js — live portal: stats, station board, label preview, kiosk batch file */
(function(){
const S={students:{},stations:{},queues:{},att:{},attDay:'',attRef:null,layout:LL.norm(null),connected:false};
const $=id=>document.getElementById(id);
const t=(k,v)=>I18N.t(k,v);
const esc=LL.esc;
const db=()=>Auth.db;
const dayKey=(d=new Date())=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
S.attDay=dayKey();
const online=st=>st&&st.lastSeen&&(Date.now()-st.lastSeen<60000);
let toastTimer=null;
function toast(m){const e=$('toast');e.textContent=m;e.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('on'),2600);}
function safe(fn,l){try{fn();}catch(e){console.error(l,e);}}

const tick=()=>{$('clock').textContent=new Date().toLocaleTimeString('en-GB');};
tick();setInterval(tick,1000);
const nav=$('nav');
addEventListener('scroll',()=>nav.classList.toggle('scrolled',scrollY>10),{passive:true});
const links=[...document.querySelectorAll('.navlinks a')];
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)links.forEach(l=>l.classList.toggle('on',l.getAttribute('href')==='#'+e.target.id));}),{rootMargin:'-40% 0px -55% 0px'});
links.forEach(a=>{const s=document.querySelector(a.getAttribute('href'));if(s)io.observe(s);});
const rio=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');rio.unobserve(e.target);}}),{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>rio.observe(el));

function renderHero(){const e=LL.eff(S.layout),p=$('heroPreview');p.style.width=e.w+'mm';p.style.height=e.h+'mm';p.innerHTML=LL.stageHTML(S.layout,S.layout.sample,false);}
function renderHealth(){
  const h=$('health');h.className='health '+(S.connected?'ok':'bad');
  h.querySelector('span').textContent=S.connected?t('po.connected'):t('po.disconnected');
}
function render(){
  const a=Object.entries(S.stations),on=a.filter(([k,v])=>online(v)).length;
  let pres=0;Object.values(S.att).forEach(r=>{if(r&&r.status==='present')pres++;});
  const mc=Object.values(S.students).filter(s=>LL.meetLine(s)).length;
  $('stStudents').textContent=Object.keys(S.students).length;
  $('stMeet').textContent=mc;$('stOnline').textContent=on+'/'+a.length;$('stPresent').textContent=pres;
  const e=LL.eff(S.layout),b=$('board');
  if(!a.length){b.innerHTML='<div class="empty">'+esc(t('po.none'))+'</div>';return;}
  b.innerHTML=a.map(([k,v])=>{
    const q=Object.keys(S.queues[k]||{}).length,o=online(v);
    return '<div class="station"><div class="st-top"><span class="dot'+(o?' on':'')+'"></span><span class="st-name">'+esc(v.name||t('p.stations'))+'</span><span class="st-token">'+esc(v.token||'—')+'</span></div>'
      +'<div class="st-meta"><span class="meta">'+esc(t('po.eff'))+' '+e.w+'×'+e.h+' mm</span><span class="meta">'+esc(t('po.hide'))+' '+esc(t('po.top'))+' '+S.layout.hide.top+' / '+esc(t('po.left'))+' '+S.layout.hide.left+' mm</span></div>'
      +'<div class="st-foot"><span class="'+(o?'on':'off')+'">'+esc(t(o?'c.online':'c.offline'))+'</span><span class="mono">'+esc(t('c.queue'))+' '+q+'</span></div></div>';
  }).join('');
}
function batText(){
  const url=location.href.replace(/[^/]*$/,'')+'parents-printer.html';
  return ['@echo off','start "" "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk --kiosk-printing --user-data-dir="C:\\kiosk-profile" --app="'+url+'" --disable-features=IntensiveWakeUpThrottling --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --no-first-run --no-default-browser-check --disable-infobars',''].join('\r\n');
}
function dl(){const b=new Blob([batText()],{type:'application/octet-stream'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='StartLabelPrinter.bat';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);toast(t('po.downloaded'));}

I18N.apply();I18N.mountToggle();
$('batCode').textContent=batText();
$('dlBat').onclick=dl;$('dlTop').onclick=dl;
$('cpBat').onclick=async()=>{try{await navigator.clipboard.writeText(batText());toast(t('po.copied'));}catch(e){toast(t('po.copyFail'));}};
renderHero();renderHealth();render();
document.addEventListener('langchange',()=>{I18N.apply();renderHero();render();renderHealth();});

Auth.start(function(){
  db().ref('parents/labelLayout').on('value',s=>{S.layout=LL.norm(s.val());safe(renderHero,'hero');safe(render,'board');},e=>console.warn(e.code));
  const attach=d=>{if(S.attRef)S.attRef.off();S.attDay=d;S.att={};$('dayChip').textContent=d;
    S.attRef=db().ref('parents/attendance/'+d);S.attRef.on('value',s=>{S.att=s.val()||{};safe(render,'stats');},e=>console.warn(e.code));};
  attach(S.attDay);
  setInterval(()=>{const d=dayKey();if(d!==S.attDay)attach(d);},30000);
  db().ref('parents/students').on('value',s=>{S.students=s.val()||{};safe(render,'students');},e=>console.warn(e.code));
  db().ref('parents/stations').on('value',s=>{S.stations=s.val()||{};safe(render,'stations');},e=>console.warn(e.code));
  db().ref('parents/queues').on('value',s=>{S.queues=s.val()||{};safe(render,'queues');},e=>console.warn(e.code));
  db().ref('.info/connected').on('value',s=>{S.connected=s.val()===true;safe(renderHealth,'health');});
  setInterval(()=>safe(render,'refresh'),15000);
});
})();
