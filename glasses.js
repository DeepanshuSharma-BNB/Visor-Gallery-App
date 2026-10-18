'use strict';
const $=VISOR.$;
let online=false, paired=false, items=[], active=0, playing=false, interval=null, controlsHidden=false, connection, currentCode='';
let noticeTimer=null,zoom=1,activeMode='image',videoObjectURL=null;
const movie=$('movie'),embed=$('embed');
function clearMedia(){
  movie.pause();movie.removeAttribute('src');movie.load();movie.classList.add('hidden');
  if(videoObjectURL){URL.revokeObjectURL(videoObjectURL);videoObjectURL=null;}
  embed.src='about:blank';embed.classList.add('hidden');activeMode='image';
}
function zoomBy(step,reset=false){
  if(activeMode!=='image')return;
  zoom=reset?1:Math.max(1,Math.min(5,Math.round((zoom+step*.5)*10)/10));
  image.style.transform='scale('+zoom+')';toast(zoom.toFixed(1)+'× zoom');
}
function decodeLink(raw){
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.href.length>2000)throw Error('Only public HTTPS URLs are supported.');
  const host=url.hostname.toLowerCase(),path=url.pathname;
  if(['youtu.be','www.youtu.be'].includes(host)){
    const id=path.split('/')[1];if(!/^[\w-]{11}$/.test(id))throw Error('Invalid YouTube URL.');
    return {kind:'embed',src:'https://www.youtube-nocookie.com/embed/'+id+'?playsinline=1'};
  }
  if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','www.youtube-nocookie.com'].includes(host)){
    let id=url.searchParams.get('v');
    if(!id && /^\/(shorts|live|embed)\//.test(path))id=path.split('/')[2];
    if(!/^[\w-]{11}$/.test(id||''))throw Error('Please provide an individual YouTube video URL.');
    return {kind:'embed',src:'https://www.youtube-nocookie.com/embed/'+id+'?playsinline=1'};
  }
  if(['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(host)){
    const id=path.match(/\/(?:video\/)?(\d+)/)?.[1];
    if(!id)throw Error('Invalid Vimeo URL.');
    return {kind:'embed',src:'https://player.vimeo.com/video/'+id};
  }
  if(['x.com','www.x.com','twitter.com','www.twitter.com','mobile.twitter.com'].includes(host)){
    const id=path.match(/\/status\/(\d{8,22})/)?.[1];
    if(!id)throw Error('Please provide an individual X post URL.');
    return {kind:'embed',src:'https://platform.twitter.com/embed/Tweet.html?id='+id+'&theme=dark'};
  }
  if(/\.(mp4|webm|ogg|ogv|m4v)$/i.test(path))return {kind:'video',src:url.href};
  return {kind:'embed',src:url.href,unknown:true};
}
function showInternetVideo(raw){
  let info;try{info=decodeLink(raw);}catch(e){toast(e.message);return;}
  stopPlay();clearMedia();image.classList.remove('visible');screen.classList.add('hidden');waiting.classList.add('hidden');bottom.classList.remove('hidden');
  $('photo-name').textContent='Internet video';$('glass-count').textContent='Online';
  if(info.kind==='video'){activeMode='video';movie.src=info.src;movie.classList.remove('hidden');movie.load();movie.play().catch(()=>toast('Select Play to start video.'));}
  else{activeMode='embed';embed.src=info.src;embed.classList.remove('hidden');if(info.unknown)toast('This website may block embedded playback.');}
  status('● Video');
}
const root=$('glass'), image=$('photo'), screen=$('pair-screen'), waiting=$('waiting'), bottom=$('glass-bottom');
function status(t){$('glass-status').textContent=t;}
function toast(message){
  $('notice').textContent=message;$('notice').classList.remove('hidden');
  clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').classList.add('hidden'),2500);
}
function showPair(){
  clearMedia();zoom=1;image.style.transform='scale(1)';
  screen.classList.remove('hidden');waiting.classList.add('hidden');image.classList.remove('visible');image.removeAttribute('src');bottom.classList.add('hidden');
  $('code').textContent=currentCode?currentCode.slice(0,4)+' '+currentCode.slice(4,8)+' '+currentCode.slice(8):'···· ···· ····';
}
function showWait(){
  clearMedia();
  screen.classList.add('hidden');waiting.classList.remove('hidden');image.classList.remove('visible');image.removeAttribute('src');bottom.classList.add('hidden');
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
  clearMedia();zoom=1;image.style.transform='scale(1)';
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
    case 'video_link':showInternetVideo(msg.url);break;
    case 'video_command':
      if(activeMode==='video'){
        if(msg.action==='seek'&&Number.isFinite(msg.seconds))movie.currentTime=Math.max(0,Math.min(movie.duration||1e9,movie.currentTime+Math.max(-30,Math.min(30,msg.seconds))));
        else if(msg.action==='toggle'){movie.paused?movie.play().catch(()=>{}):movie.pause();}
      }
      break;
    case 'video_progress':
      if(msg.total){showWait();waiting.textContent='Receiving encrypted video… '+Math.round(100*msg.bytes/msg.total)+'%';}
      break;
    case 'video_ready':
      clearMedia();videoObjectURL=URL.createObjectURL(msg.blob);activeMode='video';
      screen.classList.add('hidden');waiting.classList.add('hidden');image.classList.remove('visible');
      movie.src=videoObjectURL;movie.classList.remove('hidden');movie.load();movie.play().catch(()=>toast('Press Play to watch the video.'));
      bottom.classList.remove('hidden');$('photo-name').textContent=msg.name||'Video';$('glass-count').textContent='Local video';
      status('● Video');break;
    case 'zoom':zoomBy(Number(msg.step)||0,!!msg.reset);break;
    case 'direct':if(msg.available)toast('Direct encrypted video channel ready');break;
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
$('pause').onclick=()=>activeMode==='video'?(movie.paused?movie.play().catch(()=>{}):movie.pause()):play(!playing);
window.addEventListener('keydown',e=>{
  const tag=document.activeElement?.tagName;
  if(e.key==='ArrowLeft'){e.preventDefault();if(activeMode==='video')movie.currentTime=Math.max(0,movie.currentTime-10);else move(-1);}
  else if(e.key==='ArrowRight'){e.preventDefault();if(activeMode==='video')movie.currentTime=Math.min(movie.duration||1e9,movie.currentTime+10);else move(1);}
  else if(e.key==='ArrowUp'){e.preventDefault();zoomBy(1);}
  else if(e.key==='ArrowDown'){e.preventDefault();zoomBy(-1);}
  else if((e.key==='Enter'||e.key===' ')&&tag!=='BUTTON'){e.preventDefault();if(activeMode==='video'){movie.paused?movie.play().catch(()=>{}):movie.pause();}else if(activeMode==='image')play(!playing);}
  else if(e.key==='Escape'||e.key==='Backspace'){if(playing){e.preventDefault();stopPlay();}}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)stopPlay();});
window.addEventListener('pagehide',()=>{stopPlay();clearMedia();connection.close();});
showPair();