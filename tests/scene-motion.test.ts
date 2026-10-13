import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneMotion } from '../packages/visual-engine/scene-motion.ts';
import type { MusicResponse } from '../packages/audio-engine/music-forces.ts';
const quiet:MusicResponse={kick:0,strike:0,spark:0,gain:1,impact:0,flow:0,detail:0,shear:0,pressure:0,release:0,activity:0};

test('scene clocks stay still in silence; treble cannot invent bass travel or a kick',()=>{
  const state=new SceneMotion();for(let i=0;i<600;i++)state.update(1/60,{...quiet,detail:1});
  assert.deepEqual(state.drift,[0,0,99,0]);assert.equal(state.impulseTravel,0);
});
test('bass travel is independent of frame rate and holds after its release settles',()=>{
  const a=new SceneMotion(),b=new SceneMotion();
  for(let i=0;i<120;i++)a.update(1/60,{...quiet,flow:.8});
  for(let i=0;i<60;i++)b.update(1/30,{...quiet,flow:.8});
  assert.ok(Math.abs(a.drift[0]-b.drift[0])<1e-10);
  for(let i=0;i<600;i++)a.update(1/60,quiet);
  const position=a.drift[0];a.update(.1,quiet);assert.ok(Math.abs(a.drift[0]-position)<1e-10);
});
test('kick produces a broad release, tracks measured force and freezes all clocks',()=>{
  const state=new SceneMotion();
  state.update(.016,{...quiet,kick:1,impact:.2});
  state.update(.03,{...quiet,kick:.7,impact:.6});assert.equal(state.drift[3],.6);
  const before=JSON.stringify(state);for(let i=0;i<60;i++)state.update(1/60,quiet,true);assert.equal(JSON.stringify(state),before);
  const peak=state.drift[1];for(let i=0;i<30;i++)state.update(1/60,quiet);
  assert.ok(state.drift[1]>peak*.35&&state.drift[1]<peak*.5);
  state.reset();assert.deepEqual(state.drift,[0,0,99,0]);assert.equal(state.impulseTravel,0);
});
