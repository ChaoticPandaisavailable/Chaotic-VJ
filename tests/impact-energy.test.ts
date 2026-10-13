import test from 'node:test';
import assert from 'node:assert/strict';
import {ImpactEnergy} from '../packages/audio-engine/impact-energy.ts';
import {MusicForces} from '../packages/audio-engine/music-forces.ts';
import {defaultConfig,silentFeatures} from '../packages/shared/config.ts';

function level(hz:number,amplitude:number,rate=48000,anti=false){
  const detector=new ImpactEnergy(rate),left=new Float32Array(128),right=new Float32Array(128);
  let sum=0,count=0,last=0;
  for(let n=0;n<rate*1.5;n+=128){
    for(let i=0;i<128;i++){left[i]=amplitude*Math.sin(2*Math.PI*hz*(n+i)/rate);right[i]=left[i]*(anti?-1:1);}
    last=detector.process(left,right);if(n>rate){sum+=last;count++;}
  }
  return sum/count;
}

test('impact meter focuses on 80 Hz and attenuates energy above the 200 Hz lowpass',()=>{
  for(const rate of [44100,48000,96000]){
    const centre=level(80,.12,rate);
    assert.ok(centre>level(35,.12,rate)*1.4);
    assert.ok(centre>level(160,.12,rate)*1.4);
    assert.ok(level(400,.12,rate)<centre*.07);
    assert.ok(level(1000,.12,rate)<centre*.002);
    assert.ok(Math.abs(level(80,.12,rate,true)-centre)<.00001);
  }
});

test('impact loudness preserves level ratios instead of normalizing every onset',()=>{
  const quiet=level(80,.04),medium=level(80,.08),loud=level(80,.16);
  assert.ok(Math.abs(medium/quiet-2)<.01);assert.ok(Math.abs(loud/medium-2)<.01);
});

test('visual impact amplitude follows measured low energy, not onset confidence',()=>{
  const music={...defaultConfig.music,amount:1,impact:1};
  function strike(lowImpact:number,kick:number){
    const forces=new MusicForces();for(let i=0;i<120;i++)forces.update(1/60,silentFeatures(),music,120);
    let peak=0;
    for(let i=0;i<20;i++)peak=Math.max(peak,forces.update(1/120,{...silentFeatures(),rms:.4,lowImpact,kick:i===0?kick:0},music,120).impact);
    return peak;
  }
  const quiet=strike(.15,.5),loud=strike(.6,.5);
  assert.ok(Math.abs(loud/quiet-4)<.01);
  assert.ok(Math.abs(strike(.6,1)-loud)<.001,'confidence must not set weight');
  assert.equal(strike(0,1),0,'no low energy means no low-end impact');
  assert.ok(strike(.8,0)<1e-10,'sustained bass alone cannot invent a kick');
});

test('equal low-end hits stay consistent despite onset timing variation and unrelated BPM',()=>{
  const music={...defaultConfig.music,amount:1,impact:1};
  const peaks:number[]=[];
  for(const bpm of [87,150,193])for(const delay of [.012,.035]){
    const forces=new MusicForces();for(let i=0;i<240;i++)forces.update(1/120,silentFeatures(),music,bpm);
    let peak=0,fired=false;
    for(let i=0;i<100;i++){
      const t=i/240,lowImpact=.7*Math.exp(-Math.pow((t-.06)/.04,2));
      const kick=!fired&&t>=delay ? .6 : 0;if(kick)fired=true;
      peak=Math.max(peak,forces.update(1/240,{...silentFeatures(),rms:.4,lowImpact,kick},music,bpm).impact);
    }
    peaks.push(peak);
  }
  assert.ok(Math.max(...peaks)/Math.min(...peaks)<1.05,JSON.stringify(peaks));
});
