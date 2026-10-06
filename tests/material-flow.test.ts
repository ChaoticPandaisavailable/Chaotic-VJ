import test from 'node:test';
import assert from 'node:assert/strict';
import { MaterialFlow, transportPoint } from '../packages/visual-engine/material-flow.ts';
import { FlowReset } from '../packages/visual-engine/flow-reset.ts';
import { MusicForces, type MusicResponse } from '../packages/audio-engine/music-forces.ts';
import { FeatureExtractor } from '../packages/audio-engine/features.ts';
import { defaultConfig, configSchema, silentFeatures } from '../packages/shared/config.ts';
import { compositionSeed, nextShuffle, setShuffle } from '../packages/shared/shuffle.ts';
import { applyControl, controlValue } from '../packages/shared/performance.ts';
import { MidiControl, type MidiBinding } from '../packages/shared/midi.ts';
import { diagnosticAudio } from './helpers/diagnostic-audio.ts';

const response=(extra:Partial<MusicResponse>={}):MusicResponse=>({kick:0,strike:0,spark:0,gain:.7,impact:0,flow:0,detail:0,shear:0,pressure:0,release:0,activity:0,...extra});
const make=()=>{const flow=new MaterialFlow();flow.reset(1337);return flow;};
const geometry=(flow:MaterialFlow)=>{
  for(let y=-.6;y<=.6;y+=.15)for(let x=-2;x<=2;x+=.21){
    const p=transportPoint(x,y,flow.layers),back=transportPoint(...p,flow.layers,true),e=.00001;
    assert.ok(Math.hypot(p[0]-x,p[1]-y)<.3,'displacement stays bounded, including beyond screen edges');
    assert.ok(Math.hypot(back[0]-x,back[1]-y)<1e-12,'material coordinates remain invertible');
    const dx=transportPoint(x+e,y,flow.layers),dy=transportPoint(x,y+e,flow.layers);
    const det=((dx[0]-p[0])*(dy[1]-p[1])-(dy[0]-p[0])*(dx[1]-p[1]))/e**2;
    assert.ok(Math.abs(det-1)<.0003,`no accumulated expansion or coordinate collapse: ${det}`);
    assert.ok(Math.hypot(dx[0]-p[0],dx[1]-p[1])/e<4,'neighbors move continuously without hard seams');
  }
};

test('30 minutes of maximum audio cannot inflate, collapse or pin material coordinates',()=>{
  const flow=make(),config=structuredClone(defaultConfig);config.rhythm.ripple=1;
  const loud=response({impact:1,flow:1,detail:1,shear:1,pressure:1,release:1});
  for(let frame=0;frame<=30*60*60;frame++){
    flow.update(1/60,loud,config);
    if(frame%3600===0)geometry(flow);
  }
  assert.ok(flow.layers.every(l=>l.slice(0,2).every(p=>p>=0&&p<2*Math.PI)));
});

test('silence keeps natural movement; an audio pulse advances the current without resetting its phase',()=>{
  const a=make(),b=make(),before=structuredClone(a.layers);
  for(let i=0;i<600;i++){
    a.update(1/60,response(i<12?{impact:.5}:{}),defaultConfig);
    b.update(1/60,response({}),defaultConfig);
  }
  assert.notDeepEqual(b.layers,before,'natural motion must survive silence');
  assert.ok(a.audioSpeed.every(v=>v<1e-12),'audio motion settles');
  const difference=a.layers[0][0]-b.layers[0][0];assert.ok(Math.abs(difference)>.1,'pulse must leave the flow advanced');
  for(let i=0;i<300;i++){a.update(1/60,response({}),defaultConfig);b.update(1/60,response({}),defaultConfig);}
  assert.ok(Math.abs(a.layers[0][0]-b.layers[0][0]-difference)<1e-10,'no return-to-origin rebound');
});

test('low, middle and high sound act on distinct spatial scales',()=>{
  for(const [band,features]of [[0,{flow:.4,impact:.2}],[1,{shear:.4}],[2,{detail:.4}]]as const){
    const a=make(),b=make();for(let i=0;i<60;i++){a.update(1/60,response(features),defaultConfig);b.update(1/60,response({}),defaultConfig);}
    for(let i=0;i<3;i++)assert.equal(a.layers[i][0]!==b.layers[i][0],i===band);
  }
});

test('freeze holds all transport state; gain zero has only natural flow',()=>{
  const a=make(),b=make();a.update(.1,response({flow:.5}),defaultConfig,true);assert.deepEqual(a.layers,b.layers);
  for(let i=0;i<120;i++){a.update(1/60,response({gain:0,flow:1,impact:1,detail:1,shear:1}),defaultConfig);b.update(1/60,response({}),defaultConfig);}
  assert.deepEqual(a.layers,b.layers);
});

test('30 / 60 / 144 Hz agree for the same sustained force and quiet period',()=>{
  const runs=[30,60,144].map(hz=>{const f=make();for(let i=0;i<hz*10;i++)f.update(1/hz,response(i<hz*4?{flow:.4,shear:.2,detail:.3}:{}),defaultConfig);return f;});
  for(const run of runs)for(let i=0;i<3;i++)for(let j=0;j<4;j++)assert.ok(Math.abs(run.layers[i][j]-runs[0].layers[i][j])<1e-10);
});

test('actual test WAV drives the flow at 30 / 60 / 144 Hz; silence does not manufacture BPM hits',()=>{
  for(const hz of [30,60,144]){
    const extractor=new FeatureExtractor(),music=new MusicForces(),flow=make(),peaks=[0,0,0];
    for(const {time,db,sampleRate,dt} of diagnosticAudio(hz)){
      flow.update(dt,music.update(dt,extractor.analyze(time,db,sampleRate,dt),defaultConfig.music,120),defaultConfig);
      for(let i=0;i<3;i++)peaks[i]=Math.max(peaks[i],flow.audioSpeed[i]);
    }
    assert.ok(peaks.every(v=>v>.02),`${hz} Hz actual audio reaches all bands: ${peaks}`);
    for(let frame=0;frame<hz*2;frame++){
      const silence=extractor.analyze(new Float32Array(2048),new Float32Array(1024).fill(-Infinity),48000,1/hz);
      flow.update(1/hz,music.update(1/hz,silence,defaultConfig.music,180),defaultConfig);
    }
    assert.ok(flow.audioSpeed.every(v=>v<.00001));geometry(flow);
  }
});

test('identical live sound gives identical flow regardless of tempo',()=>{
  const runs=[65,120,180].map(bpm=>{
    const forces=new MusicForces(),flow=make();
    for(let i=0;i<360;i++){const sound=i<120?{...silentFeatures(),rms:.3,bass:.5,kick:i%37===0?.6:0}:silentFeatures();flow.update(1/60,forces.update(1/60,sound,defaultConfig.music,bpm),defaultConfig);}
    return flow.layers;
  });assert.deepEqual(runs[0],runs[1]);assert.deepEqual(runs[1],runs[2]);
});

test('measured bass level controls speed promptly; a treble-only passage cannot keep driving the body',()=>{
  const config=structuredClone(defaultConfig);config.music.amount=1;config.music.flow=1;
  const speeds=[.12,.4,.8].map(bass=>{
    const music=new MusicForces(),flow=make();
    for(let frame=0;frame<60;frame++)music.update(1/60,silentFeatures(),config.music,135);
    // Same total level, no kick events, same BPM: only measured bass is different.
    for(let frame=0;frame<15;frame++)flow.update(1/60,music.update(1/60,{...silentFeatures(),rms:.3,bass},config.music,135),config);
    const quick=flow.audioSpeed[0];assert.ok(quick>0);
    for(let frame=0;frame<120;frame++)flow.update(1/60,music.update(1/60,{...silentFeatures(),rms:.3,bass},config.music,135),config);
    const sustained=flow.audioSpeed[0];assert.ok(quick>sustained*.45,'bass must become visible within 250 ms of feature input');
    for(let frame=0;frame<90;frame++)flow.update(1/60,music.update(1/60,{...silentFeatures(),rms:.3,high:.8},config.music,135),config);
    assert.ok(flow.audioSpeed[0]<sustained*.01,'removing bass must slow the body even while music and BPM continue');
    assert.ok(flow.audioSpeed[2]>.1,'treble still drives fine movement');
    return sustained;
  });
  assert.ok(speeds[1]>speeds[0]*2&&speeds[2]>speeds[1]*1.7);
});

test('reset recovers the original field after a long loud session, including velocities',()=>{
  const a=make(),b=make();for(let i=0;i<10000;i++)a.update(.1,response({impact:1,flow:1,shear:1,detail:1}),defaultConfig);
  a.reset(1337);assert.deepEqual(a.layers,b.layers);assert.deepEqual(a.audioSpeed,b.audioSpeed);
});

test('Shuffle has 128 reproducible states and preserves palette, resolution and music settings',()=>{
  const config=structuredClone(defaultConfig),initial=structuredClone(config),seeds=new Set<number>();
  for(let i=0;i<128;i++){seeds.add(compositionSeed(config));const saved=configSchema.parse(JSON.parse(JSON.stringify(config)));assert.equal(compositionSeed(saved),compositionSeed(config));nextShuffle(config);}
  assert.equal(seeds.size,128);assert.deepEqual(config,initial);
  const old=JSON.parse(JSON.stringify(initial));delete old.renderer.shuffle;assert.equal(configSchema.parse(old).renderer.shuffle,0);
  const seed0=compositionSeed(config);setShuffle(config,1);assert.notEqual(compositionSeed(config),seed0);
  config.renderer.shuffle=0;assert.deepEqual(config,initial);
});

test('MiniLab relative encoder advances Shuffle by one state and survives saved bindings',()=>{
  const config=structuredClone(defaultConfig),control=new MidiControl();
  const binding:MidiBinding={target:'shuffle',kind:'cc',channel:1,number:74,mode:'relative1',min:0,max:1,pickup:true};config.midi.bindings.push(binding);
  const next=control.value({kind:'cc',channel:1,number:74,value:65,pressed:false},binding,controlValue(config,'shuffle'))!;
  applyControl(config,'shuffle',next);assert.equal(config.renderer.shuffle,1);assert.equal(configSchema.parse(config).midi.bindings[0].target,'shuffle');
});

test('Shuffle pad and CC button trigger once per press, including wraparound and preset recall',()=>{
  for(const kind of ['note','cc']as const){
    const config=structuredClone(defaultConfig);config.renderer.shuffle=127;const before=structuredClone(config);
    const binding:MidiBinding={target:'shuffle:next',kind,channel:1,number:36,mode:'absolute',min:0,max:1,pickup:true};
    config.midi.bindings=[binding];const restored=configSchema.parse(JSON.parse(JSON.stringify(config))),control=new MidiControl();
    for(const velocity of [100,100,0,100,100,0]){
      const value=control.value({kind,channel:1,number:36,value:velocity,pressed:velocity>0},restored.midi.bindings[0],controlValue(config,'shuffle:next'));
      if(value!==null)applyControl(config,'shuffle:next',value);
    }
    assert.equal(config.renderer.shuffle,1,'two presses, no repeat while held or on release');
    assert.deepEqual(config.palette,before.palette);assert.deepEqual(config.macros,before.macros);assert.deepEqual(config.music,before.music);
  }
});

test('rapid encoder cues coalesce; explicit clear and frozen requests cannot get lost',()=>{
  const gate=new FlowReset();assert.equal(gate.update(.016,1337,0),'composition');
  for(let i=0;i<100;i++)assert.equal(gate.update(.016,5000+i,0),null);
  let count=0;for(let i=0;i<20;i++)if(gate.update(.016,5099,0)==='composition')count++;
  assert.equal(count,1);assert.equal(gate.seed,5099);
  assert.equal(gate.update(.016,5099,1),'history');assert.equal(gate.update(.016,5099,1),null);
  for(let i=0;i<20;i++)assert.equal(gate.update(.016,1337,2,true),null);
  assert.equal(gate.seed,5099);assert.equal(gate.update(.016,1337,2),'history');
  for(let i=0;i<10;i++)gate.update(.016,1337,2);assert.equal(gate.seed,1337);
});
