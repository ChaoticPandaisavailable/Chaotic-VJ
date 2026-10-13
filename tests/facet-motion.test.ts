import test from 'node:test';
import assert from 'node:assert/strict';
import { FacetMotion } from '../packages/visual-engine/facet-motion.ts';
import type { MusicResponse } from '../packages/audio-engine/music-forces.ts';

const silent:MusicResponse={kick:0,strike:0,spark:0,gain:1,impact:0,flow:0,detail:0,shear:0,pressure:0,release:0,activity:0};
const copy=(motion:FacetMotion)=>motion.groups.map(group=>[...group]);
const play=(motion:FacetMotion,seconds:number,music:MusicResponse,hz=60)=>{for(let i=0;i<seconds*hz;i++)motion.update(1/hz,music);};

test('only a measured kick changes the arrangement, and sustained kick does not fabricate repeated cues',()=>{
  const held=new FacetMotion(),single=new FacetMotion();
  play(held,20,silent);
  assert.ok(held.groups.every(group=>group.every(value=>value===0)));
  const hit={...silent,kick:.9};
  held.update(1/60,hit);single.update(1/60,hit);
  play(held,10,hit);play(single,10,silent);
  assert.deepEqual(held.groups,single.groups);
  assert.ok(held.groups.some(group=>Math.abs(group[0])>.2));
  assert.ok(new Set(held.groups.map(group=>group[0].toFixed(3))).size>=4,'planes must move independently');
  const settled=copy(single);
  play(single,20,silent);
  for(let i=0;i<6;i++)for(let j=0;j<3;j++)assert.ok(Math.abs(settled[i][j]-single.groups[i][j])<1e-10,'a phrase stays in place instead of springing back');
  single.update(1/60,hit);play(single,3,silent);
  assert.notDeepEqual(copy(single),settled,'a new actual attack selects a new spatial phrase');
});

test('treble accents edges without repositioning geometry, and disabling music suppresses kick choreography',()=>{
  const high=new FacetMotion(),muted=new FacetMotion();
  play(high,1,{...silent,detail:.9,spark:1});
  assert.ok(high.groups.every(group=>group.slice(0,3).every(value=>value===0)));
  assert.ok(high.groups.every(group=>group[3]>.3));
  play(high,3,silent);
  assert.ok(high.groups.every(group=>group[3]<1e-7));
  play(muted,1,{...silent,kick:1,gain:0});
  assert.ok(muted.groups.every(group=>group.every(value=>value===0)));
});

test('choreography is bounded through prolonged energetic audio and freeze preserves every transform',()=>{
  const motion=new FacetMotion();
  for(let frame=0;frame<60*120;frame++){
    const before=copy(motion);
    motion.update(1/60,{...silent,kick:frame%24===0?1:0,flow:2,detail:.9,spark:1});
    for(let i=0;i<6;i++)for(let j=0;j<4;j++){
      assert.ok(Number.isFinite(motion.groups[i][j]));
      assert.ok(Math.abs(motion.groups[i][j])<=[.83,.43,.38,1][j]);
      if(j<3)assert.ok(Math.abs(motion.groups[i][j]-before[i][j])<.095,'new cues ease into place');
    }
  }
  const before=copy(motion);
  for(let i=0;i<600;i++)motion.update(.1,{...silent,kick:1,flow:2,detail:1},true);
  assert.deepEqual(motion.groups,before);
});

test('the same seed and timed music cues reproduce choreography across display rates',()=>{
  const runs=[30,60,144].map(hz=>{
    const motion=new FacetMotion();motion.reset(6428);
    for(let beat=0;beat<12;beat++){
      play(motion,.5,{...silent,kick:.85,flow:.75,detail:.3},hz);
      play(motion,.5,{...silent,flow:.75,detail:.3},hz);
    }
    return copy(motion);
  });
  for(const run of runs)for(let i=0;i<6;i++)for(let j=0;j<4;j++)assert.ok(Math.abs(run[i][j]-runs[0][i][j])<1e-8);
  const motion=new FacetMotion();motion.reset(6428);
  play(motion,2,{...silent,kick:.85,flow:.75,detail:.3});motion.reset(6428);
  assert.ok(motion.groups.every(group=>group.every(value=>value===0)));
});
