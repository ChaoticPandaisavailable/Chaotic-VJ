import test from 'node:test';
import assert from 'node:assert/strict';
import { PhotoQueue } from '../apps/upload-server/queue.ts';
import { defaultConfig, photoEnvelope, estimateWait, configSchema } from '../packages/shared/config.ts';
import { FeatureExtractor, smooth } from '../packages/audio-engine/features.ts';
import { JsonFrames, parseOS2L, readOSC, oscMessage } from '../packages/dj-bridge/index.ts';
import { ImpulseField } from '../packages/visual-engine/impulses.ts';

function setup(){return new PhotoQueue(structuredClone(defaultConfig),{freeze:false,blackout:false,queuePaused:false,clearVersion:0});}
test('photo envelope: first 2 seconds fade in, 15 starts fade, 18 removes all contribution',()=>{
  const p=defaultConfig.photos;assert.equal(photoEnvelope(0,p),0);assert.equal(photoEnvelope(1,p),.5);assert.equal(photoEnvelope(2,p),1);assert.equal(photoEnvelope(15,p),1);assert.equal(photoEnvelope(16.5,p),.5);assert.equal(photoEnvelope(18,p),0);assert.equal(photoEnvelope(200,p),0);
});
test('20 photos finish processing in reverse order but play FIFO; twentieth waits 342 seconds',()=>{
  const q=setup(),photos=Array.from({length:20},(_,i)=>q.reserve(`Photo ${i}`,'test'));
  for(const p of photos.slice(1).reverse())q.ready(p.id,1);
  assert.equal(q.next(),undefined);q.ready(photos[0].id,1);
  assert.equal(estimateWait(q.photos,photos[19].id,q.config,false),342);
  for(const p of photos){assert.equal(q.next()?.id,p.id);assert.ok(q.start(p.id));for(let i=0;i<36;i++)q.advance(p.id,.5);assert.equal(p.status,'Done');}
  assert.equal(q.next(),undefined);
});
test('ready texture/start ACK gates clock; freeze, blackout and queue pause preserve age',()=>{
  const q=setup(),p=q.reserve('one','test');q.advance(p.id,.5);assert.equal(p.age,0);q.ready(p.id,1);q.advance(p.id,.5);assert.equal(p.age,0);q.start(p.id);q.advance(p.id,.5);
  for(const key of ['freeze','blackout','queuePaused']as const){q.transport[key]=true;q.advance(p.id,.5);assert.equal(p.age,.5);assert.equal(estimateWait(q.photos,p.id,q.config,true),null);q.transport[key]=false;}
  q.advance(p.id,.5);assert.equal(p.age,1);
});
test('deleting during processing and active cannot be resurrected by late completion',()=>{
  const q=setup(),first=q.reserve('private.jpg','test'),second=q.reserve('second.jpg','test');q.delete(first.id);assert.equal(q.ready(first.id,1),false);q.fail(first.id,'late error');assert.equal(first.status,'Deleted');assert.equal(first.name,'');q.ready(second.id,1);q.start(second.id);q.delete(second.id);q.advance(second.id,.5);assert.equal(q.activeId,null);assert.equal(q.start(second.id),false);assert.equal(second.status,'Deleted');
});
test('failed head and processing timeout unblock following ready photo; capacity rejects without overwriting',()=>{
  const q=setup();q.config.photos.maxQueued=2;const a=q.reserve('a','test'),b=q.reserve('b','test');assert.throws(()=>q.reserve('c','test'),/队列已满/);q.ready(b.id,1);q.expire(a.receivedAt+45001);assert.equal(a.status,'Failed');assert.equal(q.next()?.id,b.id);assert.equal(q.photos.length,2);
});
test('snapshot restore never replays done/deleted photos; interrupted processing is failed',()=>{
  const q=setup(),a=q.reserve('a','test'),b=q.reserve('b','test'),c=q.reserve('c','test');q.delete(a.id);q.ready(b.id,1);q.start(b.id);for(let i=0;i<36;i++)q.advance(b.id,.5);const r=setup();r.restore(JSON.parse(JSON.stringify(q.photos)));assert.equal(r.next(),undefined);assert.equal(r.get(c.id)?.status,'Failed');
});
test('moderation holding area, explicit approval and start constraints',()=>{
  const q=setup();q.config.photos.moderation=true;const p=q.reserve('a','guest');q.ready(p.id,1);assert.equal(p.status,'Pending');assert.equal(q.start(p.id),false);q.approve(p.id);assert.equal(q.start(p.id),true);
});
test('presets reject unbounded values, malformed colors and non-finite numbers',()=>{
  assert.ok(configSchema.safeParse(defaultConfig).success);const c=structuredClone(defaultConfig);c.macros.energy=5;assert.equal(configSchema.safeParse(c).success,false);c.macros.energy=NaN;assert.equal(configSchema.safeParse(c).success,false);c.macros.energy=.5;c.palette.colors[0]='red';assert.equal(configSchema.safeParse(c).success,false);
});
test('audio smooth is time based; silence is stable; bass and high use different bands',()=>{
  let split=0;for(let i=0;i<60;i++)split=smooth(split,1,1/60,.2,.4);assert.ok(Math.abs(split-smooth(0,1,1,.2,.4))<1e-10);
  const time=new Float32Array(2048),db=new Float32Array(1024).fill(-Infinity),extractor=new FeatureExtractor();assert.deepEqual(extractor.analyze(time,db,48000,1/60),{rms:0,bass:0,mid:0,high:0,centroid:0,flux:0,onset:0,kick:0,peak:0});
  for(let i=0;i<time.length;i++)time[i]=Math.sin(i*.03)*.1;db[4]=-10;let f=extractor.analyze(time,db,48000,.1);assert.ok(f.bass>f.high);const treble=new FeatureExtractor();db.fill(-Infinity);for(let i=200;i<350;i++)db[i]=-20;f=treble.analyze(time,db,48000,.1);assert.ok(f.high>f.bass);assert.ok(f.onset>0);
});
test('low-band transient drives kick; treble-only hits do not trigger a kick',()=>{
 const time=Float32Array.from({length:2048},(_,i)=>Math.sin(i*.03)*.2),low=new Float32Array(1024).fill(-Infinity),high=new Float32Array(1024).fill(-Infinity);
 low[3]=-6;low[4]=-9;high[200]=-6;high[230]=-9;
 const a=new FeatureExtractor(),b=new FeatureExtractor();assert.ok(a.analyze(time,low,48000,1/60).kick>.2);assert.equal(b.analyze(time,high,48000,1/60).kick,0);
 const held=a.features.kick;assert.ok(a.analyze(time,low,48000,1/60).kick<held);
});
test('kick impulses keep spatial identity, decay once, and move continuously across frame rates',()=>{
 const a=new ImpulseField(),b=new ImpulseField();a.reset(42);b.reset(42);
 a.update(1/60,1,.6);b.update(1/60,1,.6);const origin={x:a.events[0].x,y:a.events[0].y};
 for(let i=0;i<60;i++)a.update(1/60,Math.exp(-(i+1)/10),.6);
 for(let i=0;i<30;i++)b.update(1/30,Math.exp(-(i+1)/5),.6);
 assert.equal(a.events[0].x,origin.x);assert.equal(a.events[0].y,origin.y);assert.equal(a.events[1].strength,0);
 assert.ok(Math.abs(a.x-b.x)<.001&&Math.abs(a.y-b.y)<.001);
 for(let i=0;i<600;i++)a.update(1/60,0,.6);assert.ok(Math.abs(a.x)<.01&&Math.abs(a.y)<.01);
});
test('OS2L handles fragmented/coalesced TCP messages and keeps unknown fields null',()=>{
  const frames=new JsonFrames();assert.deepEqual(frames.push('{"evt":"be'),[]);const result=frames.push('at","pos":42,"bpm":128}{"evt":"beat","pos":43,"bpm":129}\n');assert.equal(result.length,2);const state=parseOS2L(result[0],123)!;assert.equal(state.currentBpm,128);assert.equal(state.originalBpm,null);assert.equal(state.beatInBar,null);assert.equal(state.receivedAt,123);assert.equal(parseOS2L({evt:'beat',bpm:NaN,pos:1}),null);
});
test('OSC query codec and malformed packet handling',()=>{
  assert.deepEqual(readOSC(oscMessage('/vdj/query/deck/1/get_bpm')),[{address:'/vdj/query/deck/1/get_bpm',values:[]}]);assert.deepEqual(readOSC(Buffer.from('bad')),[]);
});
