/* js/remote.js — handheld terminal: search, attendance, send labels with meeting data */
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
function toast(m){const e=$('toast');e.textContent=m;e.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('on'),2800);}
const needApproved=()=>{if(!Auth.isApproved()){toast(t('pr.needApproved'));return false;}return true;};
const werr=e=>{const c=(e&&e.code)||'';toast(/PERMISSION_DENIED/i.test(c+e)?t('c.denied'):t('c.fail')+': '+(e&&e.message||e));};
function safe(fn,l){try{fn();}catch(e){console.error(l,e);}}
function sess(m){const d=document.createElement('div');d.textContent='['+fmtT(Date.now())+'] '+m;const s=$('session');if(s.firstChild&&s.firstChild.textContent==='—')s.innerHTML='';s.prepend(d);while(s.children.length>14)s.lastChild.remove();}
const attBadge=a=>a?(a.status==='present'?'<span class="ab p">'+esc(t('c.present'))+' <i>'+fmtT(a.time)+'</i></span>':'<span class="ab a">'+esc(t('c.absent'))+' <i>'+fmtT(a.time)+'</i></span>'):'<span class="ab">'+esc(t('c.unmarked'))+'</span>';

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
async function markAtt(k,status){const s=S.students[k];if(!s)return;await db().ref('parents/attendance/'+S.attDay+'/'+k).set({status,time:Date.now(),by:'remote',cls:s.cls||'',classNo:s.classNo||'',nameEn:s.nameEn||'',nameZh:s.nameZh||'',cardId:s.cardId||''});}
function doSearch(){
  const q=$('q').value.trim();
  if(!q){$('res').innerHTML='<p class="muted" style="margin-top:10px">'+esc(t('c.typeSearch'))+'</p>';return;}
  const hits=Object.entries(S.students).filter(([k,s])=>LL.searchMatch(s,q)).slice(0,30);
  $('res').innerHTML=hits.map(([k,s])=>'<div class="stu-card"><div class="stu-head"><span class="stu-name">'+esc(s.nameEn||s.nameZh)+'</span><span class="stu-sub">'+esc(s.nameZh||'')+'</span><span class="stu-sub">'+esc(s.cls||'')+' '+esc(s.classNo||'')+'</span>'+attBadge(S.att[k])+'</div>'+meetHtml(s)+'<div class="act-row"><button class="btn lg" data-act="print" data-k="'+esc(k)+'">'+esc(t('rm.presentPrint'))+'</button><button class="btn lg ok" data-act="pres" data-k="'+esc(k)+'">'+esc(t('rm.presentOnly'))+'</button><button class="btn lg bad" data-act="abs" data-k="'+esc(k)+'">'+esc(t('rm.absentOnly'))+'</button></div></div>').join('')||'<p class="muted" style="margin-top:10px">'+esc(t('c.noMatch'))+'</p>';
}

function wire(){
  $('stBtn').onclick=()=>{renderStation();$('stModal').classList.add('on');};
  $('stClose').onclick=()=>$('stModal').classList.remove('on');
  $('stSel').onchange=function(){pickStation(this.value||null);};
  $('stChips').onclick=e=>{const b=e.target.closest('button[data-k]');if(b)pickStation(b.dataset.k);};
  $('stModal').addEventListener('click',e=>{if(e.target===$('stModal'))$('stModal').classList.remove('on');});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')$('stModal').classList.remove('on');});
  $('q').addEventListener('input',()=>safe(doSearch,'search'));
  $('res').onclick=async e=>{
    const b=e.target.closest('button[data-act]');if(!b||!needApproved())return;
    const k=b.dataset.k,s=S.students[k];if(!s)return;
    const a=b.dataset.act;
    if(a==='print'){
      if(S.busy)return;S.busy=true;b.disabled=true;
      try{
        await markAtt(k,'present');
        if(S.station&&S.stations[S.station]){
          await new Promise(r=>setTimeout(r,1200));
          await db().ref('parents/queues/'+S.station).push(Object.assign({type:'label',cls:s.cls||'',classNo:s.classNo||'',nameEn:s.nameEn||'',nameZh:s.nameZh||'',cardId:s.cardId||''},meetOf(s),{copies:1,createdAt:Date.now(),done:false}));
          toast(t('rm.sentTo')+' '+S.stations[S.station].name);
          sess((s.nameEn||s.nameZh)+' '+t('rm.sPrint')+' → '+S.stations[S.station].name+(LL.meetLine(s)?' · '+LL.meetLine(s):''));
        }else{toast(t('rm.noPrint'));sess((s.nameEn||s.nameZh)+' '+t('rm.sNoPrint'));}
      }catch(x){werr(x);}finally{S.busy=false;b.disabled=false;}
    }else{
      try{await markAtt(k,a==='pres'?'present':'absent');
        toast((a==='pres'?t('rm.markedPresent'):t('rm.markedAbsent'))+' '+(s.nameEn||s.nameZh));
        sess((s.nameEn||s.nameZh)+' '+t(a==='pres'?'rm.sPresent':'rm.sAbsent'));
      }catch(x){werr(x);}
    }
  };
  document.addEventListener('langchange',()=>{I18N.apply();renderStats();renderStation();doSearch();});
  setInterval(()=>safe(renderStation,'station'),15000);
}

I18N.apply();I18N.mountToggle();
renderStats();renderStation();doSearch();
wire();
Auth.start(function(){
  attachAtt(S.attDay);
  setInterval(()=>{const d=dayKey();if(d!==S.attDay){attachAtt(d);toast(t('rm.newDay')+' '+d);}},30000);
  db().ref('parents/stations').on('value',s=>{S.stations=s.val()||{};if(S.station&&!S.stations[S.station]){S.station=null;localStorage.removeItem(LS);}renderStation();},werr);
  db().ref('parents/queues').on('value',s=>{S.queues=s.val()||{};renderStation();},werr);
  db().ref('parents/students').on('value',s=>{S.students=s.val()||{};renderStats();doSearch();},werr);
});
})();
