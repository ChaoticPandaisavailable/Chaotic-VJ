import test from 'node:test';
import assert from 'node:assert/strict';
import { LightFieldMotion } from '../packages/visual-engine/light-motion.ts';

test('silence and sustained bass never invent light waves',()=>{
  const motion=new LightFieldMotion();
  for(let i=0;i<600;i++)motion.update(1/60,[i,0,99,0]);
  assert.ok(motion.waves.every(wave=>wave[0]===99&&wave[1]===0));
});

test('consecutive kicks overlap without resetting the preceding wave',()=>{
  const motion=new LightFieldMotion();motion.update(.01,[0,0,0,.3]);
  motion.update(.04,[0,0,.04,.7]);
  for(let i=1;i<=10;i++)motion.update(.04,[0,0,.04+i*.04,0]);
  const before=[...motion.waves[0]];
  motion.update(.02,[0,0,0,.6]);
  assert.equal(motion.waves[0][0],before[0]+.02);
  assert.equal(motion.waves[0][1],.7);assert.equal(motion.waves[1][1],.6);
  assert.notDeepEqual(motion.waves[0].slice(2),motion.waves[1].slice(2));
  assert.equal(motion.waves.filter(wave=>wave[1]>0).length,2);
});

test('wave storage is bounded, frozen with the show, and cleared by reset',()=>{
  const motion=new LightFieldMotion();
  for(let i=0;i<40;i++){motion.update(.05,[0,0,0,.5]);motion.update(.1,[0,0,.1,.5]);}
  assert.equal(motion.waves.length,6);assert.ok(motion.waves.every(wave=>wave.every(Number.isFinite)));
  const before=structuredClone(motion.waves);for(let i=0;i<120;i++)motion.update(1/60,[0,0,0,1],true);
  assert.deepEqual(motion.waves,before);
  motion.reset();assert.ok(motion.waves.every(wave=>wave[0]===99&&wave[1]===0));
});
