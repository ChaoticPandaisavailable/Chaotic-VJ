import test from 'node:test';
import assert from 'node:assert/strict';
import { StarfieldMotion } from '../packages/visual-engine/starfield.ts';

const view=(sky:StarfieldMotion)=>({time:sky.time,path:[...sky.path],meteor:[...sky.meteor]});
test('meteor paths stay inside the view, fade cleanly, and have sparse irregular timing',()=>{
  const sky=new StarfieldMotion(),events:number[]=[],directions=new Set<number>(),lengths=new Set<string>();
  let previous=0,lastPath='',active=0;
  for(let frame=0;frame<600*60;frame++){
    sky.update(1/60);
    assert.ok([...sky.path,...sky.meteor,sky.time].every(Number.isFinite));
    assert.ok(sky.meteor[2]>=0&&sky.meteor[2]<=.84);
    assert.ok(Math.abs(sky.meteor[2]-previous)<.2,'meteors fade rather than pop on and off');previous=sky.meteor[2];
    if(sky.meteor[2]>0)active++;
    const key=sky.path.join(',');
    if(sky.meteor[1]>0&&key!==lastPath){
      events.push(sky.time);lastPath=key;
      assert.ok(sky.path.every(v=>v>=0&&v<=1));assert.ok(sky.path[3]<sky.path[1]);
      directions.add(Math.sign(sky.path[2]-sky.path[0]));lengths.add(sky.meteor[1].toFixed(3));
    }
  }
  assert.ok(events[0]>=3&&events[0]<=8.02);
  for(let i=1;i<events.length;i++)assert.ok(events[i]-events[i-1]>11&&events[i]-events[i-1]<28);
  assert.ok(events.length>=22&&events.length<=51);assert.equal(directions.size,2);assert.ok(lengths.size>10);
  assert.ok(active/(600*60)<.12&&active/(600*60)>.02,'occasional meteors, not a continuous shower');
});

test('sky and meteor uniforms hold exactly on freeze, then continue without skipping an event',()=>{
  const a=new StarfieldMotion(),b=new StarfieldMotion();
  for(let i=0;i<480;i++){a.update(1/60);b.update(1/60);}
  const frozen=view(a);for(let i=0;i<900;i++)a.update(.1,true);assert.deepEqual(view(a),frozen);
  a.update(1/60);b.update(1/60);assert.deepEqual(view(a),view(b));
});

test('the same sky schedule and paths agree at 30, 60 and 144 Hz',()=>{
  const runs=[30,60,144].map(hz=>{
    const sky=new StarfieldMotion(),samples=[];sky.reset(59131);
    for(let frame=1;frame<=90*hz;frame++){sky.update(1/hz);if(frame%hz===0)samples.push(view(sky));}
    return samples;
  });
  for(const run of runs)for(let i=0;i<run.length;i++){
    assert.deepEqual(run[i].path,runs[0][i].path);
    assert.ok(Math.abs(run[i].time-runs[0][i].time)<1e-8);
    for(let k=0;k<4;k++)assert.ok(Math.abs(run[i].meteor[k]-runs[0][i].meteor[k])<1e-8);
  }
});

test('Shuffle reseeds the sky while replaying a saved seed remains deterministic',()=>{
  const a=new StarfieldMotion(),b=new StarfieldMotion(),c=new StarfieldMotion();a.reset(1037);b.reset(1037);c.reset(9911);
  for(let i=0;i<1200;i++){a.update(1/60);b.update(1/60);c.update(1/60);}
  assert.deepEqual(view(a),view(b));assert.notDeepEqual(a.path,c.path);
  a.reset(1037);assert.deepEqual(a.meteor,[0,0,0,0]);assert.equal(a.time,0);
  for(let i=0;i<1200;i++)a.update(1/60);assert.deepEqual(view(a),view(b));
});
