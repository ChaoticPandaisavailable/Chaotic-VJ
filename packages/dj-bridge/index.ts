import dgram from 'node:dgram';
import net from 'node:net';
import { emptyDJ, type DJState } from '../shared/config.ts';

export function oscMessage(address: string): Buffer {
  const string = (text: string) => { const raw=Buffer.from(text+'\0'); const b=Buffer.alloc(Math.ceil(raw.length/4)*4);raw.copy(b);return b; };
  return Buffer.concat([string(address),string(',')]);
}
export function readOSC(buffer: Buffer): {address:string; values:(number|string)[]}[] {
  if(buffer.length>65536)return [];
  if(buffer.subarray(0,8).toString()==='#bundle\0'){
    const messages: {address:string;values:(number|string)[]}[]=[];let offset=16;
    while(offset+4<=buffer.length){const length=buffer.readUInt32BE(offset);offset+=4;if(length<4||offset+length>buffer.length)break;const child=buffer.subarray(offset,offset+length);if(child.subarray(0,1).toString()==='/')messages.push(...readOSC(child));offset+=length;}return messages;
  }
  let offset=0;
  const string=()=>{const end=buffer.indexOf(0,offset);if(end<0)throw new Error('Invalid OSC string');const text=buffer.subarray(offset,end).toString();offset=Math.ceil((end+1)/4)*4;return text;};
  try{ const address=string(), tags=string();if(!address.startsWith('/')||!tags.startsWith(','))return[];const values:(number|string)[]=[];
    for(const tag of tags.slice(1)){if(tag==='s')values.push(string());else if(tag==='f'){values.push(buffer.readFloatBE(offset));offset+=4;}else if(tag==='i'){values.push(buffer.readInt32BE(offset));offset+=4;}else if(tag==='d'){values.push(buffer.readDoubleBE(offset));offset+=8;}else return [];}
    return [{address,values}];
  }catch{return [];}
}
export function parseOS2L(value: unknown, now=Date.now()): DJState | null {
  if(!value||typeof value!=='object')return null;
  const v=value as Record<string,unknown>;
  if(v.evt!=='beat'||typeof v.bpm!=='number'||!Number.isFinite(v.bpm)||v.bpm<30||v.bpm>300||typeof v.pos!=='number'||!Number.isFinite(v.pos))return null;
  return {source:'os2l',connected:true,receivedAt:now,deckId:null,currentBpm:v.bpm,originalBpm:null,beatPosition:v.pos,beatPhase:((v.pos%1)+1)%1,beatInBar:null};
}
/** Streaming JSON framing: TCP packets need not end on JSON or newline boundaries. */
export class JsonFrames {
  private buffer='';
  push(chunk:string):unknown[]{
    this.buffer+=chunk;if(this.buffer.length>65536){this.buffer='';throw new Error('OS2L frame too large');}
    const frames:unknown[]=[];let start=-1,depth=0,quoted=false,escaped=false,last=0;
    for(let i=0;i<this.buffer.length;i++){
      const ch=this.buffer[i];
      if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;continue;}
      if(ch==='"'){quoted=true;continue;}
      if(ch==='{'){if(depth===0)start=i;depth++;}
      if(ch==='}'&&depth>0){depth--;if(depth===0){try{frames.push(JSON.parse(this.buffer.slice(start,i+1)));}catch{}last=i+1;}}
    }
    if(last)this.buffer=this.buffer.slice(last);return frames;
  }
}
export function startDJBridge(onState:(state:DJState)=>void){
  let current=emptyDJ();const cleanup:(()=>void)[]=[];
  const emit=(state:DJState)=>{current=state;onState(state);};
  const oscTarget=Number(process.env.VDJ_OSC_PORT||0),oscListen=Number(process.env.VDJ_OSC_LISTEN||9001),deck=Number(process.env.VDJ_DECK||1);
  if(oscTarget>0){
    const socket=dgram.createSocket('udp4');
    socket.on('message',(data,remote)=>{if(remote.address!=='127.0.0.1')return;
      for(const msg of readOSC(data)){
        const value=Number(msg.values[0]);if(!Number.isFinite(value))continue;
        const state:DJState={...current,source:'osc',connected:true,receivedAt:Date.now(),deckId:deck};
        if(current.source==='osc'&&current.connected&&current.beatPosition!==null&&current.receivedAt!==null){
          state.beatPosition=current.beatPosition+(state.receivedAt!-current.receivedAt)/60000*(current.currentBpm??120);
          state.beatPhase=((state.beatPosition%1)+1)%1;
        }
        if(msg.address.endsWith('/get_bpm')&&value>=30&&value<=300)state.currentBpm=value;
        else if(msg.address.endsWith('/get_beatpos')){state.beatPosition=value;state.beatPhase=((value%1)+1)%1;}
        else if(msg.address.endsWith('/get_beat_num')&&value>=1&&value<=4)state.beatInBar=value;
        else continue; emit(state);
      }
    });
    socket.on('error',e=>console.warn('OSC bridge:',e.message));socket.bind(oscListen,'127.0.0.1',()=>{
      for(const verb of ['get_bpm','get_beatpos','get_beat_num'])socket.send(oscMessage(`/vdj/subscribe/deck/${deck}/${verb}`),oscTarget,'127.0.0.1');
    });cleanup.push(()=>socket.close());
  }
  const os2lPort=Number(process.env.VDJ_OS2L_PORT||0);
  if(os2lPort>0){const server=net.createServer(socket=>{const frames=new JsonFrames();socket.setTimeout(15000,()=>socket.destroy());socket.on('error',()=>{});socket.on('data',chunk=>{try{for(const frame of frames.push(chunk.toString())){const state=parseOS2L(frame);if(state)emit(state);}}catch{socket.destroy();}});});server.on('error',e=>console.warn('OS2L bridge:',e.message));server.listen(os2lPort,'127.0.0.1');cleanup.push(()=>server.close());}
  const timeout=setInterval(()=>{if(current.connected&&Date.now()-(current.receivedAt??0)>3000)emit({...current,connected:false});},1000);timeout.unref();
  return ()=>{clearInterval(timeout);cleanup.forEach(c=>c());};
}
