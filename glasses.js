'use strict';
const $=VISOR.$;
let online=false, paired=false, items=[], active=0, playing=false, interval=null, controlsHidden=false, connection, currentCode='';
let noticeTimer=null;
const root=$('glass'), image=$('photo'), screen=$('pair-screen'), waiting=$('waiting'), bottom=$('glass-bottom');
function status(t){$('glass-status').textContent=t;}
function toast(message){
  $('notice').textContent=message;$('notice').classList.remove('hidden');
  clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').classList.add('hidden'),2500);
}
function showPair(){
  screen.classList.remove('hidden');waiting.classList.add('hidden');image.classList.remove('visible');bottom.classList.add('hidden');
  $('code').textContent=currentCode?currentCode.slice(0,4)+' '+currentCode.slice(4,8)+' '+currentCode.slice(8):'···· ···· ····';
}
function showWait(){
  screen.classList.add('hidden');waiting.classList.remove('hidden');image.classList.remove('visible');bottom.classList.add('hidden');
}
function stopPlay(){
  playing=false;clearInterval(interval);interval=null;$('pause').textContent='▶ Play';
  if(online&&paired)connection.send({type:'play_state',enabled:false});
}
function play(enabled){
  if(!items.length||!paired||document.hidden)enabled=false;
  clearInterval(interval);interval=null;playing=enabled;
  $('pause').textContent=playing?'Ⅱ Pause':'▶ Play';
  if(playing)interval=setInterval(()=>{if(items.length>1)move(1);},4000);
  if(online&&paired)connection.send({type:'play_state',enabled:playing});
}
function move(dir){if(items.length&&paired)connection.send({type:'navigate',direction:dir});}
function onPhoto(index,data){
  if(!items.length||index>=items.length||index<0)return;
  active=index;
  image.src=data;image.alt=items[index].name||'Selected photo';
  image.classList.add('visible');screen.classList.add('hidden');waiting.classList.add('hidden');bottom.classList.remove('hidden');
  $('photo-name').textContent=items[index].name;$('glass-count').textContent=(index+1)+' / '+items.length;
  status('● Live');
}
connection=VISOR.connect(msg=>{
  switch(msg.type){
    case 'room':currentCode=msg.code;showPair();status('● Ready');break;
    case 'paired':paired=true;status('● Paired');showWait();break;
    case 'gallery':
      items=Array.isArray(msg.items)?msg.items:[];active=0;stopPlay();
      if(items.length){showWait();connection.send({type:'request',index:0});}
      else showWait();break;
    case 'image':onPhoto(msg.index,msg.data);break;
    case 'clear':items=[];stopPlay();showWait();break;
    case 'play':play(msg.enabled);break;
    case 'disconnected':paired=false;items=[];stopPlay();showPair();status('● Ready');toast('Phone disconnected. Re-pair using this code.');break;
    case 'error':toast(msg.message||'Connection problem');break;
  }
},state=>{
  online=state==='online';
  if(online){paired=false;items=[];currentCode='';stopPlay();showPair();status('Connecting…');connection.send({type:'create'});}
  else {paired=false;items=[];stopPlay();showPair();status('○ Offline');}
});
$('back').onclick=()=>move(-1);
$('forward').onclick=()=>move(1);
$('pause').onclick=()=>play(!playing);
window.addEventListener('keydown',e=>{
  const tag=document.activeElement?.tagName;
  if(e.key==='ArrowLeft'){e.preventDefault();move(-1);}
  else if(e.key==='ArrowRight'){e.preventDefault();move(1);}
  else if(e.key==='ArrowUp'){e.preventDefault();controlsHidden=!controlsHidden;root.classList.toggle('is-hidden',controlsHidden);}
  else if(e.key==='ArrowDown'){e.preventDefault();controlsHidden=false;root.classList.remove('is-hidden');}
  else if((e.key==='Enter'||e.key===' ')&&tag!=='BUTTON'){e.preventDefault();play(!playing);}
  else if(e.key==='Escape'||e.key==='Backspace'){if(playing){e.preventDefault();stopPlay();}}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)stopPlay();});
window.addEventListener('pagehide',()=>{stopPlay();connection.close();});
showPair();