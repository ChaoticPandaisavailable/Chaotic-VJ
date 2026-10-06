import { readFileSync } from 'node:fs';

/** Offline Blackman-windowed FFT of the actual demo WAV, approximating an unsmoothed Web Audio analyser. */
export function* diagnosticAudio(hz:number,seconds=4){
  const wav=readFileSync(new URL('../../apps/performer/public/test-beat.wav',import.meta.url));
  const sourceRate=wav.readUInt32LE(24),sampleRate=48000,size=2048;
  let data=12;
  while(wav.toString('ascii',data,data+4)!=='data')data+=8+wav.readUInt32LE(data+4);
  const end=data+8+wav.readUInt32LE(data+4);data+=8;
  const sample=(index:number)=>{const offset=data+Math.floor(index*sourceRate/sampleRate)*2;return offset<data||offset>=end?0:wav.readInt16LE(offset)/32768;};
  for(let frame=0;frame<seconds*hz;frame++){
    const time=new Float32Array(size),db=new Float32Array(size/2),re=new Float64Array(size),im=new Float64Array(size);
    for(let i=0;i<size;i++){
      time[i]=sample(Math.round(frame/hz*sampleRate)-size+i);
      re[i]=time[i]*(.42-.5*Math.cos(2*Math.PI*i/size)+.08*Math.cos(4*Math.PI*i/size));
    }
    for(let i=1,j=0;i<size;i++){let bit=size>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[re[i],re[j]]=[re[j],re[i]];}
    for(let length=2;length<=size;length*=2){
      const angle=-2*Math.PI/length,wr=Math.cos(angle),wi=Math.sin(angle);
      for(let base=0;base<size;base+=length){
        let ur=1,ui=0;
        for(let k=0;k<length/2;k++){
          const a=base+k,b=a+length/2,vr=re[b]*ur-im[b]*ui,vi=re[b]*ui+im[b]*ur;
          re[b]=re[a]-vr;im[b]=im[a]-vi;re[a]+=vr;im[a]+=vi;
          const next=ur*wr-ui*wi;ui=ur*wi+ui*wr;ur=next;
        }
      }
    }
    for(let i=0;i<size/2;i++)db[i]=20*Math.log10(Math.hypot(re[i],im[i])/size);
    yield {time,db,sampleRate,dt:1/hz};
  }
}
