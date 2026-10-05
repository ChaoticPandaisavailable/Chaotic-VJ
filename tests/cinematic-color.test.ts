import test from 'node:test';
import assert from 'node:assert/strict';
import { Texture,type ShaderMaterial,type WebGLRenderTarget } from 'three';
import { configSchema,defaultConfig,scenePresets,applyScenePreset } from '../packages/shared/config.ts';
import { cinematicLooks,moodLabs,prismLab } from '../packages/shared/palette.ts';
import { ColorJourney } from '../packages/shared/color-motion.ts';
import { applyControl } from '../packages/shared/performance.ts';
import { FilmicGlow } from '../packages/visual-engine/filmic-glow.ts';

test('legacy colour settings stay free; cinematic selection survives MIDI, scenes and serialization',()=>{
  const legacy=JSON.parse(JSON.stringify(defaultConfig));delete legacy.colorLook;
  assert.equal(configSchema.parse(legacy).colorLook,'free');
  assert.equal(configSchema.safeParse({...legacy,colorLook:'unknown'}).success,false);
  for(const look of cinematicLooks){
    const c=structuredClone(defaultConfig),custom=structuredClone(c.palette);c.colorLook=look.id;
    applyControl(c,'warmth',.2);applyControl(c,'richness',.8);applyScenePreset(c,scenePresets[1]);
    const saved=configSchema.parse(JSON.parse(JSON.stringify(c)));
    assert.equal(saved.colorLook,look.id);assert.deepEqual(saved.palette,custom);
    assert.equal(saved.colorMood.warmth,.2);assert.equal(saved.colorMood.richness,.8);
  }
});

test('cinematic journeys turn smoothly at the ends and freeze exactly',()=>{
  for(const look of cinematicLooks){
    const c=structuredClone(defaultConfig);c.colorLook=look.id;c.colorMood={enabled:true,warmth:.98,richness:.6};c.colorMotion.seconds=45;
    const journey=new ColorJourney();let previous={...journey.update(0,c)};
    for(let i=0;i<6000;i++){
      const next=journey.update(1/60,c);
      assert.ok(next.x>=0&&next.x<=1);assert.ok(Math.abs(next.x-previous.x)<.003);
      previous={...next};
    }
    const before=JSON.stringify(journey);journey.update(4,c,true);assert.equal(JSON.stringify(journey),before);
  }
});

test('cinematic maps are continuous across XY, with a continuous full spectrum only in prism',()=>{
  for(const look of cinematicLooks)for(const y of [0,.5,1]){
    let previous=moodLabs(0,y,look.id);
    for(let x=1;x<=1000;x++){
      const next=moodLabs(x/1000,y,look.id);
      next.forEach((p,i)=>assert.ok(Math.hypot(...p.map((v,j)=>v-previous[i][j]))<.002));previous=next;
    }
  }
  let previous=prismLab(0,.5,.5),hues=new Set<number>();
  for(let i=1;i<=1000;i++){
    const next=prismLab(i/1000,.5,.5);assert.ok(next[0]<previous[0]);
    assert.ok(Math.hypot(...next.map((v,j)=>v-previous[j]))<.007);
    if(Math.hypot(next[1],next[2])>.035)hues.add(Math.floor((Math.atan2(next[2],next[1])*180/Math.PI+360)%360/60));previous=next;
  }
  assert.ok(hues.size>=5);
});

test('filmic scattering bounds its GPU targets and never samples the framebuffer being written',()=>{
  const glow=new FilmicGlow(),source=new Texture(),palette=new Texture();
  let draws=0;
  const draw=(material:ShaderMaterial,target:WebGLRenderTarget)=>{
    draws++;assert.ok(target.width<=320&&target.height<=180);
    assert.notEqual(material.uniforms.uSource.value,target.texture);assert.notEqual(material.uniforms.uPalette?.value,target.texture);
  };
  glow.render(source,palette,3840,2160,draw);
  glow.render(source,palette,1080,1920,draw);
  assert.equal(draws,10);assert.notEqual(glow.near,glow.far);glow.dispose();source.dispose();palette.dispose();
});
