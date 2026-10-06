import test from 'node:test';
import assert from 'node:assert/strict';
import { NebulaMotion } from '../packages/visual-engine/nebula-motion.ts';

test('nebula stays in view and changes local directions smoothly during prolonged loud input',()=>{
  const motion=new NebulaMotion(),positive=[0,0,0,0],negative=[0,0,0,0],rest=[0,0,0,0];
  for(let frame=0;frame<30*60*60;frame++){
    const previous=[...motion.values];motion.update(1/60,1,8);
    for(let i=0;i<4;i++){
      const v=motion.values[i],delta=v-previous[i];assert.ok(Number.isFinite(v));
      assert.ok(Math.abs(v)<=[.4,.26,.24,.2][i]+1e-12,'offsets and local angles cannot accumulate into an orbit');
      assert.ok(Math.abs(delta)<.0023,'random target changes must not jump or whip around');
      if(delta>.00001)positive[i]++;else if(delta<-.00001)negative[i]++;else rest[i]++;
    }
  }
  for(let i=0;i<4;i++){assert.ok(positive[i]>1000&&negative[i]>1000,'both directions must occur');assert.ok(rest[i]>1000,'slow settling phases remain between changes');}
});

test('quiet and loud nebula drift agree across display rates even through many random target boundaries',()=>{
  for(const wind of [0,8]){
    const runs=[30,60,144].map(hz=>{
      const motion=new NebulaMotion();motion.reset(63271);
      for(let frame=0;frame<300*hz;frame++)motion.update(1/hz,.62,wind);
      return motion.values;
    });
    for(const values of runs)for(let i=0;i<4;i++)assert.ok(Math.abs(values[i]-runs[0][i])<1e-8);
  }
});

test('freeze holds the nebula, Shuffle changes its route, and the same seed replays it',()=>{
  const a=new NebulaMotion(),b=new NebulaMotion(),other=new NebulaMotion();other.reset(552);
  for(let i=0;i<2400;i++){a.update(1/60,.6,1);b.update(1/60,.6,1);other.update(1/60,.6,1);}
  assert.deepEqual(a.values,b.values);assert.notDeepEqual(a.values,other.values);
  const before=[...a.values];for(let i=0;i<600;i++)a.update(.1,1,8,true);assert.deepEqual(a.values,before);
  a.update(1/60,.6,1);b.update(1/60,.6,1);assert.deepEqual(a.values,b.values);
  a.reset(1337);assert.deepEqual(a.values,[0,0,0,0]);
  for(let i=0;i<2401;i++)a.update(1/60,.6,1);assert.deepEqual(a.values,b.values);
});

test('stronger music cannot turn the nebula drift into a fast global spin',()=>{
  const strong=new NebulaMotion(),extreme=new NebulaMotion();
  for(let i=0;i<3600;i++){strong.update(1/60,.6,3);extreme.update(1/60,.6,100);}
  assert.deepEqual(strong.values,extreme.values,'structural drift has an independent speed ceiling');
});
