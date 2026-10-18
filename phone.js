'use strict';
const $=VISOR.$,photos=[];
let current=0,paired=false,online=false,processing=false,lastCode='',peerReady=false;
const preview=$('now'),grid=$('grid'),toast=$('toast');
function message(text,isError=false){
  toast.textContent=text;toast.className=text?'control-alert'+(isError?' error':''):'';
}
function pairingStatus(){
  $('status-pill').textContent=paired?'● Connected':online?'● Ready to pair':'○ Reconnecting';
  $('status-pill').className='connection-tag'+(paired?' connected':'');
  $('pair-btn').disabled=!online||paired;
  $('pair-status').textContent=paired?'Your glasses are connected. Choose a picture.':online?'Enter the code from the glasses.':'Connecting to photo relay…';
  $('transport').textContent=!paired?'Connection method will appear after pairing':peerReady?'● WebRTC active · direct encrypted transfer':'◇ AES-encrypted relay fallback · WebRTC connecting or unavailable';
}
function sendGallery(){
  if(paired)link.send({type:'gallery',items:photos.map(x=>({name:x.name,width:x.width,height:x.height}))});
}
function showPhoto(){
  if(paired&&photos[current])link.send({type:'image',index:current,data:photos[current].data});
}
function selectPhoto(index){
  if(!photos.length)return;
  current=(index+photos.length)%photos.length;
  redrawSelection();showPhoto();
}
function redrawSelection(){
  const has=photos.length>0;
  $('counter').textContent=has?(current+1)+' / '+photos.length:'0 / 0';
  $('count').textContent=has?photos.length+' photo'+(photos.length===1?'':'s')+' ready':'No photos selected';
  $('prev').disabled=!has;$('next').disabled=!has;$('clear').disabled=!has;
  preview.replaceChildren();
  if(has){
    const im=new Image();im.src=photos[current].data;im.alt=photos[current].name;
    preview.append(im);
  }else{
    const empty=document.createElement('div');empty.className='preview-empty';
    const mark=document.createElement('span');mark.textContent='▧';
    const p=document.createElement('p');p.textContent='Your selected photograph will appear here';
    empty.append(mark,p);preview.append(empty);
  }
  for(const [i,b] of [...grid.children].entries())b.classList.toggle('selected',i===current);
}
function redrawGallery(){
  grid.replaceChildren();
  photos.forEach((img,i)=>{
    const b=document.createElement('button');b.type='button';b.className='thumb';
    b.setAttribute('aria-label','Display photo '+(i+1)+': '+img.name);
    const pic=document.createElement('img');pic.src=img.thumb;pic.alt='';pic.loading='lazy';
    const number=document.createElement('span');number.textContent=String(i+1);
    b.append(pic,number);b.onclick=()=>selectPhoto(i);grid.append(b);
  });
  redrawSelection();
}
function clearAll(){
  photos.length=0;current=0;grid.replaceChildren();redrawSelection();
  link.send({type:'clear'});message('Gallery cleared from this session.');
}
function canvasFor(image,w,h,maxEdge){
  const scale=Math.min(1,maxEdge/Math.max(w,h));
  const c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));
  const ctx=c.getContext('2d',{alpha:false});if(!ctx)throw Error('Image rendering is unavailable');
  ctx.fillStyle='#000';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(image,0,0,c.width,c.height);
  return c;
}
async function decode(file){
  if(typeof createImageBitmap==='function'){
    try{
      const img=await createImageBitmap(file,{imageOrientation:'from-image'});
      return {src:img,w:img.width,h:img.height,release:()=>img.close()};
    }catch{}
  }
  const url=URL.createObjectURL(file),img=new Image();
  try{
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
    return {src:img,w:img.naturalWidth,h:img.naturalHeight,release:()=>URL.revokeObjectURL(url)};
  }catch(e){URL.revokeObjectURL(url);throw e;}
}
async function preparePhoto(file){
  const decoded=await decode(file);
  try{
    // No original-file limit: downscale/compress locally to keep zoom and transfer responsive.
    // This strips camera EXIF/GPS metadata. JPEG output remains bounded for secure MQTT fallback.
    let edge=2100,quality=.83,data='';
    for(let attempt=0;attempt<8;attempt++){
      const c=canvasFor(decoded.src,decoded.w,decoded.h,edge);
      data=c.toDataURL('image/jpeg',quality);
      if(data.length<=1450000)break;
      edge=Math.max(850,Math.round(edge*.78));quality=Math.max(.55,quality-.045);
    }
    if(data.length>1450000)throw Error('Photo could not be compressed for transfer.');
    const thumb=canvasFor(decoded.src,decoded.w,decoded.h,200).toDataURL('image/jpeg',.69);
    return {name:file.name||'Photo',data,thumb,width:decoded.w,height:decoded.h};
  }finally{decoded.release();}
}
function demo(index){
  const c=document.createElement('canvas');c.width=1050;c.height=1050;
  const ctx=c.getContext('2d'),palettes=[['#1a3552','#76b9ad','#ffe5ba'],['#4b284c','#eb9975','#fff4c4'],['#112b30','#6aaf8b','#d6eebc'],['#323757','#e69cba','#f3d885']];
  const [a,b,accent]=palettes[index%4],grad=ctx.createLinearGradient(0,0,1050,1050);
  grad.addColorStop(0,a);grad.addColorStop(1,b);ctx.fillStyle=grad;ctx.fillRect(0,0,1050,1050);
  ctx.fillStyle=accent;ctx.globalAlpha=.7;ctx.beginPath();ctx.arc(315+index*65,335,163,0,Math.PI*2);ctx.fill();
  for(let i=0;i<5;i++){ctx.globalAlpha=.1+i*.09;ctx.beginPath();ctx.ellipse(660,800-i*92,260+i*25,62,Math.PI/7,0,Math.PI*2);ctx.fill();}
  ctx.globalAlpha=1;ctx.fillStyle='white';ctx.font='bold 28px system-ui';ctx.fillText('VISOR  /  '+String(index+1).padStart(2,'0'),70,977);
  return {name:'Demo '+(index+1),data:c.toDataURL('image/jpeg',.8),thumb:canvasFor(c,1050,1050,200).toDataURL('image/jpeg',.72),width:1050,height:1050};
}
async function loadPhotos(input){
  if(processing)return;
  const files=Array.from(input).filter(f=>f.type.startsWith('image/')).slice(0,80);
  if(!files.length){message('Select at least one supported picture.',true);return;}
  processing=true;$('files').disabled=true;$('demo-btn').disabled=true;
  photos.length=0;grid.replaceChildren();current=0;message('Preparing photos locally…');
  let skipped=0;
  for(let i=0;i<files.length;i++){
    $('progress').textContent=(i+1)+' / '+files.length;
    try{photos.push(await preparePhoto(files[i]));}
    catch(e){skipped++;console.warn('Unsupported photo:',files[i].name,e.message);}
    if(i%3===2)await new Promise(resolve=>setTimeout(resolve,0));
  }
  processing=false;$('files').disabled=false;$('demo-btn').disabled=false;$('progress').textContent='';
  redrawGallery();sendGallery();showPhoto();
  message(photos.length+' photos ready'+(skipped?' · '+skipped+' skipped':'')+'.');
}
const link=VISOR.connect(msg=>{
  switch(msg.type){
    case 'joined':
      paired=true;lastCode=msg.code;pairingStatus();sendGallery();showPhoto();
      message('Paired! The selected photo is ready on your glasses.');break;
    case 'direct':
      peerReady=!!msg.available;pairingStatus();break;
    case 'disconnected':
      paired=false;peerReady=false;lastCode='';pairingStatus();
      message('Session ended. Reopen the glasses viewer and pair again.',true);break;
    case 'navigate':selectPhoto(current+(msg.direction===-1?-1:1));break;
    case 'request':
      if(Number.isInteger(msg.index)&&msg.index>=0&&msg.index<photos.length)selectPhoto(msg.index);break;
    case 'error':message(msg.message||'Connection failed.',true);break;
  }
},state=>{
  online=state==='online';if(!online){paired=false;peerReady=false;}
  pairingStatus();
  if(online&&lastCode&&!paired)link.send({type:'join',code:lastCode});
});
$('pair-form').onsubmit=e=>{
  e.preventDefault();
  const code=$('pin').value.toUpperCase().replace(/[^A-Z2-9]/g,'');
  if(code.length!==12){message('Enter the entire 12-character code.',true);return;}
  lastCode=code;link.send({type:'join',code});$('pair-status').textContent='Pairing…';
};
$('files').onchange=e=>{loadPhotos(e.target.files);e.target.value='';};
$('demo-btn').onclick=()=>{
  photos.length=0;for(let i=0;i<4;i++)photos.push(demo(i));
  current=0;redrawGallery();sendGallery();showPhoto();message('Demo pictures ready.');
};
$('prev').onclick=()=>selectPhoto(current-1);
$('next').onclick=()=>selectPhoto(current+1);
$('clear').onclick=clearAll;
$('zoom-in').onclick=()=>link.send({type:'zoom',step:1});
$('zoom-out').onclick=()=>link.send({type:'zoom',step:-1});
$('zoom-reset').onclick=()=>link.send({type:'zoom',reset:true});
window.addEventListener('pagehide',()=>link.close());
pairingStatus();redrawSelection();