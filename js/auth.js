/* js/auth.js — email/password gate with admin approval (no Google, no free access)
   Load after firebase-app-compat, firebase-auth-compat, firebase-database-compat.
   Usage: Auth.start(function(user,profile){ ... });  Auth.isAdmin(); Auth.isApproved(); */
(function(){
  const CFG={
    apiKey:"AIzaSyCUL7DTytCGPc9jDF49GRLS0DznsZoiomM",
    authDomain:"name-label.firebaseapp.com",
    databaseURL:"https://name-label-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId:"name-label",
    storageBucket:"name-label.firebasestorage.app",
    messagingSenderId:"520022563247",
    appId:"1:520022563247:web:9a7867b8ec843185ceb75a"
  };
  if(!firebase.apps.length)firebase.initializeApp(CFG);
  const auth=firebase.auth(),db=firebase.database();
  let started=false,startFn=null,profile=null,profileRef=null,reqName='',booting=false;

  const st=document.createElement('style');
  st.textContent=`
  #authGate{position:fixed;inset:0;z-index:30000;background:#f3f7fc;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue","PingFang TC","PingFang HK","Microsoft JhengHei","Noto Sans TC",Helvetica,Arial,sans-serif;color:#10233c}
  #authGate .ag-card{width:min(410px,100%);background:#fff;border:1px solid #dce7f4;border-radius:14px;padding:28px;box-shadow:0 18px 50px rgba(16,44,78,.14)}
  #authGate .ag-mark{width:38px;height:38px;border-radius:10px;background:#0a66d0;color:#fff;display:grid;place-items:center;margin-bottom:14px}
  #authGate .ag-mark.warn{background:#fdf3df;color:#966712;border:1px solid #ecd9ab}
  #authGate .ag-mark.bad{background:#fdecec;color:#c23b3b;border:1px solid #f0c4c4}
  #authGate h2{margin:0 0 4px;font-size:19px;font-weight:600;letter-spacing:-.01em}
  #authGate p.sub{margin:0 0 18px;font-size:13px;color:#5c7492;line-height:1.6}
  #authGate label{display:block;font-size:12px;font-weight:500;color:#5c7492;margin:0 0 5px}
  #authGate input{width:100%;box-sizing:border-box;font-size:15px;font-family:inherit;color:#10233c;background:#fff;border:1px solid #c4d6ea;border-radius:8px;padding:10px 14px;min-height:44px;outline:none;margin-bottom:14px;transition:border-color .15s,box-shadow .15s}
  #authGate input:focus{border-color:#0a66d0;box-shadow:0 0 0 3px rgba(10,102,208,.18)}
  #authGate button{font-family:inherit;font-size:14px;font-weight:500;border:1px solid transparent;border-radius:8px;padding:11px 18px;min-height:44px;cursor:pointer;background:#0a66d0;color:#fff;width:100%;transition:background .15s}
  #authGate button:hover{background:#0851a8}
  #authGate button:disabled{opacity:.5;pointer-events:none}
  #authGate .ag-err{margin:12px 0 0;font-size:12.5px;color:#c23b3b;min-height:18px;line-height:1.5}
  #authGate .ag-ok{color:#177a4c}
  #authGate .ag-foot{margin-top:16px;padding-top:14px;border-top:1px solid #e9f0f9;font-size:12px;color:#8ea4bf;line-height:1.6}
  #authGate .ag-row{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:10px}
  #authGate .ag-link{background:none;border:0;color:#0851a8;font-size:12.5px;padding:0;min-height:0;width:auto;cursor:pointer}
  #authGate .ag-link:hover{background:none;text-decoration:underline}
  #authGate .ag-spin{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:agspin .7s linear infinite;vertical-align:-2px;margin-right:8px}
  @keyframes agspin{to{transform:rotate(360deg)}}
  #authGate .ag-info{background:#f7faff;border:1px solid #dce7f4;border-radius:8px;padding:12px 14px;font-size:12.5px;color:#28425f;line-height:1.6;margin-bottom:14px}
  #authBar{display:inline-flex;align-items:center;gap:8px;flex:none}
  #authBar .ab-mail{font-size:11.5px;color:#5c7492;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #authBar .ab-role{font-size:10.5px;padding:2px 8px;border-radius:999px;border:1px solid #bfe3cf;background:#e6f5ed;color:#177a4c;white-space:nowrap}
  #authBar .ab-role.staff{border-color:#c4d6ea;background:#edf3fb;color:#5c7492}
  #authBar button{font-family:inherit;font-size:12.5px;font-weight:500;border:1px solid #c4d6ea;background:#edf3fb;color:#28425f;border-radius:6px;padding:5px 11px;min-width:0;cursor:pointer;width:auto;min-height:0}
  #authBar button:hover{background:#e2ecf8}
  body.auth-locked .wrap,body.auth-locked .admin-wrap,body.auth-locked .remote-wrap,body.auth-locked .station-trigger,body.auth-locked .admin-shell,body.auth-locked main{visibility:hidden}
  `;
  document.head.appendChild(st);

  const gate=document.createElement('div');gate.id='authGate';
  const mount=()=>document.body.appendChild(gate);
  if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount);

  const MARK='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h7l11 11-7 7L3 10V3z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>';
  const CLOCK='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  const BAN='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>';
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function screen(html){gate.innerHTML='<div class="ag-card">'+html+'</div>';gate.style.display='flex';}
  const MSG={'auth/invalid-email':'電郵格式不正確。','auth/user-not-found':'找不到帳戶。','auth/wrong-password':'密碼錯誤。','auth/invalid-credential':'電郵或密碼錯誤。','auth/invalid-login-credentials':'電郵或密碼錯誤。','auth/email-already-in-use':'此電郵已登記，請直接登入或聯絡管理員。','auth/weak-password':'密碼至少 6 個字元。','auth/too-many-requests':'嘗試次數過多，請稍後再試。','auth/network-request-failed':'網絡連線失敗。','auth/operation-not-allowed':'未啟用電郵密碼登入，請到 Firebase Console 開啟。'};
  const errText=x=>MSG[x&&x.code]||('失敗：'+((x&&x.code)||(x&&x.message)||x));

  function showSignin(msg){
    screen('<div class="ag-mark">'+MARK+'</div><h2>登入 Sign in</h2><p class="sub">家長標籤及考勤系統 · 只限已批准帳戶。</p>'
      +'<label>Email 電郵</label><input id="agE" type="email" autocomplete="username" placeholder="you@school.edu.hk">'
      +'<label>Password 密碼</label><input id="agP" type="password" autocomplete="current-password">'
      +'<button id="agB">Sign in 登入</button><p class="ag-err'+(msg&&msg.ok?' ag-ok':'')+'">'+esc(msg&&msg.text||'')+'</p>'
      +'<div class="ag-row"><button class="ag-link" id="agReq">申請帳戶 Request access</button><button class="ag-link" id="agF">忘記密碼</button></div>'
      +'<div class="ag-foot">新帳戶須由管理員喺 Admin → Users 批准後先可以登入使用。</div>');
    const $=id=>document.getElementById(id);
    const go=async()=>{const e=$('agE').value.trim(),p=$('agP').value;if(!e||!p){$('agR')||0;return setErr('請輸入電郵及密碼。');}
      $('agB').disabled=true;$('agB').innerHTML='<span class="ag-spin"></span>處理中…';
      try{await auth.signInWithEmailAndPassword(e,p);}catch(x){showSignin({text:errText(x)});}};
    const setErr=t=>{const el=document.querySelector('#authGate .ag-err');if(el){el.textContent=t;el.className='ag-err';}};
    $('agB').onclick=go;
    $('agReq').onclick=showRequest;
    $('agF').onclick=()=>{const e=$('agE').value.trim();if(!e)return setErr('請先輸入電郵，再按忘記密碼。');
      auth.sendPasswordResetEmail(e).then(()=>showSignin({text:'已發送重設密碼電郵至 '+e,ok:true})).catch(x=>setErr(errText(x)));};
    gate.onkeydown=e=>{if(e.key==='Enter')go();};
    setTimeout(()=>{const el=$('agE');if(el)el.focus();},40);
  }

  function showRequest(){
    screen('<div class="ag-mark">'+MARK+'</div><h2>申請帳戶 Request access</h2><p class="sub">提交後帳戶狀態為「待批准」，管理員批准後方可使用。</p>'
      +'<label>Name 姓名</label><input id="agN" type="text" autocomplete="name" placeholder="e.g. Chan Tai Man">'
      +'<label>Email 電郵</label><input id="agE" type="email" autocomplete="username" placeholder="you@school.edu.hk">'
      +'<label>Password 密碼</label><input id="agP" type="password" autocomplete="new-password" placeholder="至少 6 個字元">'
      +'<button id="agB">Submit request 提交申請</button><p class="ag-err"></p>'
      +'<div class="ag-row"><button class="ag-link" id="agBack">已有帳戶？返回登入</button></div>'
      +'<div class="ag-foot">第一個完成設定嘅帳戶會成為管理員；其後所有申請一律待批准。</div>');
    const $=id=>document.getElementById(id);
    const setErr=t=>{const el=document.querySelector('#authGate .ag-err');if(el){el.textContent=t;el.className='ag-err';}};
    const go=async()=>{const n=$('agN').value.trim(),e=$('agE').value.trim(),p=$('agP').value;
      if(!n||!e||!p)return setErr('請填寫姓名、電郵及密碼。');
      if(p.length<6)return setErr('密碼至少 6 個字元。');
      $('agB').disabled=true;$('agB').innerHTML='<span class="ag-spin"></span>提交中…';reqName=n;
      try{await auth.createUserWithEmailAndPassword(e,p);}catch(x){reqName='';showRequest();setErr(errText(x));}};
    $('agB').onclick=go;$('agBack').onclick=()=>showSignin();
    gate.onkeydown=e=>{if(e.key==='Enter')go();};
    setTimeout(()=>{const el=$('agN');if(el)el.focus();},40);
  }

  function showPending(u,p){
    screen('<div class="ag-mark warn">'+CLOCK+'</div><h2>等待批准 Pending approval</h2>'
      +'<p class="sub">你嘅帳戶已建立，但管理員未批准。批准後此頁會自動解鎖。</p>'
      +'<div class="ag-info"><b>'+esc(p.name||u.email)+'</b><br>'+esc(u.email)+'<br>狀態：待批准 Pending</div>'
      +'<button id="agCheck">Check again 重新檢查</button><p class="ag-err"></p>'
      +'<div class="ag-row"><button class="ag-link" id="agOut">登出 Sign out</button></div>'
      +'<div class="ag-foot">請聯絡管理員到 Admin → Users 批准你嘅帳戶。</div>');
    document.getElementById('agCheck').onclick=async()=>{const s=await db.ref('users/'+u.uid).once('value');const pp=s.val();if(pp)applyProfile(u,pp);};
    document.getElementById('agOut').onclick=()=>auth.signOut();
  }

  function showRejected(u,p){
    screen('<div class="ag-mark bad">'+BAN+'</div><h2>未獲批准 Not approved</h2>'
      +'<p class="sub">此帳戶嘅存取申請已被拒絕或停用。</p>'
      +'<div class="ag-info"><b>'+esc(p.name||u.email)+'</b><br>'+esc(u.email)+'<br>狀態：已拒絕 Rejected</div>'
      +'<div class="ag-row"><button class="ag-link" id="agOut">登出 Sign out</button></div>'
      +'<div class="ag-foot">如有疑問，請聯絡系統管理員。</div>');
    document.getElementById('agOut').onclick=()=>auth.signOut();
  }

  function showLoading(){
    screen('<div class="ag-mark">'+MARK+'</div><h2>載入中 Loading…</h2><p class="sub">正在確認帳戶權限。</p><button disabled><span class="ag-spin"></span>請稍候</button>');
  }

  async function ensureProfile(u){
    const ref=db.ref('users/'+u.uid);
    const snap=await ref.once('value');
    if(snap.exists())return snap.val();
    const base={email:u.email||'',name:reqName||u.displayName||(u.email||'').split('@')[0],createdAt:Date.now()};
    try{const p=Object.assign({},base,{status:'approved',role:'admin'});await ref.set(p);return p;}
    catch(e){const p=Object.assign({},base,{status:'pending',role:'staff'});await ref.set(p);return p;}
  }

  function bar(u,p){
    const tb=document.querySelector('.topbar')||document.querySelector('.portal-nav');if(!tb)return;
    let b=document.getElementById('authBar');
    if(!b){b=document.createElement('span');b.id='authBar';tb.appendChild(b);}
    const admin=p.role==='admin';
    b.innerHTML='<span class="ab-role'+(admin?'':' staff')+'">'+(admin?'Admin':'Staff')+'</span><span class="ab-mail" title="'+esc(u.email||'')+'">'+esc(u.email||'')+'</span><button id="abOut" type="button">登出</button>';
    document.getElementById('abOut').onclick=()=>auth.signOut();
  }

  function applyProfile(u,p){
    profile=p;
    if(p.status==='approved'){
      gate.style.display='none';document.body.classList.remove('auth-locked');bar(u,p);
      if(!started&&typeof startFn==='function'){started=true;try{startFn(u,p);}catch(e){console.error(e);}}
    }else if(p.status==='rejected'){
      document.body.classList.add('auth-locked');showRejected(u,p);
      if(started)setTimeout(()=>location.reload(),1200);
    }else{
      document.body.classList.add('auth-locked');showPending(u,p);
      if(started)setTimeout(()=>location.reload(),1200);
    }
  }

  auth.onAuthStateChanged(async u=>{
    if(profileRef){profileRef.off();profileRef=null;}
    if(!u){profile=null;started=false;document.body.classList.add('auth-locked');const b=document.getElementById('authBar');if(b)b.remove();showSignin();return;}
    if(booting)return;booting=true;showLoading();
    try{
      const p=await ensureProfile(u);reqName='';
      applyProfile(u,p);
      profileRef=db.ref('users/'+u.uid);
      profileRef.on('value',s=>{const pp=s.val();if(pp)applyProfile(u,pp);});
    }catch(e){showSignin({text:'無法讀取帳戶權限：'+(e.message||e)});try{await auth.signOut();}catch(_){}}
    booting=false;
  });

  window.Auth={
    auth,db,cfg:CFG,
    root:()=>db.ref('parents'),
    user:()=>auth.currentUser,
    profile:()=>profile,
    isAdmin:()=>!!profile&&profile.role==='admin'&&profile.status==='approved',
    isApproved:()=>!!profile&&profile.status==='approved',
    start(fn){startFn=fn;if(auth.currentUser&&profile&&profile.status==='approved'&&!started){started=true;fn(auth.currentUser,profile);}},
    signOut:()=>auth.signOut()
  };
})();
