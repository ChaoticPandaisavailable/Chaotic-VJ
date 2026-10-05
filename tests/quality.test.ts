import test from 'node:test';
import assert from 'node:assert/strict';
import { configSchema,defaultConfig } from '../packages/shared/config.ts';
import { outputSize,sourceSize } from '../packages/shared/quality.ts';
import { CompositionDrift } from '../packages/visual-engine/composition.ts';
import { SceneBuffer } from '../packages/visual-engine/scene-buffer.ts';
import { ShaderMaterial,type WebGLRenderTarget } from 'three';
import { AdaptiveQuality,FramePacer,renderPolicy } from '../packages/shared/render-policy.ts';

test('older presets acquire quality and depth controls without losing a custom palette',()=>{
  const old=JSON.parse(JSON.stringify(defaultConfig));
  delete old.look;delete old.renderer.quality;delete old.renderer.frameRate;delete old.variation.roam;delete old.variation.roamAmount;delete old.variation.compositionSeed;
  old.palette.colors=['#081221','#678ca9','#faf0de'];
  const restored=configSchema.parse(old);
  assert.deepEqual(restored.palette,old.palette);assert.equal(restored.renderer.quality,'fine');assert.equal(restored.look.depth,.72);
  assert.equal(restored.renderer.frameRate,'display');
  assert.equal(restored.variation.roam,true);assert.equal(restored.variation.compositionSeed,0);
  assert.equal(configSchema.safeParse({...restored,look:{...restored.look,depth:1.1}}).success,false);
});

test('quality respects high DPI, source resolution limits and aspect ratio',()=>{
  assert.deepEqual(outputSize(1280,720,2,'fine'),{width:1920,height:1080});
  assert.deepEqual(outputSize(1920,1080,2,'ultra'),{width:3840,height:2160});
  assert.deepEqual(outputSize(1280,720,2,'performance'),{width:1280,height:720});
  assert.deepEqual(sourceSize(1920,1080,'fine'),{width:1920,height:1080});
  assert.deepEqual(sourceSize(3840,2160,'ultra'),{width:3840,height:2160});
  assert.deepEqual(sourceSize(800,450,'fine'),{width:800,height:450});
  const wide=outputSize(5120,1440,2,'ultra');assert.equal(wide.width,3840);assert.equal(wide.height,1080);
});

test('composition roaming is repeatable, bounded and continuous across target changes',()=>{
  const a=new CompositionDrift(),b=new CompositionDrift();
  for(let i=0;i<7000;i++){
    const before=[...a.values];a.update(1/60,1337,0,true,.5);b.update(1/60,1337,0,true,.5);
    assert.deepEqual(a.values,b.values);
    a.values.forEach((v,k)=>{assert.ok(Math.abs(v)<=1);assert.ok(Math.abs(v-before[k])<.015);});
  }
  assert.ok(a.revision>=3);assert.ok(a.values.some(v=>Math.abs(v)>.15));
});

test('manual composition changes ease from the current frame and hold when roaming is off',()=>{
  const a=new CompositionDrift();a.update(0,1337,0,false,.5);
  for(let i=0;i<300;i++)a.update(1/60,1337,0,false,.5);
  assert.ok(a.values.every(v=>v===0));
  a.update(1/60,1337,1,false,.5);assert.ok(a.values.every(v=>Math.abs(v)<.00001));
  for(let i=0;i<400;i++)a.update(1/60,1337,1,false,.5);
  const settled=[...a.values];assert.ok(settled.some(v=>Math.abs(v)>.1));
  for(let i=0;i<600;i++)a.update(1/60,1337,1,false,.5);
  assert.deepEqual([...a.values],settled);
  a.update(0,1337,2,false,.5);assert.deepEqual([...a.values],settled);
  const frozen=JSON.stringify(a);for(let i=0;i<120;i++)a.update(1/60,1337,2,true,.5,true);
  assert.equal(JSON.stringify(a),frozen);
});

test('composition timing agrees across frame rates before the next target',()=>{
  const a=new CompositionDrift(),b=new CompositionDrift();
  for(let i=0;i<600;i++)a.update(1/60,42,0,true,.5);
  for(let i=0;i<300;i++)b.update(1/30,42,0,true,.5);
  a.values.forEach((v,i)=>assert.ok(Math.abs(v-b.values[i])<.000001));
});

test('interrupting a visible morph never samples from the target being written',()=>{
  const deck=new SceneBuffer(),copy=new ShaderMaterial({uniforms:{uSource:{value:null}}});
  let draws=0;
  const draw=(material:ShaderMaterial,target:WebGLRenderTarget)=>{
    draws++;
    for(const name of ['uSource','uFrom','uTo','uCurrent','uPrevious','uFlow'])assert.notEqual(material.uniforms[name]?.value,target.texture,'WebGL feedback loop during interrupted transition');
  };
  deck.resize(1920,1080,copy,draw);
  deck.begin(3,copy,draw);deck.finish(.4,draw);
  for(let i=0;i<8;i++){deck.begin(3,copy,draw);deck.finish(.15,draw);}
  deck.resize(640,360,copy,draw);deck.begin(3,copy,draw);deck.finish(3,draw);
  assert.ok(draws>30);deck.dispose();copy.dispose();
});

test('switches isolate incoming history while retaining live outgoing history',()=>{
  const deck=new SceneBuffer(),copy=new ShaderMaterial({uniforms:{uSource:{value:null}}});
  const draw=(material:ShaderMaterial,target:WebGLRenderTarget)=>{
    for(const u of Object.values(material.uniforms))assert.notEqual(u.value,target.texture,'feedback');
  };
  deck.resize(2560,1440,copy,draw);deck.finish(1/144,draw);
  assert.equal(deck.historyValid,true);
  const prior=deck.previous;deck.begin(3,copy,draw);
  assert.equal(deck.historyValid,false,'first incoming draw must reject the old history');
  assert.notEqual(deck.retiringPrevious,prior);
  assert.notEqual(deck.retiringPrevious,deck.retiringDestination.texture);
  const retiringFrame=deck.retiringDestination.texture;deck.finishRetiring();
  assert.equal(deck.retiringPrevious,retiringFrame);
  deck.finish(1/144,draw);assert.equal(deck.historyValid,true);
  const outgoing=deck.retiringPrevious;deck.finish(1/144,draw);
  assert.equal(deck.retiringPrevious,outgoing,'incoming writes must not modify outgoing history');
  deck.begin(3,copy,draw);assert.equal(deck.historyValid,false);
  deck.resize(1080,1920,copy,draw);assert.equal(deck.historyValid,false);
  deck.finish(3,draw);assert.equal(deck.texture,deck.previous);assert.equal(deck.transitioning,false);
  deck.clear(()=>{});assert.equal(deck.historyValid,false);
  deck.dispose();copy.dispose();
});
test('only the owning window spends the full render budget; hidden and duplicate outputs do not draw',()=>{
  assert.deepEqual(renderPolicy(true,true,false),{fps:Infinity,draw:true,previewLimit:Infinity});
  for(const rate of ['60','120','144','165']as const)assert.equal(renderPolicy(true,true,false,false,rate).fps,Number(rate));
  assert.deepEqual(renderPolicy(false,false,false),{fps:30,draw:true,previewLimit:1707});
  assert.equal(renderPolicy(false,false,true).draw,false);
  assert.equal(renderPolicy(false,true,false).draw,false);
  assert.equal(renderPolicy(true,false,true).draw,true);
  assert.deepEqual(renderPolicy(false,false,false,true),{fps:30,draw:true,previewLimit:Infinity});
});

test('display sync follows every refresh and fixed caps preserve frame pacing at high refresh rates',()=>{
  for(const refresh of [60,120,144,165,240]){
    for(const cap of [Infinity,60,120,144,165]){
      const pacer=new FramePacer();let frames=0;
      for(let i=0;i<refresh*10;i++)if(pacer.ready(1/refresh,cap))frames++;
      assert.ok(Math.abs(frames-Math.min(refresh,cap)*10)<=1,`${refresh} Hz, cap ${cap}: ${frames}`);
    }
  }
  const pacer=new FramePacer();
  for(let i=0;i<165;i++)assert.equal(pacer.ready(1/165,Infinity),true);
  let frames=0;for(let i=0;i<165;i++)if(pacer.ready(1/165,60))frames++;
  assert.equal(frames,60);assert.equal(pacer.ready(1/165,Infinity),true);
  assert.equal(pacer.ready(5,60),true);
  for(let i=0;i<10;i++)assert.equal(pacer.ready(0,60),false,'no burst of catch-up frames after a pause');
});

test('adaptive resolution responds to sustained load but does not bounce back after a short good interval',()=>{
  const q=new AdaptiveQuality();let scale=1;
  for(let i=0;i<100;i++)scale=q.update(1/60,1,.65,'fine',true,true,21);
  assert.equal(scale,.9);
  for(let i=0;i<900;i++)scale=q.update(1/60,1,.65,'fine',true,true,7);
  assert.equal(scale,.9);
  for(let i=0;i<190;i++)scale=q.update(1/60,1,.65,'fine',true,true,7);
  assert.equal(scale,.95);
  for(let i=0;i<2000;i++)scale=q.update(1/60,1,.65,'fine',true,false,30);
  assert.equal(scale,.95);
  assert.equal(q.update(1/60,.75,.65,'fine',true,true,10),.75);
  assert.equal(q.update(1/60,1,1,'ultra',false,true,35),1);
});
