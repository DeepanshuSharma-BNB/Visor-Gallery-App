'use strict';
const $=VISOR.$;
const list=[];
let selected=0, paired=false, online=false, joiningCode='', processing=false;
const status=$('status-pill'), pairStatus=$('pair-status'), count=$('count'), progress=$('progress');
const gallery=$('grid'), now=$('now'), toast=$('toast');
function notify(text,important=false){
  toast.textContent=text;toast.className=text?'toast'+(important?' danger':''):'';
}
function updateConnection(){
  status.textContent=paired?'● Glasses connected':online?'● Ready to pair':'○ Disconnected';
  status.className='pill'+(paired?' good':'');
  $('pair-btn').disabled=!online||paired;
  pairStatus.textContent=paired?'Connected. Your selected photos are ready.':online?'Enter code shown on glasses.':'Connecting to secure test relay…';
}
function sendGallery(){if(paired)link.send({type:'gallery',items:list.map(p=>({name:p.name,width:p.width,height:p.height}))});}
function sendSelected(){if(paired&&list[selected])link.send({type:'image',index:selected,data:list[selected].data});}
function change(index){
  if(!list.length)return;
  selected=(index+list.length)%list.length;
  updateSelection();sendSelected();
}
function updateSelection(){
  const has=list.length>0;
  $('prev').disabled=!has;$('next').disabled=!has;$('clear').disabled=!has;
  $('counter').textContent=has?(selected+1)+' / '+list.length:'0 / 0';
  count.textContent=has?list.length+' photo'+(list.length!==1?'s':'')+' selected':'No photos selected';
  if(has){now.replaceChildren(Object.assign(document.createElement('img'),{src:list[selected].data,alt:list[selected].name}));}
  else{now.innerHTML='<span class="empty-icon">▧</span><p>Images will appear here</p>';}
  [...gallery.children].forEach((button,i)=>{button.classList.toggle('selected',i===selected);button.setAttribute('aria-current',i===selected?'true':'false');});
}
function drawGallery(){
  gallery.replaceChildren();
  list.forEach((item,i)=>{
    const b=document.createElement('button');b.className='tile';b.type='button';b.setAttribute('role','listitem');b.setAttribute('aria-label','Show photo '+(i+1)+': '+item.name);
    const img=document.createElement('img');img.src=item.thumb;img.alt='';img.loading='lazy';
    const label=document.createElement('span');label.className='number';label.textContent=String(i+1);
    b.append(img,label);b.onclick=()=>change(i);gallery.appendChild(b);
  });
  updateSelection();
}
function clearPhotos(){list.length=0;selected=0;gallery.replaceChildren();updateSelection();link.send({type:'clear'});$('auto-advance').checked=false;link.send({type:'play',enabled:false});}
function resizeToCanvas(source,width,height,maxSize){
  const scale=Math.min(1,maxSize/Math.max(width,height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(source,0,0,canvas.width,canvas.height);return canvas;
}
async function decode(file){
  if(typeof createImageBitmap==='function'){
    try{const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});return {source:bitmap,width:bitmap.width,height:bitmap.height,release:()=>bitmap.close()};}catch{}
  }
  const url=URL.createObjectURL(file);const image=new Image();
  try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});return {source:image,width:image.naturalWidth,height:image.naturalHeight,release:()=>URL.revokeObjectURL(url)};}
  catch(e){URL.revokeObjectURL(url);throw e;}
}
async function compress(file){
  const decoded=await decode(file);
  try{
    let cvs=resizeToCanvas(decoded.source,decoded.width,decoded.height,1250);
    let data=cvs.toDataURL('image/jpeg',.77);
    if(data.length>1150000){cvs=resizeToCanvas(decoded.source,decoded.width,decoded.height,920);data=cvs.toDataURL('image/jpeg',.63);}
    if(data.length>1380000)throw Error('Picture is too large to stream');
    const thumb=resizeToCanvas(decoded.source,decoded.width,decoded.height,230).toDataURL('image/jpeg',.68);
    return {name:file.name||'Photo',data,thumb,width:decoded.width,height:decoded.height};
  }finally{decoded.release();}
}
function makeDemo(n){
  const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=1000;const c=canvas.getContext('2d');
  const palettes=[['#182b4e','#67a6ac','#e8d5b3'],['#30224e','#ea9b82','#f9ccaa'],['#102c29','#4c9b6f','#dbeda6'],['#3d2846','#d15b8d','#f3cd79']];
  const [a,b,d]=palettes[n%palettes.length];
  const g=c.createLinearGradient(0,0,1000,1000);g.addColorStop(0,a);g.addColorStop(1,b);c.fillStyle=g;c.fillRect(0,0,1000,1000);
  c.globalAlpha=.7;c.fillStyle=d;c.beginPath();c.arc(300+n*65,290,155,0,Math.PI*2);c.fill();
  c.globalAlpha=.43;for(let j=0;j<5;j++){c.beginPath();c.ellipse(650,780-j*95,290+j*26,60+j*3,Math.PI/8,0,2*Math.PI);c.fill();}
  c.globalAlpha=1;c.fillStyle='#ffffff';c.font='700 27px sans-serif';c.fillText('VISOR / STUDY '+String(n+1).padStart(2,'0'),72,918);
  const data=canvas.toDataURL('image/jpeg',.72);const thumb=resizeToCanvas(canvas,1000,1000,230).toDataURL('image/jpeg',.65);
  return {name:'Demo composition '+(n+1),data,thumb,width:1000,height:1000};
}
async function receiveFiles(inputFiles){
  if(processing)return;
  const files=Array.from(inputFiles).filter(f=>f.type.startsWith('image/')).slice(0,60);
  if(!files.length){notify('No supported pictures were selected.',true);return;}
  processing=true;$('files').disabled=true;$('demo-btn').disabled=true;
  notify('');list.length=0;gallery.replaceChildren();selected=0;
  let failures=0;
  for(let i=0;i<files.length;i++){
    progress.textContent=(i+1)+' / '+files.length;
    try{list.push(await compress(files[i]));}
    catch(e){failures++;console.warn('Could not load image:',files[i].name,e);}
    if(i%4===3)await new Promise(r=>setTimeout(r,0));
  }
  processing=false;$('files').disabled=false;$('demo-btn').disabled=false;progress.textContent='';
  drawGallery();sendGallery();sendSelected();
  notify(failures?list.length+' loaded, '+failures+' skipped. Unsupported photo formats may need JPG conversion.':list.length+' photos ready to browse.');
}
const link=VISOR.connect(msg=>{
  switch(msg.type){
    case 'joined':paired=true;joiningCode=msg.code;updateConnection();sendGallery();sendSelected();notify('Paired successfully. Photos are ready on the glasses.');break;
    case 'disconnected':paired=false;updateConnection();notify('Glasses disconnected. Reopen the glasses app for a new code.',true);joiningCode='';$('auto-advance').checked=false;break;
    case 'error':notify(msg.message||'Pairing problem',true);break;
    case 'request':if(list[msg.index]){selected=msg.index;updateSelection();sendSelected();}break;
    case 'navigate':change(selected+msg.direction);break;
    case 'play_state':$('auto-advance').checked=msg.enabled;break;
  }
},state=>{
  online=state==='online';
  if(!online){paired=false;updateConnection();}
  else{updateConnection();if(joiningCode){link.send({type:'join',code:joiningCode});}}
});
$('pair-form').onsubmit=event=>{
  event.preventDefault();const code=$('pin').value.toUpperCase().replace(/[^A-Z2-9]/g,'');
  if(code.length!==12){notify('Please enter a 12-character code.',true);return;}
  joiningCode=code;link.send({type:'join',code});pairStatus.textContent='Pairing…';
};
$('files').addEventListener('change',e=>{receiveFiles(e.target.files);e.target.value='';});
$('demo-btn').onclick=()=>{list.length=0;for(let i=0;i<4;i++)list.push(makeDemo(i));selected=0;drawGallery();sendGallery();sendSelected();notify('Four demo images loaded.');};
$('prev').onclick=()=>change(selected-1);
$('next').onclick=()=>change(selected+1);
$('clear').onclick=()=>{clearPhotos();notify('Gallery cleared from this session.');};
$('auto-advance').onchange=e=>link.send({type:'play',enabled:e.target.checked});
updateConnection();updateSelection();