import test from 'node:test';
import assert from 'node:assert/strict';
import { FeatureExtractor } from '../packages/audio-engine/features.ts';
import { AudioFeatureDelay,MusicForces } from '../packages/audio-engine/music-forces.ts';
import { configSchema,defaultConfig,silentFeatures,type AudioFeatures } from '../packages/shared/config.ts';
import { applyControl,controlValue } from '../packages/shared/performance.ts';
import { MidiControl,decodeMidi,type MidiBinding } from '../packages/shared/midi.ts';

const settings=()=>({...defaultConfig.music,amount:1,impact:1,flow:1,detail:1});
const signal=(patch:Partial<AudioFeatures>)=>({...silentFeatures(),...patch});
function advance(forces:MusicForces,seconds:number,input= silentFeatures(),music=settings(),hz=60){for(let i=0;i<Math.round(seconds*hz);i++)forces.update(1/hz,input,music,120);return forces.value;}

test('frequency onsets are isolated and stationary spectra do not retrigger',()=>{
  const time=Float32Array.from({length:2048},(_,i)=>Math.sin(i*.04)*.2);
  for(const [low,high,key]of [[45,145,'kick'],[650,2200,'snare'],[6000,10000,'hat']] as const){
    const db=new Float32Array(1024).fill(-Infinity),extractor=new FeatureExtractor();
    for(let i=1;i<db.length;i++)if(i*48000/2048>=low&&i*48000/2048<=high)db[i]=-20;
    const hit=extractor.analyze(time,db,48000,1/60);assert.ok(hit[key]>.2,key);
    for(const other of ['kick','snare','hat']as const)if(other!==key)assert.equal(hit[other],0,other);
    for(let i=0;i<120;i++)extractor.analyze(time,db,48000,1/60);
    assert.ok(extractor.features[key]<.0001);
  }
  for(const [bin,key]of [[60,'snare'],[324,'hat']]as const){
    const db=new Float32Array(1024).fill(-Infinity);db[bin]=-20;
    assert.ok(new FeatureExtractor().analyze(time,db,48000,1/60)[key]>.2,'narrow tonal attack');
  }
});
test('silence leaves natural animation unforced, while master zero suppresses every visual force',()=>{
  const f=new MusicForces();advance(f,2);
  for(const key of ['impact','flow','detail','shear','pressure','release','activity'] as const)assert.equal(f.value[key],0,key);
  const c={...settings(),amount:0},loud=signal({rms:1,bass:1,high:1,kick:1,hat:1,snare:1});advance(f,10,loud,c);
  for(const key of ['impact','flow','detail','shear','pressure','release','activity'] as const)assert.ok(Math.abs(f.value[key])<1e-12,key);
});

test('steady-energy bass pitch changes do not create fake kick attacks',()=>{
  const extractor=new FeatureExtractor(),time=Float32Array.from({length:2048},(_,i)=>Math.sin(i*.04)*.2);
  for(let frame=0;frame<300;frame++){
    const db=new Float32Array(1024).fill(-Infinity);db[Math.floor(frame/30)%2===0?3:6]=-14;
    const features=extractor.analyze(time,db,48000,1/60);
    if(frame>90)assert.ok(features.kick<.0001,'pitch alone must not retrigger kick');
  }
});
test('kick force has a fast attack, stays nonnegative and does not retrigger while held',()=>{
  const f=new MusicForces();advance(f,2);
  f.update(1/60,signal({kick:1,rms:.5}),settings(),120);assert.ok(f.value.impact>.1&&f.value.impact<.4);
  for(let i=0;i<120;i++){f.update(1/60,signal({kick:1,rms:.5}),settings(),120);assert.ok(f.value.impact>=0);}
  assert.ok(f.value.impact<.001);
});
test('sustained bass responds smoothly and decays; treble lights edges without driving body',()=>{
  const f=new MusicForces();advance(f,2);
  f.update(1/60,signal({rms:.5,bass:1}),settings(),120);assert.ok(f.value.flow>0&&f.value.flow<.15);
  advance(f,2,signal({rms:.5,bass:1}));assert.ok(f.value.flow>.99);assert.equal(f.value.detail,0);
  advance(f,12);assert.ok(f.value.flow<.0001);
  const edge=new MusicForces();advance(edge,2);edge.update(1/60,signal({rms:.5,high:1,hat:1}),settings(),120);
  assert.ok(edge.value.detail>.25&&edge.value.detail<.5);assert.equal(edge.value.flow,0);assert.equal(edge.value.impact,0);assert.equal(edge.value.shear,0);
});
test('freeze holds forces; build and release are bounded, one-shot and do not replay on fresh load',()=>{
  const f=new MusicForces(),music=settings();advance(f,1);music.section='build';advance(f,10,silentFeatures(),music);
  assert.ok(f.value.pressure>.95&&f.value.pressure<1);const before={...f.value};
  f.update(1,silentFeatures(),music,120,true);assert.deepEqual(f.value,before);
  music.section='steady';music.releaseId++;f.update(1/60,silentFeatures(),music,120);assert.ok(f.value.release>0&&f.value.release<.3);
  advance(f,.2,silentFeatures(),music);assert.ok(f.value.release>.65);assert.ok(f.value.pressure<before.pressure);
  advance(f,15,silentFeatures(),music);assert.ok(f.value.release<.00001);
  const fresh=new MusicForces();fresh.update(1/60,silentFeatures(),music,120);assert.equal(fresh.value.release,0);
});
test('slow forces remain time based at 30, 60 and 144 Hz',()=>{
  const results=[30,60,144].map(hz=>{const f=new MusicForces();advance(f,3,signal({rms:.5,bass:.7,high:.4}),settings(),hz);return f.value;});
  for(const key of ['flow','detail','gain']as const)assert.ok(Math.max(...results.map(v=>v[key]))-Math.min(...results.map(v=>v[key]))<.002,key);
});
test('audio alignment delays a transient, and zero delay restores immediate response',()=>{
  const delay=new AudioFeatureDelay(),hit=signal({kick:1});
  assert.equal(delay.update(.01,hit,100).kick,0);
  for(let i=0;i<9;i++)assert.equal(delay.update(.01,silentFeatures(),100).kick,0);
  assert.equal(delay.update(.011,silentFeatures(),100).kick,1);
  assert.equal(delay.update(.01,silentFeatures(),0).kick,0);
});
test('music settings migrate old presets, reject invalid input and never mutate base macros',()=>{
  const old=structuredClone(defaultConfig) as Partial<typeof defaultConfig>;delete old.music;
  const config=configSchema.parse(old),original=structuredClone(config);assert.deepEqual(config.music,defaultConfig.music);
  const f=new MusicForces();advance(f,1,signal({rms:1,bass:1,kick:1}),config.music);
  assert.deepEqual(config,original);assert.equal(configSchema.safeParse({...config,music:{...config.music,delayMs:1000}}).success,false);
});
test('MiniLab knobs and pads control music; a held release pad fires only once',()=>{
  const config=structuredClone(defaultConfig),base={...config.macros};applyControl(config,'music:flow',.85);assert.equal(controlValue(config,'music:flow'),.85);
  applyControl(config,'section:build',1);assert.equal(config.music.section,'build');
  const b:MidiBinding={target:'section:release',kind:'note',channel:1,number:36,mode:'absolute',min:0,max:1,pickup:true},control=new MidiControl();
  for(const velocity of [100,100,0,100]){const value=control.value(decodeMidi([0x90,36,velocity])!,b,0);if(value!==null)applyControl(config,b.target,value);}
  assert.equal(config.music.releaseId,2);assert.equal(config.music.section,'steady');assert.deepEqual(config.macros,base);
});
