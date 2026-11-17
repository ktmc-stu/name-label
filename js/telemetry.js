/* js/telemetry.js — session, dwell time, presence, IP/device capture and full action audit.
   Loaded automatically by js/auth.js. Wraps the Realtime Database write methods so every
   mutation on every page is recorded without touching the individual page scripts. */
(function(){
if(window.TEL)return;
const AUD='audit',SES='sessions',PRE='presence';
const IDLE=60000,TICK=5000,FLUSH=4000,MAXBUF=40;
const T={
  uid:null,email:'',role:'',sid:null,tab:null,ready:false,
  start:Date.now(),last:Date.now(),activeMs:0,idleMs:0,totalMs:0,views:0,acts:0,
  lastInput:Date.now(),visible:document.visibilityState==='visible',focused:document.hasFocus(),
  buf:[],ip:'',ipSrc:'',dev:null,page:'',timer:null,flushTimer:null,ended:false,db:null
};
const now=()=>Date.now();
const rid=()=>now().toString(36)+Math.random().toString(36).slice(2,10);
const cut=(s,n)=>String(s==null?'':s).slice(0,n);
const pathOf=ref=>{try{return decodeURI(String(ref.toString()).replace(/^https?:\/\/[^/]+\/?/,''));}catch(e){return '';}};
const isSelf=p=>/^(audit|sessions|presence)(\/|$)/.test(p);
function pageName(){return cut(location.pathname.split('/').pop()+'#'+(location.hash||'').replace('#',''),290);}
function device(){
  const n=navigator,d=n.deviceMemory,c=n.hardwareConcurrency;
  let tz='';try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'';}catch(e){}
  const cn=n.connection||n.mozConnection||n.webkitConnection;
  return {
    ua:cut(n.userAgent,400),plat:cut(n.platform||'',80),langs:cut((n.languages||[n.language]).join(','),80),
    tz:cut(tz,60),screen:cut(screen.width+'x'+screen.height+'@'+(window.devicePixelRatio||1),40),
    view:cut(innerWidth+'x'+innerHeight,40),cores:Number(c)||0,mem:Number(d)||0,
    touch:('ontouchstart'in window)||(n.maxTouchPoints>0),net:cut(cn?(cn.effectiveType||cn.type||''):'',40)
  };
}
async function resolveIP(){
  try{const c=sessionStorage.getItem('plIP');if(c){const j=JSON.parse(c);T.ip=j.ip||'';T.ipSrc=j.src||'';return;}}catch(e){}
  const tries=[
    ['ipify','https://api.ipify.org?format=json',r=>r.json().then(j=>j.ip)],
    ['cloudflare','https://www.cloudflare.com/cdn-cgi/trace',r=>r.text().then(x=>(x.match(/^ip=(.+)$/m)||[])[1])]
  ];
  for(const [src,url,pick] of tries){
    try{
      const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),3500);
      const r=await fetch(url,{signal:ctl.signal,cache:'no-store'});clearTimeout(to);
      if(!r.ok)continue;
      const ip=String(await pick(r)||'').trim();
      if(ip){T.ip=cut(ip,64);T.ipSrc=src;try{sessionStorage.setItem('plIP',JSON.stringify({ip:T.ip,src:src}));}catch(e){}return;}
    }catch(e){}
  }
  T.ip='unknown';T.ipSrc='blocked';
}
function sessPayload(){
  const d=T.dev||{};
  return {uid:T.uid,email:cut(T.email,120),role:cut(T.role,20),start:T.start,last:T.last,
    activeMs:T.activeMs,idleMs:T.idleMs,totalMs:T.totalMs,views:T.views,acts:T.acts,online:!T.ended,
    ip:cut(T.ip||'unknown',64),ipSrc:cut(T.ipSrc,60),entry:cut(T.entry||pageName(),300),page:cut(T.page||pageName(),300),
    ref:cut(document.referrer||'',300),ua:d.ua||'',plat:d.plat||'',langs:d.langs||'',tz:d.tz||'',
    screen:d.screen||'',view:d.view||'',cores:d.cores||0,mem:d.mem||0,touch:!!d.touch,net:d.net||'',tab:cut(T.tab,64)};
}
function push(kind,d){
  if(!T.ready||!T.db)return;
  const e={uid:T.uid,ts:now(),kind:cut(kind,20),sid:T.sid||'',email:cut(T.email,120),role:cut(T.role,20),page:cut(T.page||pageName(),200)};
  const o={};
  Object.keys(d||{}).forEach(k=>{
    const v=d[k];
    if(v==null)return;
    if(typeof v==='object'){o[k]=cut(JSON.stringify(v),400);return;}
    o[k]=typeof v==='number'?v:typeof v==='boolean'?v:cut(v,400);
  });
  e.d=o;T.buf.push(e);T.acts++;
  if(T.buf.length>=MAXBUF)flush();
}
let flushing=false;
async function flush(){
  if(!T.ready||!T.db||flushing||!T.buf.length)return;
  flushing=true;
  const batch=T.buf.splice(0,MAXBUF);
  try{
    const upd={};
    batch.forEach(e=>{upd[rid()]=e;});
    await T.db.ref(AUD).update(upd);
  }catch(e){T.buf=batch.concat(T.buf).slice(-300);}
  flushing=false;
}
async function beat(){
  if(!T.ready||!T.db||T.ended)return;
  const t=now(),dt=t-T.last;T.last=t;T.totalMs+=dt;
  const active=T.visible&&T.focused&&(t-T.lastInput<IDLE);
  if(active)T.activeMs+=dt;else T.idleMs+=dt;
  try{
    await T.db.ref(SES+'/'+T.sid).update({last:t,activeMs:T.activeMs,idleMs:T.idleMs,totalMs:T.totalMs,views:T.views,acts:T.acts,online:true,page:cut(T.page,300),ip:cut(T.ip||'unknown',64),ipSrc:cut(T.ipSrc,60)});
    await T.db.ref(PRE+'/'+T.uid).set({uid:T.uid,email:cut(T.email,120),role:cut(T.role,20),sid:T.sid,page:cut(T.page,300),last:t,activeMs:T.activeMs,online:true,ip:cut(T.ip||'unknown',64),ua:cut((T.dev&&T.dev.ua)||'',400)});
  }catch(e){}
  flush();
}
function wrapDb(){
  try{
    const P=firebase.database.Reference.prototype;
    ['set','update','remove','setWithPriority'].forEach(m=>{
      const orig=P[m];if(typeof orig!=='function'||orig.__tel)return;
      const w=function(){
        const p=pathOf(this),t0=performance.now(),args=arguments;
        const out=orig.apply(this,args);
        if(!isSelf(p)){
          const keys=args[0]&&typeof args[0]==='object'?Object.keys(args[0]).slice(0,14).join(','):'';
          Promise.resolve(out).then(()=>push('db',{op:m,path:p,ok:true,ms:Math.round(performance.now()-t0),keys:keys}))
            .catch(e=>push('db',{op:m,path:p,ok:false,err:String((e&&e.code)||e),keys:keys}));
        }
        return out;
      };
      w.__tel=true;P[m]=w;
    });
    const op=P.push;
    if(typeof op==='function'&&!op.__tel){
      const w=function(){
        const p=pathOf(this),args=arguments,out=op.apply(this,args);
        if(!isSelf(p)){
          const keys=args[0]&&typeof args[0]==='object'?Object.keys(args[0]).slice(0,14).join(','):'';
          let k='';try{k=out.key||'';}catch(e){}
          Promise.resolve(out).then(()=>push('db',{op:'push',path:p,key:k,ok:true,keys:keys})).catch(e=>push('db',{op:'push',path:p,ok:false,err:String((e&&e.code)||e)}));
        }
        return out;
      };
      w.__tel=true;P.push=w;
    }
    const ot=P.transaction;
    if(typeof ot==='function'&&!ot.__tel){
      const w=function(){const p=pathOf(this),out=ot.apply(this,arguments);if(!isSelf(p))push('db',{op:'transaction',path:p});return out;};
      w.__tel=true;P.transaction=w;
    }
  }catch(e){}
}
function wrapPrint(){
  const op=window.print;
  if(typeof op!=='function'||op.__tel)return;
  const w=function(){push('print',{page:T.page});flush();return op.apply(window,arguments);};
  w.__tel=true;window.print=w;
}
function labelOf(el){
  const k=el.getAttribute&&el.getAttribute('data-i18n');
  let s=(el.textContent||'').trim().replace(/\s+/g,' ');
  if(!s&&k)s=k;
  if(!s)s=el.getAttribute&&(el.getAttribute('aria-label')||el.id||el.className)||el.tagName;
  return cut(s,80);
}
function wireUi(){
  document.addEventListener('click',e=>{
    const el=e.target.closest&&e.target.closest('button,a,[data-act],[data-page],[data-goto],summary');
    if(!el)return;
    push('ui',{label:labelOf(el),act:el.getAttribute('data-act')||'',key:el.getAttribute('data-k')||el.getAttribute('data-page')||'',href:cut(el.getAttribute('href')||'',120)});
  },true);
  ['keydown','pointerdown','wheel','touchstart'].forEach(ev=>addEventListener(ev,()=>{T.lastInput=now();},{passive:true,capture:true}));
  document.addEventListener('visibilitychange',()=>{
    T.visible=document.visibilityState==='visible';
    push('view',{state:T.visible?'visible':'hidden',page:T.page});
    if(!T.visible){beat();flush();}
  });
  addEventListener('focus',()=>{T.focused=true;});
  addEventListener('blur',()=>{T.focused=false;beat();});
  addEventListener('hashchange',()=>{T.views++;T.page=pageName();push('view',{page:T.page,nav:'hash'});});
  addEventListener('error',e=>push('error',{msg:cut(e.message||'',300),src:cut(e.filename||'',150),line:e.lineno||0}));
  addEventListener('unhandledrejection',e=>push('error',{msg:cut(String((e.reason&&e.reason.message)||e.reason||''),300),promise:true}));
  const end=()=>{
    if(T.ended)return;T.ended=true;
    beat();push('session',{event:'end',activeMs:T.activeMs,totalMs:T.totalMs});flush();
    try{
      T.db.ref(SES+'/'+T.sid).update({end:now(),last:now(),online:false,activeMs:T.activeMs,idleMs:T.idleMs,totalMs:T.totalMs,views:T.views,acts:T.acts});
      T.db.ref(PRE+'/'+T.uid).update({online:false,last:now(),activeMs:T.activeMs});
    }catch(e){}
  };
  addEventListener('pagehide',end);
  addEventListener('beforeunload',end);
}
async function begin(user,profile){
  if(T.ready||!user)return;
  try{T.db=firebase.database();}catch(e){return;}
  T.uid=user.uid;T.email=user.email||'';T.role=(profile&&profile.role)||'staff';
  T.tab=(()=>{try{let v=sessionStorage.getItem('plTab');if(!v){v=rid();sessionStorage.setItem('plTab',v);}return v;}catch(e){return rid();}})();
  T.sid=rid();T.entry=pageName();T.page=T.entry;T.views=1;T.dev=device();T.ready=true;
  wrapDb();wrapPrint();wireUi();
  try{await T.db.ref(SES+'/'+T.sid).set(sessPayload());}catch(e){}
  push('auth',{event:'session-start',page:T.entry});
  push('view',{page:T.entry,nav:'entry'});
  resolveIP().then(()=>{try{T.db.ref(SES+'/'+T.sid).update({ip:cut(T.ip,64),ipSrc:cut(T.ipSrc,60)});}catch(e){}push('session',{event:'ip',ip:T.ip,src:T.ipSrc});});
  T.timer=setInterval(beat,TICK);
  T.flushTimer=setInterval(flush,FLUSH);
  beat();
}
window.TEL={
  log:push,flush,
  info:()=>({sid:T.sid,ip:T.ip,ipSrc:T.ipSrc,activeMs:T.activeMs,totalMs:T.totalMs,views:T.views,acts:T.acts}),
  end:()=>{T.ended=true;beat();flush();}
};
document.addEventListener('auth-ready',e=>begin(e.detail.user,e.detail.profile));
try{if(window.Auth&&Auth.user()&&Auth.profile())begin(Auth.user(),Auth.profile());}catch(e){}
})();
