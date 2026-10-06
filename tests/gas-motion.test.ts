import test from 'node:test';
import assert from 'node:assert/strict';
import { GasMotion, gasComposite, gasLayerSettings, hasGasMotion } from '../packages/visual-engine/gas-motion.ts';
import { FlowReset } from '../packages/visual-engine/flow-reset.ts';
import { MusicForces, type MusicResponse } from '../packages/audio-engine/music-forces.ts';
import { FeatureExtractor } from '../packages/audio-engine/features.ts';
import { defaultConfig, configSchema, silentFeatures } from '../packages/shared/config.ts';
import { compositionSeed, nextShuffle, setShuffle } from '../packages/shared/shuffle.ts';
import { applyControl, controlValue } from '../packages/shared/performance.ts';
import { MidiControl, type MidiBinding } from '../packages/shared/midi.ts';
import { diagnosticAudio } from './helpers/diagnostic-audio.ts';
const response=(extra:Partial<MusicResponse>={}):MusicResponse=>({kick:0,strike:0,spark:0,gain:.7,impact:0,flow:0,detail:0,shear:0,pressure:0,release:0,activity:0,...extra});
const make=()=>{const flow=new GasMotion();flow.reset(1337);return flow;};

test('gas sheets stay finite and continuous through 30 minutes of maximum live forces',()=>{
  const flow=make(),previous=flow.layers.map(l=>[...l]);
  const loud=response({impact:1,flow:1,detail:1,shear:1,release:1,pressure:1});
  for(let frame=0;frame<30*60*60;frame++){
    flow.update(1/60,loud,defaultConfig);
    assert.ok(Math.hypot(flow.layers[0][0],flow.layers[0][1])<=1.400001,'main nebula cannot drift beyond the standard viewport half-height of 1.6');
    for(let i=0;i<3;i++){
      const l=flow.layers[i];assert.ok(l.every(Number.isFinite));
      assert.ok(Math.abs(l[0])<=gasLayerSettings[i].radius*2&&Math.abs(l[1])<=gasLayerSettings[i].radius*2);
      assert.ok(Math.hypot(l[0]-previous[i][0],l[1]-previous[i][1])<.04,'phase wrapping cannot jump the image');
      assert.ok(Math.hypot(l[2],l[3])<.01,'acoustic tremor stays small');
      previous[i]=[...l];
    }
  }
  assert.ok(Number.isFinite(flow.evolution));
  flow.reset(1337);assert.deepEqual(flow.layers,make().layers);assert.deepEqual(flow.audioSpeed,[0,0,0]);assert.equal(flow.evolution,0);
});

test('depth sheets move independently, keep flowing in silence and hold exactly on freeze',()=>{
  const flow=make();for(let i=0;i<240;i++)flow.update(1/60,response({flow:.5}),defaultConfig);
  const main=flow.layers[0],far=flow.layers[1],near=flow.layers[2];
  assert.ok(Math.hypot(main[0]-far[0],main[1]-far[1])>.03);
  assert.ok(Math.hypot(main[0]-near[0],main[1]-near[1])>.03);
  const frozen=structuredClone(flow.layers);flow.update(.1,response({}),defaultConfig,true);assert.deepEqual(flow.layers,frozen);
  for(let i=0;i<300;i++)flow.update(1/60,response({}),defaultConfig);
  assert.notDeepEqual(flow.layers,frozen);assert.ok(flow.audioSpeed.every(v=>v<1e-12));
  assert.ok(flow.layers.every(l=>l[2]===0&&l[3]===0),'silence stops vibration, not natural drift');
});

test('gas optical overlap attenuates the background instead of squeezing its coordinates',()=>{
  const rear=gasComposite([0,.7,.2],[.25,.8,.45],.6);
  const foreground=gasComposite([.8,.7,.2],[.25,.8,.45],.6);
  assert.ok(foreground<rear,'a near dark wisp can cover a bright rear cloud');
  assert.equal(gasComposite([1,.7,.2],[.25,.8,.45],.6),.25,'opaque front sheet hides all rear radiance');
  assert.equal(gasComposite([0,0,0],[.25,.8,.45],.6),.6,'empty air reveals the star field');
  for(let a=0;a<=1;a+=.1){
    const bright=gasComposite([a,.3,.4],[.7,.8,.4],1),dark=gasComposite([a,.3,.4],[.7,.8,.4],0);
    assert.ok(Math.abs((bright-dark)-(1-a)*.7*.6)<1e-12,'sky is transmitted through all sheets');
    assert.ok(bright>=0&&bright<=1);
  }
});

test('gas effects are scoped to native chaos; geometry, crystals, particles and other scenes stay separate',()=>{
  for(let style=0;style<19;style++)assert.equal(hasGasMotion(style),style===6);
});

test('audio strength drives wind promptly, without a BPM-generated tremor',()=>{
  const config=structuredClone(defaultConfig);config.music.amount=config.music.flow=1;
  const speeds=[.12,.4,.8].map(bass=>{
    const forces=new MusicForces(),flow=make();for(let i=0;i<60;i++)forces.update(1/60,silentFeatures(),config.music,135);
    for(let i=0;i<15;i++)flow.update(1/60,forces.update(1/60,{...silentFeatures(),rms:.3,bass},config.music,135),config);
    const quick=flow.audioSpeed[0];
    for(let i=0;i<120;i++)flow.update(1/60,forces.update(1/60,{...silentFeatures(),rms:.3,bass},config.music,135),config);
    const sustained=flow.audioSpeed[0];assert.ok(quick>sustained*.45);
    assert.ok(flow.layers.some(l=>Math.abs(l[2])+Math.abs(l[3])>.0001));
    for(let i=0;i<180;i++)flow.update(1/60,forces.update(1/60,{...silentFeatures(),rms:.3,high:.8},config.music,135),config);
    assert.ok(flow.audioSpeed[0]<sustained*.001,'bass exit stops its wind even while treble continues');
    assert.ok(flow.layers.every(l=>Math.abs(l[2])+Math.abs(l[3])<.000001));
    assert.ok(flow.audioSpeed[2]>.01);return sustained;
  });assert.ok(speeds[1]>speeds[0]*1.7&&speeds[2]>speeds[1]*1.18,'soft-knee bass keeps audible dynamics instead of clipping them');
  const runs=[65,120,180].map(bpm=>{
    const music=new MusicForces(),flow=make();for(let i=0;i<360;i++)flow.update(1/60,music.update(1/60,i<120?{...silentFeatures(),rms:.3,bass:.5,kick:i%37===0?.6:0}:silentFeatures(),config.music,bpm),config);return flow.layers;
  });assert.deepEqual(runs[0],runs[1]);assert.deepEqual(runs[1],runs[2]);
});

test('bass advances internal gas growth monotonically; freeze and silence cannot cause recoil',()=>{
  const gas=make();for(let i=0;i<60;i++)gas.update(1/60,response({}),defaultConfig);assert.equal(gas.evolution,0);
  let last=0;for(let i=0;i<60;i++){gas.update(1/60,response({flow:.35}),defaultConfig);assert.ok(gas.evolution>last);last=gas.evolution;}
  assert.ok(gas.evolution>.8,'measured bass must noticeably advance internal growth');
  const frozen=gas.evolution;gas.update(.1,response({flow:1}),defaultConfig,true);assert.equal(gas.evolution,frozen);
  for(let i=0;i<180;i++){gas.update(1/60,response({}),defaultConfig);assert.ok(gas.evolution>=last);last=gas.evolution;}
  for(let i=0;i<60;i++)gas.update(1/60,response({}),defaultConfig);
  assert.ok(gas.evolution-last<1e-8,'audio growth settles after silence without rewinding the material');
});

test('the UI demo WAV produces visible-scale movement at normal and reduced volume',()=>{
  const config=structuredClone(defaultConfig);Object.assign(config.music,{amount:1,flow:.95,impact:1,detail:1});config.modulation.bass=.5;
  for(const [volume,minPeak,minExtraGrowth,minTravelRatio]of [[1,.3,4,5],[.35,.12,1,2],[.12,.05,.2,1.2]]){
    const extractor=new FeatureExtractor(),forces=new MusicForces(),gas=make(),quiet=make();
    for(let i=0;i<60;i++)forces.update(1/60,silentFeatures(),config.music,120);
    let peak=0,travel=0,quietTravel=0;
    for(const frame of diagnosticAudio(60)){
      const features=extractor.analyze(frame.time.map(x=>x*volume),frame.db.map(x=>x+20*Math.log10(volume)),frame.sampleRate,frame.dt);
      const music=forces.update(frame.dt,features,config.music,120),old=[...gas.layers[0]],oldQuiet=[...quiet.layers[0]];
      gas.update(frame.dt,music,config);quiet.update(frame.dt,response({}),config);
      travel+=Math.hypot(gas.layers[0][0]-old[0],gas.layers[0][1]-old[1]);quietTravel+=Math.hypot(quiet.layers[0][0]-oldQuiet[0],quiet.layers[0][1]-oldQuiet[1]);
      peak=Math.max(peak,music.flow);
    }
    assert.ok(peak>minPeak,'demo must produce useful bass control even below full volume');
    assert.ok(gas.evolution>minExtraGrowth);assert.ok(travel>quietTravel*minTravelRatio);
  }
});

test('master zero keeps natural wind only; equal live input is stable across display refresh rates',()=>{
  const a=make(),b=make();for(let i=0;i<120;i++){a.update(1/60,response({gain:0,flow:1,impact:1,detail:1,shear:1}),defaultConfig);b.update(1/60,response({}),defaultConfig);}assert.deepEqual(a.layers,b.layers);
  const runs=[30,60,144].map(hz=>{const f=make();for(let i=0;i<hz*10;i++)f.update(1/hz,response(i<hz*4?{flow:.4,shear:.2,detail:.3}:{}),defaultConfig);return f;});
  for(const run of runs){assert.ok(Math.abs(run.evolution-runs[0].evolution)<1e-9);for(let i=0;i<3;i++)for(let j=0;j<4;j++)assert.ok(Math.abs(run.layers[i][j]-runs[0].layers[i][j])<1e-9);}
});

test('actual test WAV drives layered wind at 30 / 60 / 144 Hz and settles after stopping',()=>{
  for(const hz of [30,60,144]){
    const extractor=new FeatureExtractor(),music=new MusicForces(),flow=make(),peaks=[0,0,0];
    for(const {time,db,sampleRate,dt} of diagnosticAudio(hz)){
      flow.update(dt,music.update(dt,extractor.analyze(time,db,sampleRate,dt),defaultConfig.music,120),defaultConfig);
      for(let i=0;i<3;i++)peaks[i]=Math.max(peaks[i],flow.audioSpeed[i]);
    }
    assert.ok(peaks.every(v=>v>.02));
    for(let i=0;i<hz*2;i++){const silence=extractor.analyze(new Float32Array(2048),new Float32Array(1024).fill(-Infinity),48000,1/hz);flow.update(1/hz,music.update(1/hz,silence,defaultConfig.music,180),defaultConfig);}
    assert.ok(flow.audioSpeed.every(v=>v<.00001));assert.ok(flow.layers.every(l=>l[2]===0&&l[3]===0));
  }
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
