/* Visor Gallery: minimal MQTT 3.1.1 client + encrypted, ephemeral photo transport.
 * For experiments only. Uses the publicly accessible EMQX MQTT test broker.
 * Avoid sensitive photos; a public broker is not a personal production service.
 */
'use strict';
const VISOR = (() => {
  const BROKERS = ['wss://broker.emqx.io:8084/mqtt'];
  const CHANNEL = 'visor-gallery-v3';
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const te = new TextEncoder(), td = new TextDecoder();
  const $ = id => document.getElementById(id);
  const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));
  const randomCode = () => Array.from(randomBytes(12),x=>ALPHABET[x%ALPHABET.length]).join('');
  const concat = (...arrays) => {const out=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let at=0;for(const a of arrays){out.set(a,at);at+=a.length;}return out;};
  const be16 = n => new Uint8Array([n>>>8&255,n&255]);
  function encodedLength(n){const a=[n%128];n=Math.floor(n/128);while(n>0){a[a.length-1]|=128;a.push(n%128);n=Math.floor(n/128);}return new Uint8Array(a);}
  function packet(type,payload){return concat(new Uint8Array([type]),encodedLength(payload.length),payload);}
  function str(s){const b=te.encode(s);return concat(be16(b.length),b);}
  function readRemaining(b,offset){let n=0,m=1,c,i=offset;do{if(i>=b.length)throw Error('Bad MQTT packet');c=b[i++];n+=(c&127)*m;m*=128;}while(c&128);return [n,i];}
  const b64 = bytes => {let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
  async function roomConfig(code){
    // The public broker only sees a hashed room identifier, not the secret pairing code.
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',te.encode(CHANNEL+':room:'+code)));
    const topic = 'visor/gallery/v3/'+[...digest].slice(0,18).map(x=>x.toString(16).padStart(2,'0')).join('');
    const material=await crypto.subtle.importKey('raw',te.encode(code),'PBKDF2',false,['deriveKey']);
    const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:te.encode(CHANNEL+':key'),iterations:160000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    return {topic,key};
  }
  async function seal(key,message){const iv=randomBytes(12);const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,te.encode(JSON.stringify(message))));return concat(iv,ciphertext);}
  async function unseal(key,data){const b=new Uint8Array(data);if(b.length<29)throw Error('Small packet');const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:b.slice(0,12)},key,b.slice(12));return JSON.parse(td.decode(clear));}

  class MqttConnection {
    constructor(onData,onStatus){this.ws=null;this.onData=onData;this.onStatus=onStatus;this.ready=false;this.closed=false;this.packetId=0;this.subs=new Map();this.topics=new Set();this.retry=0;this.keep=null;this.broker=0;this.open();}
    open(){if(this.closed)return;this.ready=false;const url=BROKERS[this.broker];let ws;try{ws=new WebSocket(url,['mqtt']);}catch(e){this.retryOpen();return;}
      this.ws=ws;ws.binaryType='arraybuffer';
      ws.onopen=()=>{const id='vg'+[...randomBytes(8)].map(x=>x.toString(16).padStart(2,'0')).join('');const variable=concat(str('MQTT'),new Uint8Array([4,2,0,25]));ws.send(packet(0x10,concat(variable,str(id))));};
      ws.onmessage=e=>{if(e.data instanceof Blob){e.data.arrayBuffer().then(b=>this.parse(b)).catch(()=>{});}else this.parse(e.data);};
      ws.onclose=()=>{this.ready=false;clearInterval(this.keep);this.onStatus('offline');if(!this.closed)this.retryOpen();};
      ws.onerror=()=>{ /* onclose will report and retry */ };
    }
    retryOpen(){clearTimeout(this.retry);this.retry=setTimeout(()=>this.open(),2300);}
    parse(raw){const b=new Uint8Array(raw);let p=0;while(p<b.length){const type=b[p++];let n,start;try{[n,start]=readRemaining(b,p);}catch{return;}if(start+n>b.length)return;const payload=b.subarray(start,start+n);p=start+n;
        if((type>>4)===2){if(payload[1]!==0){this.ws?.close();continue;}this.ready=true;this.onStatus('online');clearInterval(this.keep);this.keep=setInterval(()=>this.raw(packet(0xC0,new Uint8Array(0))),18000);for(const topic of this.topics)this.subscribe(topic);}
        else if((type>>4)===3){if(payload.length<2)continue;const size=payload[0]*256+payload[1];if(size+2>payload.length)continue;const topic=td.decode(payload.subarray(2,2+size));this.onData(topic,payload.subarray(2+size));}
        else if((type>>4)===9){if(payload.length<3)continue;const id=payload[0]*256+payload[1];const cb=this.subs.get(id);if(cb){this.subs.delete(id);cb(payload[2]!==128);}}
      }}
    raw(bytes){if(this.ready&&this.ws?.readyState===WebSocket.OPEN)this.ws.send(bytes);}
    subscribe(topic){this.topics.add(topic);if(!this.ready)return Promise.resolve(false);return new Promise(resolve=>{const id=++this.packetId%65535||1;this.subs.set(id,resolve);this.raw(packet(0x82,concat(be16(id),str(topic),new Uint8Array([0]))));setTimeout(()=>{if(this.subs.has(id)){this.subs.delete(id);resolve(false);}},7000);});}
    publish(topic,payload){if(!this.ready)return false;this.raw(packet(0x30,concat(str(topic),payload)));return true;}
    close(){this.closed=true;clearTimeout(this.retry);clearInterval(this.keep);if(this.ready)this.raw(packet(0xE0,new Uint8Array(0)));this.ws?.close();}
  }

  function connect(onMessage,onState){
    const isGlasses = /(^|\/)glasses\.html$/.test(location.pathname);
    let room=null, code='', connected=false, desiredCode='', pairTimer=null, seq=0;
    let sending=Promise.resolve();let reassembly=new Map();let generation=0;let heartbeat=null,lastPong=0;
    const handleError = error => onMessage({type:'error',message:error?.message||'Connection failed'});
    const wire = new MqttConnection(receive, state => {
      connected=state==='online';onState(state);
      if(connected&&code){const old=code;startRoom(old,isGlasses,true).catch(handleError);}
      else if(connected && !isGlasses && desiredCode){startRoom(desiredCode,false,true).catch(handleError);}
    });
    function local(obj){onMessage(obj);}
    function queue(msg){if(!room||!connected)return;const target=isGlasses?'/phone':'/glasses';const stamp=++seq+'-'+b64(randomBytes(6)).replace(/[^a-zA-Z0-9]/g,'');const chunks=[];const serialized=JSON.stringify(msg);for(let i=0;i<serialized.length;i+=16500)chunks.push(serialized.slice(i,i+16500));
      const current=room;
      sending=sending.catch(()=>{}).then(async()=>{
        for(let i=0;i<chunks.length;i++){
          if(current!==room||!connected)return;
          const data=await seal(current.key,{sid:stamp,part:i,count:chunks.length,text:chunks[i]});
          wire.publish(current.topic+target,data);
          if(chunks.length>1)await new Promise(r=>setTimeout(r,13));
        }
      }).catch(handleError);
    }
    let paired=false;
    async function startRoom(pin,asGlasses,repeat){
      const myGen=++generation;const config=await roomConfig(pin);if(myGen!==generation)return;
      code=pin;room=config;const incoming=config.topic+(asGlasses?'/glasses':'/phone');const ok=await wire.subscribe(incoming);if(myGen!==generation)return;
      if(!ok){handleError(new Error('Relay subscription failed. Retry loading the page.'));return;}
      if(asGlasses){local({type:'room',code:pin});}
      else {queue({type:'join'});clearTimeout(pairTimer);pairTimer=setTimeout(()=>{if(!paired)handleError(new Error('No glasses response. Check the code and keep the glasses app open.'));},11000);}
    }
    async function receive(topic,payload){const current=room;if(!current)return;if(topic!==current.topic+(isGlasses?'/glasses':'/phone'))return;
      let envelope;try{envelope=await unseal(current.key,payload);}catch{return;}if(current!==room)return;
      const {sid,part,count,text}=envelope;if(typeof sid!=='string'||!Number.isInteger(part)||!Number.isInteger(count)||count<1||count>130||part<0||part>=count||typeof text!=='string'||text.length>17000)return;
      let partial=reassembly.get(sid);if(!partial){partial={parts:new Array(count),at:Date.now()};reassembly.set(sid,partial);}
      if(partial.parts.length!==count)return;partial.parts[part]=text;
      if(partial.parts.every(x=>typeof x==='string')){reassembly.delete(sid);let msg;try{msg=JSON.parse(partial.parts.join(''));}catch{return;}
        if(msg.type==='join'&&isGlasses){paired=true;local({type:'paired'});queue({type:'joined',code});}
        else if(msg.type==='joined'&&!isGlasses){paired=true;clearTimeout(pairTimer);local(msg);}
        else if(msg.type==='ping'){queue({type:'pong'});}
        else if(msg.type==='pong'){lastPong=Date.now();}
        else if(paired){local(msg);}
      }
      if(reassembly.size>100){for(const [key,val] of reassembly)if(Date.now()-val.at>20000)reassembly.delete(key);}
    }
    heartbeat=setInterval(()=>{if(connected&&room&&paired){queue({type:'ping'});if(lastPong && Date.now()-lastPong>23000){paired=false;local({type:'disconnected'});}}},6000);
    function send(msg){if(msg.type==='create'&&isGlasses){if(!connected)return;paired=false;lastPong=0;startRoom(randomCode(),true,false).catch(handleError);return;}
      if(msg.type==='join'&&!isGlasses){desiredCode=(msg.code||'').toUpperCase();if(!connected)return;paired=false;lastPong=0;startRoom(desiredCode,false,false).catch(handleError);return;}
      if(!paired)return;queue(msg);
    }
    return {send,close(){clearInterval(heartbeat);clearTimeout(pairTimer);wire.close();}};
  }
  return {connect,$};
})();