/* js/label-layout.js — doc + hide model; effective area = doc - hide (only area drawn) */
(function(){
  const MM=96/25.4;
  const DEF={version:4,mode:'simple',doc:{w:60,h:60},hide:{top:20,left:0},
    simple:{topMm:6,sideMm:2,enSize:12,zhSize:30,gapMm:1.5,enText:'Parent of {class} {classNo} {nameEn}',zhText:'{nameZh}家長'},
    boxes:[
      {id:'en',x:2,y:4,w:56,h:6,text:'Parent of {class} {classNo} {nameEn}',size:12,weight:600,align:'center',valign:'middle',color:'#000000',lineHeight:1.2},
      {id:'zh',x:2,y:11,w:56,h:13,text:'{nameZh}家長',size:30,weight:600,align:'center',valign:'middle',color:'#000000',lineHeight:1.15}],
    sample:{cls:'3A',classNo:'15',nameEn:'CHAN TAI MAN',nameZh:'陳大文',cardId:'0001234567'}};
  const PH=[['class','班別'],['classNo','班號'],['nameEn','英文名'],['nameZh','中文名'],['cardId','卡號'],['parent','中文家長'],['parentEn','英文家長'],['date','日期'],['time','時間']];
  const clone=o=>JSON.parse(JSON.stringify(o));
  const num=(v,d)=>{const n=parseFloat(v);return Number.isFinite(n)?n:d;};
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nb=(x,i)=>({id:String(x.id||('b'+i)),x:num(x.x,0),y:num(x.y,0),w:num(x.w,20),h:num(x.h,8),text:x.text==null?'':String(x.text),size:num(x.size,16),weight:num(x.weight,600),align:['left','center','right'].includes(x.align)?x.align:'center',valign:['top','middle','bottom'].includes(x.valign)?x.valign:'middle',color:/^#[0-9a-fA-F]{6}$/.test(x.color||'')?x.color:'#000000',lineHeight:num(x.lineHeight,1.2)});
  function eff(l){return{x:l.hide.left,y:l.hide.top,w:Math.max(1,l.doc.w-l.hide.left),h:Math.max(1,l.doc.h-l.hide.top)};}
  function norm(l){
    const b=clone(DEF);if(!l||typeof l!=='object')return b;
    b.mode=l.mode==='designer'?'designer':'simple';
    if(l.doc&&l.hide){b.doc={w:num(l.doc.w,60),h:num(l.doc.h,60)};b.hide={top:Math.max(0,num(l.hide.top,20)),left:Math.max(0,num(l.hide.left,0))};}
    else if(l.label&&typeof l.label==='object'){const bt=Math.max(0,num(l.blankTop,20)),bl=Math.max(0,num(l.blankLeft,0));b.doc={w:num(l.label.w,60)+bl,h:num(l.label.h,40)+bt};b.hide={top:bt,left:bl};}
    else if(l.driver&&l.physical){const ox=num(l.offset&&l.offset.x,0),oy=num(l.offset&&l.offset.y,-20);
      b.doc={w:num(l.driver.w,60),h:num(l.driver.h,60)};b.hide={top:Math.max(0,-oy),left:Math.max(0,-ox)};
      b.simple=Object.assign({},DEF.simple,l.simple||{});b.simple.topMm=num(b.simple.topMm,26)+oy;b.simple.sideMm=num(b.simple.sideMm,2)+ox;
      if(Array.isArray(l.boxes))b.boxes=l.boxes.map((x,i)=>{const t=nb(x,i);t.x+=ox;t.y+=oy;return t;});
      b.sample=Object.assign({},DEF.sample,l.sample||{});return b;}
    b.simple=Object.assign({},DEF.simple,l.simple||{});
    ['topMm','sideMm','enSize','zhSize','gapMm'].forEach(k=>b.simple[k]=num(b.simple[k],DEF.simple[k]));
    if(Array.isArray(l.boxes))b.boxes=l.boxes.map(nb);
    b.sample=Object.assign({},DEF.sample,l.sample||{});return b;}
  function fill(t,s){s=s||{};
    const cls=s.cls||s.class||'',no=s.classNo||s.no||'',en=s.nameEn||'',zh=s.nameZh||'',card=s.cardId||'';
    const m={class:cls,cls:cls,no:no,classNo:no,nameEn:en,nameZh:zh,cardId:card,parent:zh?zh+'家長':'',parentEn:'Parent of '+[cls,no,en].filter(Boolean).join(' '),date:new Date().toLocaleDateString('en-GB'),time:new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})};
    return String(t==null?'':t).replace(/\{([a-zA-Z]+)\}/g,(x,k)=>m[k]!=null?String(m[k]):x);}
  const just=v=>v==='top'?'flex-start':v==='bottom'?'flex-end':'center';
  function inner(l,d){
    if(l.mode==='simple'){const s=l.simple;return '<div class="simple-wrap" style="padding:'+s.topMm+'mm '+s.sideMm+'mm 0 '+s.sideMm+'mm"><div class="label-en" style="font-size:'+s.enSize+'px">'+esc(fill(s.enText,d))+'</div><div class="label-zh" style="font-size:'+s.zhSize+'px;margin-top:'+s.gapMm+'mm">'+esc(fill(s.zhText,d))+'</div></div>';}
    return (l.boxes||[]).map(b=>'<div class="lb" style="left:'+b.x+'mm;top:'+b.y+'mm;width:'+b.w+'mm;height:'+b.h+'mm;font-size:'+b.size+'px;font-weight:'+b.weight+';text-align:'+b.align+';color:'+b.color+';line-height:'+b.lineHeight+';justify-content:'+just(b.valign)+'">'+esc(fill(b.text,d)).replace(/\n/g,'<br>')+'</div>').join('');}
  function stageHTML(l,d,fp){const e=eff(l);return '<div class="label-stage" style="left:'+(fp?l.hide.left:0)+'mm;top:'+(fp?l.hide.top:0)+'mm;width:'+e.w+'mm;height:'+e.h+'mm">'+inner(l,d)+'</div>';}
  function printCss(l){
    return '#printArea{display:none}\n@media print{@page{size:'+l.doc.w+'mm '+l.doc.h+'mm;margin:0}\nhtml,body{margin:0!important;padding:0!important;background:#fff!important;height:auto!important;min-height:0!important}\nbody>*:not(#printArea){display:none!important}\n#printArea{display:block!important;position:relative!important;margin:0!important;padding:0!important;width:'+l.doc.w+'mm!important;height:'+l.doc.h+'mm!important;overflow:hidden!important;background:#fff!important;color:#000}\n#printArea .label-stage{position:absolute;overflow:hidden}\n#printArea .simple-wrap{display:flex;flex-direction:column;align-items:center;text-align:center;width:100%;height:100%;box-sizing:border-box;font-family:"Microsoft JhengHei","Noto Sans TC","PingFang HK",sans-serif}\n#printArea .label-en{font-weight:600;line-height:1.25;word-break:break-word;overflow-wrap:anywhere}\n#printArea .label-zh{font-weight:600;line-height:1.2;word-break:break-word;overflow-wrap:anywhere}\n#printArea .lb{position:absolute;display:flex;flex-direction:column;overflow:hidden;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;font-family:"Microsoft JhengHei","Noto Sans TC","PingFang HK",sans-serif}}';}
  function searchMatch(s,q){
    const t=String(q||'').split(/[\s,，、/\-]+/).filter(Boolean);if(!t.length)return false;
    const cls=String(s.cls||'').toLowerCase(),no=String(s.classNo||'').toLowerCase(),noS=no.replace(/^0+/,'')||no;
    const card=String(s.cardId||'').toLowerCase(),cardS=card.replace(/^0+/,'')||card;
    const en=String(s.nameEn||'').toLowerCase(),zh=String(s.nameZh||'').toLowerCase();
    const h=[en,zh,cls,no,noS,card,cardS,cls+no,cls+' '+no,cls+noS,cls+' '+noS,en+' '+zh,zh+' '+en];
    return t.every(x=>{if(h.some(y=>y.includes(x)))return true;if(/^\d+$/.test(x)){const z=x.replace(/^0+/,'')||x;return h.some(y=>y.includes(z));}return false;});}
  window.LL={MM,DEF,PH,PLACEHOLDERS:PH,clone,norm,fill,esc,eff,stageHTML,printCss,searchMatch};
})();
