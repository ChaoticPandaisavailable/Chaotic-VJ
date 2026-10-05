import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultConfig,configSchema } from '../packages/shared/config.ts';
import { hexToLab,labToHex,lchToLab,mixLabHue,moodPalette,moodLabs,sampleMood,moodStops } from '../packages/shared/palette.ts';
import { ColorJourney } from '../packages/shared/color-motion.ts';
import { setColorMood } from '../packages/shared/performance.ts';

test('the full XY plane retains chromatic midtones, lightness hierarchy and a seamless hue seam',()=>{
  for(let yi=0;yi<=20;yi++)for(let xi=0;xi<=72;xi++){
    const labs=moodPalette(xi/72,yi/20).colors.map(hexToLab);
    assert.ok(Math.hypot(labs[2][1],labs[2][2])>.075,`grey midtone at ${xi},${yi}`);
    assert.ok(Math.hypot(labs[1][1],labs[1][2])<.069,`overcoloured shadow at ${xi},${yi}`);
    assert.ok(Math.hypot(labs[3][1],labs[3][2])<.109,`neon accent at ${xi},${yi}`);
    assert.equal(moodPalette(xi/72,yi/20).colors[4],'#ffffff');
    for(let i=1;i<5;i++)assert.ok(labs[i][0]>labs[i-1][0]+.08);
  }
  for(const y of [0,.25,.5,.75,1])assert.deepEqual(moodPalette(0,y),moodPalette(1,y));
});

test('spatial colour ramps keep the principal hue, restrained accents and clean white without a rainbow bridge',()=>{
  for(let yi=0;yi<=10;yi++)for(let xi=0;xi<=72;xi++){
    const labs=moodLabs(xi/72,yi/10),main=labs[2];
    for(let n=0;n<=100;n++){
      const t=n/100,p=sampleMood(labs,t),chroma=Math.hypot(p[1],p[2]);
      assert.ok(p.every(Number.isFinite));
      if(t<=moodStops[2]){
        // The coloured body must share one hue, irrespective of XY accent strength.
        const cross=Math.abs(p[1]*main[2]-p[2]*main[1]);assert.ok(cross<1e-10);
      }
      if(t>=moodStops[3])assert.ok(chroma<=.105001);
      const interval=t<=moodStops[1]?0:t<=moodStops[2]?1:t<=moodStops[3]?2:3;
      for(const axis of [1,2])assert.ok(p[axis]>=Math.min(labs[interval][axis],labs[interval+1][axis])-1e-10&&p[axis]<=Math.max(labs[interval][axis],labs[interval+1][axis])+1e-10);
    }
    assert.deepEqual(sampleMood(labs,1),[1,0,0]);
  }
});

test('curated pairings remain continuous across the entire hue seam and accent travel',()=>{
  for(const y of [0,.2,.5,.8,1]){
    let previous=moodLabs(0,y);
    for(let i=1;i<=3600;i++){
      const next=moodLabs(i/3600,y);
      next.forEach((p,j)=>assert.ok(Math.hypot(...p.map((v,k)=>v-previous[j][k]))<.003));
      previous=next;
    }
    const start=moodLabs(0,y),end=moodLabs(1,y);
    start.forEach((p,j)=>assert.ok(Math.hypot(...p.map((v,k)=>v-end[j][k]))<1e-10));
  }
});

test('hue interpolation retains colour through opposed endpoints and borrows hue from neutrals',()=>{
  const a=lchToLab(.6,.13,20),b=lchToLab(.6,.13,180),middle=mixLabHue(a,b,.5);
  assert.ok(Math.hypot(middle[1],middle[2])>.12);
  const neutral=mixLabHue([.6,0,0],b,.5);assert.ok(Math.hypot(neutral[1],neutral[2])>.06);
  assert.match(labToHex(middle),/^#[a-f0-9]{6}$/);
  const seam=mixLabHue(lchToLab(.6,.1,359),lchToLab(.6,.1,1),.5);
  assert.ok(seam[1]>.099);assert.ok(Math.abs(seam[2])<.0001);
});

test('colour motion is slow, frame-rate independent and stops completely on freeze',()=>{
  const c=structuredClone(defaultConfig);c.colorMood={enabled:true,warmth:.63,richness:.72};
  const a=new ColorJourney(),b=new ColorJourney();a.update(0,c);b.update(0,c);
  for(let i=0;i<60*60;i++)a.update(1/60,c);
  for(let i=0;i<60*144;i++)b.update(1/144,c);
  assert.ok(Math.abs(a.phase-1/3)<1e-10);assert.ok(Math.abs(a.phase-b.phase)<1e-10);
  assert.ok(Math.abs(a.position.x-b.position.x)<.001);assert.ok(Math.abs(a.position.y-b.position.y)<.001);
  const frozen=JSON.stringify(a);for(let i=0;i<300;i++)a.update(1/30,c,true);assert.equal(JSON.stringify(a),frozen);
  const shared=new ColorJourney();shared.update(0,c,false,a.phase);assert.ok(Math.abs(shared.phase-a.phase)<1e-10);
});

test('motion respects limited and collapsed MIDI ranges, and disabling it returns smoothly to the chosen palette',()=>{
  const c=structuredClone(defaultConfig);c.colorMood={enabled:true,warmth:.4,richness:.72};c.colorRange={enabled:true,warmMin:.3,warmMax:.7,richMin:.6,richMax:.8};
  const motion=new ColorJourney();motion.update(0,c);let previous={...motion.position};
  for(let i=0;i<6000;i++){
    const p=motion.update(.1,c);assert.ok(p.x>=.3&&p.x<=.7);assert.ok(p.y>=.6&&p.y<=.8);
    assert.ok(Math.abs(p.x-previous.x)<.01);previous={...p};
  }
  c.colorMotion.enabled=false;for(let i=0;i<300;i++)motion.update(1/30,c);
  assert.ok(Math.abs(motion.position.x-.4)<.0001);assert.ok(Math.abs(motion.position.y-.72)<.0001);
  c.colorRange.warmMax=.3;c.colorRange.richMax=.6;c.colorMotion.enabled=true;
  for(let i=0;i<500;i++)motion.update(.1,c);
  assert.equal(motion.position.x,.3);assert.equal(motion.position.y,.6);
});

test('XY never overwrites custom HEX colours and old presets acquire safe colour-motion defaults',()=>{
  const c=structuredClone(defaultConfig),saved=structuredClone(c.palette);setColorMood(c,.83,.7);assert.deepEqual(c.palette,saved);
  const old=JSON.parse(JSON.stringify(c));delete old.colorMotion;
  assert.deepEqual(configSchema.parse(old).colorMotion,{enabled:true,seconds:180});
  assert.equal(configSchema.safeParse({...c,colorMotion:{enabled:true,seconds:0}}).success,false);
});
