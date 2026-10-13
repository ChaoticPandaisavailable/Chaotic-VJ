import test from 'node:test';
import assert from 'node:assert/strict';
import {TransientDetector,TransientMailbox} from '../packages/audio-engine/transient-detector.ts';
import {SpectralKick} from '../packages/audio-engine/spectral-kick.ts';
import {readFileSync} from 'node:fs';
import {configSchema,defaultConfig} from '../packages/shared/config.ts';

const kick=(age:number)=>age<0||age>.35?0:Math.sin(2*Math.PI*(46*age+7*(1-Math.exp(-age*35))))*Math.exp(-age*18);
function run(signal:(t:number)=>number,seconds:number,rate=48000,anti=false,sensitivity=.5){
  const detector=new TransientDetector(rate);detector.sensitivity=sensitivity;
  const left=new Float32Array(128),right=new Float32Array(128),events:{time:number;strength:number}[]=[];
  let id=0,maxBass=0,last=detector.reading;
  for(let n=0;n<seconds*rate;n+=128){
    for(let i=0;i<128;i++){left[i]=signal((n+i)/rate);right[i]=left[i]*(anti?-1:1);}
    last=detector.process(left,right);maxBass=Math.max(maxBass,last.bass);
    if(last.eventId!==id){id=last.eventId;events.push({time:(n+128)/rate,strength:last.kick});}
  }
  return {events,last,maxBass};
}
test('sustained and slowly swelling bass drives flow without inventing kicks',()=>{
  const r=run(t=>.25*Math.sin(2*Math.PI*83*t)*Math.min(1,t/.45)*(.72+.28*Math.sin(t*1.7)),6);
  assert.deepEqual(r.events,[]);assert.ok(r.maxBass>.4);
});
test('kick attacks survive sustained bass, stereo inversion and common audio sample rates',()=>{
  for(const rate of [44100,48000,96000])for(const anti of [false,true]){
    const hits=Array.from({length:8},(_,i)=>.3+i*.5);
    const r=run(t=>.09*Math.sin(2*Math.PI*83*t)*Math.min(1,t/.2)+hits.reduce((sum,at)=>sum+.42*kick(t-at),0),4.5,rate,anti);
    assert.equal(r.events.length,hits.length,JSON.stringify({rate,anti,events:r.events}));
    r.events.forEach((e,i)=>assert.ok(e.time>=hits[i]&&e.time-hits[i]<.05,`attack delay ${e.time-hits[i]}`));
  }
});
test('quiet kicks remain detectable and sustained sub-bass cycles do not retrigger',()=>{
  const hits=[.25,.75,1.25,1.75];
  const r=run(t=>hits.reduce((s,at)=>s+.075*kick(t-at),0),2.5);
  assert.equal(r.events.length,4);
  const bass=run(t=>.4*Math.sin(2*Math.PI*38*t)*Math.min(1,t/.5),3);
  assert.equal(bass.events.length,0);
});
test('high frequency hats alone do not create low-frequency impacts',()=>{
  const r=run(t=>.3*Math.sin(2*Math.PI*8400*t)*Math.exp(-(t%.25)*70),4);
  assert.equal(r.events.length,0);assert.ok(r.maxBass<.03);
});
test('loud sustained bass does not mask every other kick at a different phase alignment',()=>{
  const hits=Array.from({length:8},(_,i)=>2+i*.5);
  const r=run(t=>.15*Math.sin(2*Math.PI*83*t)*Math.min(1,t/.4)+hits.reduce((sum,at)=>sum+.4*kick(t-at),0),6);
  assert.equal(r.events.length,hits.length,JSON.stringify(r.events));
  r.events.forEach((e,i)=>assert.ok(e.time>=hits[i]&&e.time-hits[i]<.05));
});
test('hats over sustained bass do not turn the bass into a drum',()=>{
  const r=run(t=>.15*Math.sin(2*Math.PI*83*t)*Math.min(1,t/.4)+.3*Math.sin(2*Math.PI*8400*t)*Math.exp(-(t%.25)*70),4);
  assert.equal(r.events.length,0,JSON.stringify(r.events));
});
test('stopping sound ends kick quickly while bass releases smoothly',()=>{
  const r=run(t=>t<1?.4*kick(t%.5):0,2);
  assert.equal(r.events.length,2);assert.ok(r.last.kick<.0001);assert.ok(r.last.bass<.002);
});
test('original test rhythm produces measured attacks and no duplicate bass-cycle triggers',()=>{
  const wav=readFileSync('apps/performer/public/test-beat.wav'),rate=wav.readUInt32LE(24);let data=12;
  while(wav.toString('ascii',data,data+4)!=='data')data+=8+wav.readUInt32LE(data+4);data+=8;
  const r=run(t=>wav.readInt16LE(data+Math.floor(t*rate)*2)/32768,4);
  assert.equal(r.events.length,8,JSON.stringify(r.events));
  for(let i=0;i<8;i++)assert.ok(Math.abs(r.events[i].time-i*.5)<.06);
});
test('old presets gain a moderate sensitivity and invalid sensitivity is rejected',()=>{
  const old=structuredClone(defaultConfig) as any;delete old.music.kickSensitivity;
  assert.equal(configSchema.parse(old).music.kickSensitivity,.5);
  old.music.kickSensitivity=2;assert.equal(configSchema.safeParse(old).success,false);
});
test('display stalls cannot replay old kick events and slow displays retain a short attack',()=>{
  const m=new TransientMailbox();
  m.accept({audioTime:1,eventId:1,kick:.8,bass:.4,rms:.2},1);
  m.accept({audioTime:1.02,eventId:1,kick:.6,bass:.4,rms:.2},1.02);
  assert.equal(m.apply({kick:0,bass:0,rms:0},1.04).kick,.8);
  assert.ok(m.apply({kick:0,bass:0,rms:0},1.05).kick<.6);
  assert.equal(m.accept({audioTime:1.1,eventId:2,kick:1,bass:.6,rms:.3},2),false);
  assert.equal(m.apply({kick:1,bass:0,rms:0},2).kick,0);
  m.accept({audioTime:2,eventId:3,kick:1,bass:.5,rms:0},2);
  assert.equal(m.apply({kick:1,bass:0,rms:0},2).kick,0,'silent current input cancels even a latched attack');
});

test('quiet kicks are recovered below a much louder sustained bass across pitches',()=>{
  const hits=Array.from({length:8},(_,i)=>1+i*.48);
  for(const hz of [47,65,83,110])for(const rate of [44100,48000,96000]){
    const r=run(t=>.4*Math.sin(2*Math.PI*hz*t)*Math.min(1,t/.8)+hits.reduce((v,h)=>v+.12*kick(t-h),0),5.3,rate,true);
    const events=r.events.filter(e=>e.time>.8);
    assert.equal(events.length,hits.length,JSON.stringify({hz,rate,events}));
    events.forEach((e,i)=>assert.ok(e.time>=hits[i]&&e.time-hits[i]<.07));
  }
});

test('whitening does not mistake bass vibrato, harmonics and separate hats for kicks',()=>{
  const r=run(t=>{
    const phase=2*Math.PI*65*t+.5*Math.sin(2*Math.PI*4*t);
    const bass=.22*(Math.sin(phase)+.3*Math.sin(phase*2)+.12*Math.sin(phase*3))*Math.min(1,t/.8);
    const hat=.14*Math.sin(2*Math.PI*7300*t)*Math.exp(-(t%.24)*65);
    return bass+hat;
  },6);
  assert.deepEqual(r.events.filter(e=>e.time>.8),[]);
});

test('masked kick recovery survives compressed mix and does not keep firing after drums leave',()=>{
  const hits=Array.from({length:8},(_,i)=>1+i*.42);
  const r=run(t=>{
    const bass=.42*(Math.sin(2*Math.PI*54*t)+.18*Math.sin(2*Math.PI*108*t))*Math.min(1,t/.8);
    return Math.tanh((bass+hits.reduce((v,h)=>v+.13*kick(t-h),0))*2)/2;
  },7);
  const events=r.events.filter(e=>e.time>.8);
  assert.equal(events.length,hits.length,JSON.stringify(events));
  events.forEach((e,i)=>assert.ok(e.time>=hits[i]&&e.time-hits[i]<.07));
  assert.ok(r.last.kick<.0001);
});

test('spectral rescue does not add attacks for upper harmonic vocal-like phrases',()=>{
  const detector=new SpectralKick(48000),pcm=new Float32Array(128);let hits=0;
  for(let n=0;n<48000*5;n+=128){
    for(let i=0;i<128;i++){
      const t=(n+i)/48000,phase=2*Math.PI*190*t+.3*Math.sin(2*Math.PI*5*t);
      const envelope=(1-Math.exp(-(t%.38)*130))*Math.exp(-(t%.38)*8);
      pcm[i]=.22*envelope*(Math.sin(phase)+.45*Math.sin(phase*2)+.25*Math.sin(phase*3));
    }
    if(detector.process(pcm,pcm,.5)>0)hits++;
  }
  assert.equal(hits,0);
});

test('real attacks follow varying tempo, odd groupings and rests without an assumed beat grid',()=>{
  // Three beats at 90 BPM, seven eighth-notes at 173 BPM, a rest, then syncopation.
  const hits=[.5,1.1667,1.8333,3,3.1734,3.3468,3.5202,3.6936,3.867,4.0404,5.6,5.92,6.61,6.84];
  const r=run(t=>hits.reduce((v,h)=>v+.36*kick(t-h),0),7.5);
  assert.equal(r.events.length,hits.length,JSON.stringify(r.events));
  r.events.forEach((e,i)=>assert.ok(e.time>=hits[i]&&e.time-hits[i]<.07));
});
