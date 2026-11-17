/* js/label-layout.js — doc + hide model. Student ID is a first-class label variable. */
(function(){
const MM=96/25.4;
const DEF={version:6,mode:'simple',doc:{w:60,h:60},hide:{top:20,left:0},
 simple:{topMm:6,sideMm:2,enSize:12,zhSize:30,meetSize:11,gapMm:1.5,enText:'Parent of {class} {classNo} {nameEn}',zhText:'{nameZh}家長',meetText:'{meetTime} · {meetTeacher} · {meetRoom}'},
 boxes:[
  {id:'en',x:2,y:4,w:56,h:6,text:'Parent of {class} {classNo} {nameEn}',size:12,weight:600,align:'center',valign:'middle',color:'#000000',lineHeight:1.2},
  {id:'zh',x:2,y:11,w:56,h:13,text:'{nameZh}家長',size:30,weight:600,align:'center',valign:'middle',color:'#000000',lineHeight:1.15},
  {id:'meet',x:2,y:26,w:56,h:7,text:'{meetTime} · {meetTeacher} · {meetRoom}',size:11,weight:500,align:'center',valign:'middle',color:'#000000',lineHeight:1.25}],
 sample:{studentId:'20260001',cls:'3A',classNo:'15',nameEn:'CHAN TAI MAN',nameZh:'陳大文',cardId:'0001234567',meetTime:'15:30–15:45',meetTeacher:'陳老師',meetRoom:'204 室'}};
const PH=['studentId','class','classNo','nameEn','nameZh','cardId','parent','parentEn','meetTime','meetTeacher','meetRoom','meetLine','date','time'];
const clone=o=>JSON.parse(JSON.stringify(o));
const num=(v,d)=>{const n=parseFloat(v);return Number.isFinite(n)?n:d;};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nb=(x,i)=>({id:String(x.id||('b'+i)),x:num(x.x,0),y:num(x.y,0),w:num(x.w,20),h:num(x.h,8),text:x.text==null?'':String(x.text),size:num(x.size,16),weight:num(x.weight,600),align:['left','center','right'].includes(x.align)?x.align:'center',valign:['top','middle','bottom'].includes(x.valign)?x.valign:'middle',color:/^#[0-9a-fA-F]{6}$/.test(x.color||'')?x.color:'#000000',lineHeight:num(x.lineHeight,1.2)});
const eff=l=>({x:l.hide.left,y:l.hide.top,w:Math.max(1,l.doc.w-l.hide.left),h:Math.max(1,l.doc.h-l.hide.top)});
function norm(l){
 const b=clone(DEF);if(!l||typeof l!=='object')return b;
 b.mode=l.mode==='designer'?'designer':'simple';
 if(l.doc&&l.hide){b.doc={w:num(l.doc.w,60),h:num(l.doc.h,60)};b.hide={top:Math.max(0,num(l.hide.top,20)),left:Math.max(0,num(l.hide.left,0))};}
 else if(l.label&&typeof l.label==='object'){const bt=Math.max(0,num(l.blankTop,20)),bl=Math.max(0,num(l.blankLeft,0));b.doc={w:num(l.label.w,60)+bl,h:num(l.label.h,40)+bt};b.hide={top:bt,left:bl};}
 else if(l.driver&&l.physical){
  const ox=num(l.offset&&l.offset.x,0),oy=num(l.offset&&l.offset.y,-20);
  b.doc={w:num(l.driver.w,60),h:num(l.driver.h,60)};b.hide={top:Math.max(0,-oy),left:Math.max(0,-ox)};
  b.simple=Object.assign({},DEF.simple,l.simple||{});
  b.simple.topMm=num(b.simple.topMm,26)+oy;b.simple.sideMm=num(b.simple.sideMm,2)+ox;
  ['enSize','zhSize','meetSize','gapMm'].forEach(k=>b.simple[k]=num(b.simple[k],DEF.simple[k]));
  if(Array.isArray(l.boxes))b.boxes=l.boxes.map(nb);
  b.sample=Object.assign({},DEF.sample,l.sample||{});return b;}
 b.simple=Object.assign({},DEF.simple,l.simple||{});
 ['topMm','sideMm','enSize','zhSize','meetSize','gapMm'].forEach(k=>b.simple[k]=num(b.simple[k],DEF.simple[k]));
 ['enText','zhText','meetText'].forEach(k=>b.simple[k]=String(b.simple[k]==null?DEF.simple[k]:b.simple[k]));
 if(Array.isArray(l.boxes))b.boxes=l.boxes.map(nb);
 b.sample=Object.assign({},DEF.sample,l.sample||{});return b;}
const parts=s=>{s=s||{};return [s.meetTime,s.meetTeacher,s.meetRoom||s.meetPlace||s.meetLocation].map(x=>String(x==null?'':x).trim());};
const meetLine=s=>parts(s).filter(Boolean).join(' · ');
function fill(txt,s){
 s=s||{};
 const sid=String(s.studentId||s.sid||''),cls=s.cls||s.class||'',no=s.classNo||s.no||'',en=s.nameEn||'',zh=s.nameZh||'',card=s.cardId||'',p=parts(s),ml=p.filter(Boolean).join(' · ');
 const m={studentId:sid,sid:sid,class:cls,cls,no,classNo:no,nameEn:en,nameZh:zh,cardId:card,parent:zh?zh+'家長':'',parentEn:'Parent of '+[cls,no,en].filter(Boolean).join(' '),meetTime:p[0],meetTeacher:p[1],meetRoom:p[2],meetPlace:p[2],meetLocation:p[2],meetLine:ml,date:new Date().toLocaleDateString('en-GB'),time:new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})};
 return String(txt==null?'':txt).replace(/\{([a-zA-Z]+)\}/g,(x,k)=>m[k]!=null?String(m[k]):x);}
const just=v=>v==='top'?'flex-start':v==='bottom'?'flex-end':'center';
const blank=s=>!String(s||'').replace(/[·・.,，、\-–—\s\u3000]/g,'').length;
function inner(l,d){
 if(l.mode==='simple'){const s=l.simple,mt=fill(s.meetText,d);
  return '<div class="sw" style="padding:'+s.topMm+'mm '+s.sideMm+'mm 0 '+s.sideMm+'mm">'
   +'<div class="le" style="font-size:'+s.enSize+'px">'+esc(fill(s.enText,d))+'</div>'
   +'<div class="lz" style="font-size:'+s.zhSize+'px;margin-top:'+s.gapMm+'mm">'+esc(fill(s.zhText,d))+'</div>'
   +(blank(mt)?'':'<div class="lm" style="font-size:'+s.meetSize+'px;margin-top:'+s.gapMm+'mm">'+esc(mt)+'</div>')+'</div>';}
 return (l.boxes||[]).map(b=>{const tx=fill(b.text,d);if(/^meet/.test(b.id)&&blank(tx))return '';
  return '<div class="lb" style="left:'+b.x+'mm;top:'+b.y+'mm;width:'+b.w+'mm;height:'+b.h+'mm;font-size:'+b.size+'px;font-weight:'+b.weight+';text-align:'+b.align+';color:'+b.color+';line-height:'+b.lineHeight+';justify-content:'+just(b.valign)+'">'+esc(tx).replace(/\n/g,'<br>')+'</div>';}).join('');}
const stageHTML=(l,d,fp)=>{const e=eff(l);return '<div class="stage" style="left:'+(fp?l.hide.left:0)+'mm;top:'+(fp?l.hide.top:0)+'mm;width:'+e.w+'mm;height:'+e.h+'mm">'+inner(l,d)+'</div>';};
function printCss(l){
 return '#printArea{display:none}\n@media print{@page{size:'+l.doc.w+'mm '+l.doc.h+'mm;margin:0}\n'
 +'html,body{margin:0!important;padding:0!important;background:#fff!important;height:auto!important;min-height:0!important}\n'
 +'body>*:not(#printArea){display:none!important}\n'
 +'#printArea{display:block!important;position:relative!important;left:auto!important;top:auto!important;transform:none!important;margin:0!important;padding:0!important;width:'+l.doc.w+'mm!important;height:'+l.doc.h+'mm!important;overflow:hidden!important;background:#fff!important;color:#000}\n'
 +'#printArea .stage{position:absolute;overflow:hidden}\n'
 +'#printArea .sw{display:flex;flex-direction:column;align-items:center;text-align:center;width:100%;height:100%;box-sizing:border-box;font-family:"Microsoft JhengHei","Noto Sans TC","PingFang HK",sans-serif}\n'
 +'#printArea .le{font-weight:600;line-height:1.25;word-break:break-word;overflow-wrap:anywhere}\n'
 +'#printArea .lz{font-weight:600;line-height:1.2;word-break:break-word;overflow-wrap:anywhere}\n'
 +'#printArea .lm{font-weight:500;line-height:1.3;word-break:break-word;overflow-wrap:anywhere}\n'
 +'#printArea .lb{position:absolute;display:flex;flex-direction:column;overflow:hidden;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;font-family:"Microsoft JhengHei","Noto Sans TC","PingFang HK",sans-serif}}';}
function searchMatch(s,q){
 const tk=String(q||'').toLowerCase().split(/[\s,，、/\-]+/).filter(Boolean);if(!tk.length)return false;
 const sid=String(s.studentId||'').toLowerCase(),sidS=sid.replace(/^0+/,'')||sid;
 const cls=String(s.cls||'').toLowerCase(),no=String(s.classNo||'').toLowerCase(),noS=no.replace(/^0+/,'')||no;
 const card=String(s.cardId||'').toLowerCase(),cardS=card.replace(/^0+/,'')||card;
 const en=String(s.nameEn||'').toLowerCase(),zh=String(s.nameZh||'').toLowerCase(),p=parts(s).map(x=>x.toLowerCase());
 const h=[sid,sidS,en,zh,cls,no,noS,card,cardS,cls+no,cls+' '+no,cls+noS,cls+' '+noS,en+' '+zh,zh+' '+en,p[0],p[1],p[2],p.filter(Boolean).join(' ')];
 return tk.every(x=>{if(h.some(y=>y.includes(x)))return true;if(/^\d+$/.test(x)){const z=x.replace(/^0+/,'')||x;return h.some(y=>y.includes(z));}return false;});}
window.LL={MM,DEF,PH,PLACEHOLDERS:PH,clone,norm,fill,esc,eff,stageHTML,printCss,searchMatch,meetLine,parts};
})();
