// js/label-layout.js
(function(){
  const MM=96/25.4;
  const DEF={
    version:2,
    driver:{w:60,h:60},
    physical:{w:60,h:40},
    offset:{x:0,y:-20},
    boxes:[
      {id:'en',x:2,y:24,w:56,h:6,text:'Parent of {class} {classNo} {nameEn}',size:12,weight:600,align:'center',valign:'middle',color:'#000000',lineHeight:1.2},
      {id:'zh',x:2,y:31,w:56,h:13,text:'{nameZh}家長',size:30,weight:600,align:'center',valign:'middle',color:'#000000',lineHeight:1.15}
    ],
    sample:{cls:'3A',classNo:'15',nameEn:'CHAN TAI MAN',nameZh:'陳大文',cardId:'0001234567'}
  };
  const PLACEHOLDERS=[['class','班別'],['classNo','班號'],['nameEn','英文名'],['nameZh','中文名'],['cardId','卡號'],['parent','中文家長'],['parentEn','英文家長'],['date','日期'],['time','時間']];
  const clone=o=>JSON.parse(JSON.stringify(o));
  const num=(v,d)=>{const n=parseFloat(v);return Number.isFinite(n)?n:d;};
  function norm(l){
    const b=clone(DEF);
    if(!l||typeof l!=='object')return b;
    b.driver={w:num(l.driver&&l.driver.w,60),h:num(l.driver&&l.driver.h,60)};
    b.physical={w:num(l.physical&&l.physical.w,60),h:num(l.physical&&l.physical.h,40)};
    b.offset={x:num(l.offset&&l.offset.x,0),y:num(l.offset&&l.offset.y,-20)};
    if(Array.isArray(l.boxes))b.boxes=l.boxes.map((x,i)=>({
      id:String(x.id||('b'+i)),x:num(x.x,0),y:num(x.y,0),w:num(x.w,20),h:num(x.h,8),
      text:x.text==null?'':String(x.text),size:num(x.size,16),weight:num(x.weight,600),
      align:['left','center','right'].includes(x.align)?x.align:'center',
      valign:['top','middle','bottom'].includes(x.valign)?x.valign:'middle',
      color:/^#[0-9a-fA-F]{6}$/.test(x.color||'')?x.color:'#000000',lineHeight:num(x.lineHeight,1.2)
    }));
    b.sample=Object.assign({},DEF.sample,l.sample||{});
    b.updatedAt=l.updatedAt||0;
    return b;
  }
  function fill(tpl,s){
    s=s||{};
    const cls=s.cls||s.class||'',no=s.classNo||s.no||'',en=s.nameEn||'',zh=s.nameZh||'',card=s.cardId||'';
    const map={class:cls,cls:cls,classNo:no,no:no,nameEn:en,nameZh:zh,cardId:card,
      parent:zh?zh+'家長':'',parentEn:'Parent of '+[cls,no,en].filter(x=>x&&String(x).trim()).join(' '),
      date:new Date().toLocaleDateString('en-GB'),time:new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})};
    return String(tpl==null?'':tpl).replace(/\{([a-zA-Z]+)\}/g,(m,k)=>map[k]!=null?String(map[k]):m);
  }
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const justify=v=>v==='top'?'flex-start':v==='bottom'?'flex-end':'center';
  function boxCss(b){return `left:${b.x}mm;top:${b.y}mm;width:${b.w}mm;height:${b.h}mm;font-size:${b.size}px;font-weight:${b.weight};text-align:${b.align};color:${b.color};line-height:${b.lineHeight};justify-content:${justify(b.valign)};`;}
  function stageHTML(l,data){
    const boxes=(l.boxes||[]).map(b=>`<div class="lb" style="${boxCss(b)}">${esc(fill(b.text,data)).replace(/\n/g,'<br>')}</div>`).join('');
    return `<div class="label-stage" style="width:${l.driver.w}mm;height:${l.driver.h}mm;transform:translate(${l.offset.x}mm,${l.offset.y}mm)">${boxes}</div>`;
  }
  function printCss(l){
    return `#printArea{display:none}
@media print{
@page{size:${l.driver.w}mm ${l.driver.h}mm;margin:0}
html,body{margin:0!important;padding:0!important;background:#fff!important;height:auto!important;min-height:0!important}
body>*:not(#printArea){display:none!important}
#printArea{display:block!important;position:relative!important;left:auto!important;top:auto!important;transform:none!important;margin:0!important;padding:0!important;width:${l.driver.w}mm!important;height:${l.driver.h}mm!important;overflow:hidden!important;background:#fff!important;color:#000}
#printArea .label-stage{position:absolute;left:0;top:0}
#printArea .lb{position:absolute;display:flex;flex-direction:column;overflow:hidden;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;font-family:'Microsoft JhengHei','微軟正黑體','Noto Sans TC','PingFang HK',sans-serif}
}`;
  }
  window.LabelLayout={MM,DEF,PLACEHOLDERS,clone,norm,fill,esc,stageHTML,printCss};
})();
