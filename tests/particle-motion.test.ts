import test from 'node:test';
import assert from 'node:assert/strict';
import { ParticleMusicMotion,particleCycleDuration,sampleParticleCycle,sampleParticleKick } from '../packages/visual-engine/particle-motion.ts';

test('particle curvature clock repeats in a bounded sequence',()=>{
  assert.deepEqual(Array.from(sampleParticleCycle(0,0)).slice(0,3),[1,0,0]);
  assert.deepEqual(Array.from(sampleParticleCycle(8,0)).slice(0,3),[0,1,0]);
  assert.deepEqual(Array.from(sampleParticleCycle(16,0)).slice(0,3),[0,0,1]);
  for(let i=0;i<=1440;i++){
    const a=sampleParticleCycle(i/60,1337),b=sampleParticleCycle(i/60+particleCycleDuration,1337);
    assert.ok(a.every(Number.isFinite));
    assert.ok(a.slice(0,3).every(v=>v>=0&&v<=1));
    assert.ok(Math.abs(a[0]+a[1]+a[2]-1)<1e-6);
    for(let k=0;k<4;k++)assert.ok(Math.abs(a[k]-b[k])<1e-6);
  }
});

test('shape weights enter each phase without a cut or velocity jump',()=>{
  const step=.001;
  for(const t of [0,8,16,24]){
    const a=sampleParticleCycle(t-step,0),b=sampleParticleCycle(t,0),c=sampleParticleCycle(t+step,0);
    for(let k=0;k<3;k++){
      assert.ok(Math.abs(a[k]-c[k])<1e-6);
      assert.ok(Math.abs((c[k]-b[k])-(b[k]-a[k]))/step<.0001);
    }
  }
});

test('sampling at the same visual time is deterministic across refresh rates and frozen frames',()=>{
  const target=new Float32Array(4),initial=Array.from(sampleParticleCycle(5.25,5371,target));
  for(let i=0;i<600;i++)assert.deepEqual(Array.from(sampleParticleCycle(5.25,5371,target)),initial);
  for(const hz of [30,60,144]){
    let time=0;for(let i=0;i<12*hz;i++){time+=1/hz;sampleParticleCycle(time,5371,target);}
    const expected=sampleParticleCycle(12,5371);
    for(let k=0;k<4;k++)assert.ok(Math.abs(target[k]-expected[k])<1e-6);
  }
  assert.notDeepEqual(Array.from(sampleParticleCycle(5.25,5372)),initial);
});

test('measured kicks reach regions in sequence across three currents instead of scaling every region together',()=>{
  const early=sampleParticleKick([0,.5,.02,.8]);
  assert.ok(early[0]>0);
  assert.equal(Array.from(early).filter(value=>value>0).length,1);
  const middle=sampleParticleKick([0,.5,.09,.8]);
  assert.ok(Array.from(middle).filter(value=>value>0).length>1);
  assert.ok(Array.from(middle).filter(value=>value===0).length>1);
  const late=sampleParticleKick([0,.5,.35,.8]);
  assert.ok(late.every(value=>value>0));
  assert.ok(new Set(Array.from(late).map(value=>value.toFixed(5))).size>10);
  for(let index=0;index<15;index++)assert.ok(late[index]<.8,'response must remain bounded by measured kick strength');
});

test('silence, bass-only flow and invalid kick clocks cannot create region strikes',()=>{
  for(const drift of [[0,0,99,0],[200,0,99,0],[200,1,.3,0],[0,1,-1,1],[0,1,NaN,1],[0,1,.3,NaN],[0,0,5,1]]){
    assert.ok(sampleParticleKick(drift).every(value=>value===0));
  }
  const loud=sampleParticleKick([0,1,.3,1]),quiet=sampleParticleKick([0,1,.3,.2]);
  for(let i=0;i<15;i++)assert.ok(Math.abs(quiet[i]-loud[i]*.2)<1e-7,'detection confidence cannot replace measured strength');
});

test('region response has no per-render integration and frozen or repeated deck renders stay identical',()=>{
  const shared=new Float32Array([2.7,.5,.22,.65]),target=new Float32Array(15);
  const reference=Array.from(sampleParticleKick(shared,target));
  for(let i=0;i<600;i++)assert.deepEqual(Array.from(sampleParticleKick(shared,target)),reference);
  assert.deepEqual(Array.from(shared),Array.from(new Float32Array([2.7,.5,.22,.65])));
  assert.equal(sampleParticleKick(shared,target),target);
  for(const hz of [30,60,144]){
    let time=0;for(let i=0;i<hz;i++){time+=1/hz;sampleParticleKick([3,1,time,.75],target);}
    const expected=sampleParticleKick([3,1,1,.75]);
    for(let i=0;i<15;i++)assert.ok(Math.abs(target[i]-expected[i])<1e-7);
  }
});

test('closely spaced measured kicks release existing region motion without a one-frame collapse',()=>{
  const motion=new ParticleMusicMotion(),dt=1/60;
  for(let frame=0;frame<60;frame++)motion.update(dt,[0,.8,frame*dt,.9]);
  assert.ok(motion.values.every(value=>value>.1));
  const previous=Array.from(motion.values);
  motion.update(dt,[0,.8,0,.9]);
  for(let i=0;i<15;i++){
    assert.ok(motion.values[i]>previous[i]*.85,'a new attack cannot cut off the preceding region release');
    assert.ok(motion.values[i]<previous[i]);
  }
  for(let frame=0;frame<600;frame++){
    const before=Array.from(motion.values);
    motion.update(dt,[0,.8,(frame%10)*dt,.9]);
    for(let i=0;i<15;i++){
      assert.ok(Number.isFinite(motion.values[i]));
      assert.ok(motion.values[i]>=0&&motion.values[i]<=.9);
      assert.ok(motion.values[i]>=before[i]*.85,'dense attacks retain a continuous release');
    }
  }
  for(let frame=0;frame<240;frame++)motion.update(dt,[0,0,99,0]);
  assert.ok(motion.values.every(value=>value<1e-10));
});

test('shared region smoothing freezes exactly, resets to rest, and does not mutate input clocks',()=>{
  const motion=new ParticleMusicMotion(),drift=new Float32Array([2.4,.8,.17,.9]);
  const initial=Array.from(drift);
  for(let i=0;i<40;i++)assert.equal(motion.update(1/60,drift),motion.values);
  assert.deepEqual(Array.from(drift),initial);
  const held=Array.from(motion.values);
  for(let i=0;i<120;i++)motion.update(1/60,[200,1,0,1.5],true);
  for(const dt of [0,-1,NaN])motion.update(dt,[200,1,0,1.5]);
  assert.deepEqual(Array.from(motion.values),held);
  motion.reset();
  assert.ok(motion.values.every(value=>value===0));
  for(let i=0;i<120;i++)motion.update(1/60,[200,0,99,0]);
  assert.ok(motion.values.every(value=>value===0));
});
