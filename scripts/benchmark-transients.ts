import {TransientDetector} from '../packages/audio-engine/transient-detector.ts';
import {mkdir,writeFile} from 'node:fs/promises';
import {diagnosticSignal} from '../packages/audio-engine/diagnostic-signal.ts';
const rate=48000,seconds=18,pcm=diagnosticSignal(rate);
const detector=new TransientDetector(rate),times:number[]=[],events:number[]=[];
let previous=0;const start=performance.now();
for(let n=0;n<pcm.length;n+=128){
  const audio=pcm.subarray(n,n+128),at=performance.now(),reading=detector.process(audio);
  times.push(performance.now()-at);
  if(reading.eventId!==previous){events.push((n+128)/rate);previous=reading.eventId;}
}
const wallMs=performance.now()-start;times.sort((a,b)=>a-b);
const intended=Array.from({length:16},(_,i)=>4+i*.5),delays=intended.flatMap(at=>{const t=events.find(t=>t>=at&&t-at<.1);return t===undefined?[]:[(t-at)*1000];});
const report={audioSeconds:seconds,totalComputeMs:wallMs,computePercentOfAudio:wallMs/(seconds*10),blockMs:128/rate*1000,p50ComputeMs:times[Math.floor(times.length*.5)],p99ComputeMs:times[Math.floor(times.length*.99)],kickEvents:events,detectorDelayMs:delays,missedKicks:intended.filter(at=>!events.some(t=>t>=at&&t-at<.1)).length,falseKickEvents:events.filter(t=>!intended.some(at=>t>=at&&t-at<.1))};
await mkdir('.runtime/audio-validation',{recursive:true});await writeFile('.runtime/audio-validation/transient-benchmark.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
const wav=Buffer.alloc(44+pcm.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length*2,40);
for(let i=0;i<pcm.length;i++)wav.writeInt16LE(Math.round(pcm[i]*32767),44+i*2);
await writeFile('.runtime/audio-validation/kick-bass-check.wav',wav);
