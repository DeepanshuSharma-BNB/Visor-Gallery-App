'use strict';

/* Meta Ray-Ban Display controls, per Meta's Web Apps device guidance:
 * - Directional swipe emits ArrowLeft/Right/Up/Down.
 * - Discrete index pinch emits Enter.
 * - Pinch-and-move emits Pointer Events when body has touch-action:none
 *   in the initial stylesheet. A distinct wrist rotation angle is not exposed.
 */
const $=VISOR.$;
const stage=$('glass'),photo=$('photo'),pair=$('pair-screen'),waiting=$('waiting');
let connected=false,paired=false,items=[],current=0,currentCode='';
let zoom=1,panX=0,panY=0,activePointer=null,toastTimeout=null;
const Z_MIN=1,Z_MAX=5;

function notice(message){
  const n=$('notice');n.textContent=message;n.classList.remove('hidden');
  clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>n.classList.add('hidden'),2400);
}
function resetView(){
  zoom=1;panX=0;panY=0;paintTransform();
}
function paintTransform(){
  const bounds=stage.getBoundingClientRect();
  const limitX=(zoom-1)*bounds.width*.5,limitY=(zoom-1)*bounds.height*.5;
  panX=Math.max(-limitX,Math.min(limitX,panX));
  panY=Math.max(-limitY,Math.min(limitY,panY));
  photo.style.transform='translate3d('+panX.toFixed(1)+'px,'+panY.toFixed(1)+'px,0) scale('+zoom.toFixed(3)+')';
}
function changeZoom(next){
  zoom=Math.min(Z_MAX,Math.max(Z_MIN,next));
  if(zoom===1){panX=0;panY=0;}
  paintTransform();
}
function showPair(){
  resetView();photo.classList.remove('visible');photo.removeAttribute('src');
  pair.classList.remove('hidden');waiting.classList.add('hidden');
  $('code').textContent=currentCode?currentCode.slice(0,4)+' '+currentCode.slice(4,8)+' '+currentCode.slice(8):'···· ···· ····';
}
function showWaiting(){
  resetView();photo.classList.remove('visible');photo.removeAttribute('src');
  pair.classList.add('hidden');waiting.classList.remove('hidden');
}
function showPhoto(msg){
  const idx=msg.index;
  if(!Number.isInteger(idx)||idx<0||idx>=items.length||typeof msg.data!=='string'||!msg.data.startsWith('data:image/jpeg;base64,'))return;
  current=idx;resetView();
  photo.src=msg.data;photo.alt=items[idx].name||'Gallery image';
  pair.classList.add('hidden');waiting.classList.add('hidden');photo.classList.add('visible');
  try{stage.focus({preventScroll:true});}catch{}
}
function navigate(direction){
  if(!paired||!items.length)return;
  link.send({type:'navigate',direction});
}
const link=VISOR.connect(msg=>{
  switch(msg.type){
    case 'room':
      currentCode=msg.code;paired=false;
      $('glass-status').textContent='Ready to pair';showPair();break;
    case 'paired':
      paired=true;showWaiting();break;
    case 'gallery':
      items=Array.isArray(msg.items)?msg.items.slice(0,100):[];
      current=0;showWaiting();
      if(items.length)link.send({type:'request',index:0});
      break;
    case 'image':showPhoto(msg);break;
    case 'clear':items=[];showWaiting();break;
    case 'zoom':
      if(photo.classList.contains('visible')){
        if(msg.reset)changeZoom(1);
        else changeZoom(zoom+Math.max(-2,Math.min(2,Number(msg.step)||0))*.5);
      }
      break;
    case 'disconnected':
      paired=false;items=[];showPair();notice('Phone disconnected. Re-pair using the displayed code.');break;
    case 'error':notice(msg.message||'Connection problem');break;
  }
},state=>{
  connected=state==='online';
  if(connected){
    paired=false;items=[];currentCode='';
    $('glass-status').textContent='Preparing session…';showPair();link.send({type:'create'});
  }else{
    paired=false;items=[];showPair();$('glass-status').textContent='Reconnecting…';
  }
});

function keyAction(e){
  if(!photo.classList.contains('visible'))return;
  if(e.key==='ArrowLeft'){e.preventDefault();navigate(-1);}
  else if(e.key==='ArrowRight'){e.preventDefault();navigate(1);}
  else if(e.key==='ArrowUp'){e.preventDefault();changeZoom(zoom+.4);}
  else if(e.key==='ArrowDown'){e.preventDefault();changeZoom(zoom-.4);}
  else if(e.key==='Enter'||e.key===' '){e.preventDefault();changeZoom(zoom>1?1:2);}
  else if(e.key==='Escape'){e.preventDefault();changeZoom(1);}
}
window.addEventListener('keydown',keyAction,{passive:false});

function beginDrag(e){
  if(!photo.classList.contains('visible')||activePointer)return;
  if(e.button!==undefined&&e.button!==0)return;
  activePointer={id:e.pointerId,x:e.clientX,y:e.clientY,totalX:0,totalY:0,kind:null};
  try{stage.setPointerCapture(e.pointerId);}catch{}
}
function moveDrag(e){
  const p=activePointer;
  if(!p||p.id!==e.pointerId||!photo.classList.contains('visible'))return;
  const dx=Number.isFinite(e.movementX)&&e.movementX!==0?e.movementX:e.clientX-p.x;
  const dy=Number.isFinite(e.movementY)&&e.movementY!==0?e.movementY:e.clientY-p.y;
  p.x=e.clientX;p.y=e.clientY;
  p.totalX+=dx;p.totalY+=dy;
  if(!p.kind&&Math.hypot(p.totalX,p.totalY)>13){
    // Vertical pinch-and-move zooms. Horizontal pinch-and-move browses
    // at 1x and pans inside a magnified picture.
    p.kind=Math.abs(p.totalY)>=Math.abs(p.totalX)?'zoom':zoom>1.02?'pan':'browse';
  }
  if(p.kind==='zoom')changeZoom(zoom*Math.exp(-dy*.011));
  else if(p.kind==='pan'){panX+=dx;panY+=dy;paintTransform();}
  if(p.kind)e.preventDefault();
}
function endDrag(e,cancel=false){
  const p=activePointer;
  if(!p||p.id!==e.pointerId)return;
  if(!cancel&&p.kind==='browse'&&Math.abs(p.totalX)>55&&Math.abs(p.totalX)>1.25*Math.abs(p.totalY))
    navigate(p.totalX<0?1:-1);
  activePointer=null;
  try{stage.releasePointerCapture(e.pointerId);}catch{}
}
stage.addEventListener('pointerdown',beginDrag);
stage.addEventListener('pointermove',moveDrag,{passive:false});
stage.addEventListener('pointerup',e=>endDrag(e));
stage.addEventListener('pointercancel',e=>endDrag(e,true));
stage.addEventListener('lostpointercapture',e=>endDrag(e,true));

window.addEventListener('resize',paintTransform);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&activePointer)activePointer=null;});
window.addEventListener('pagehide',()=>{photo.removeAttribute('src');link.close();});
showPair();