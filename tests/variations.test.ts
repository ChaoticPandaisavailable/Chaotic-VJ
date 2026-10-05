import test from 'node:test';
import assert from 'node:assert/strict';
import { configSchema, defaultConfig, scenePresets, applyScenePreset } from '../packages/shared/config.ts';
import { hexToLab, labToHex, moodPalette } from '../packages/shared/palette.ts';
import { surfaceNames, VariationState } from '../packages/visual-engine/variations.ts';

test('legacy presets acquire neutral variation defaults without changing palette or original fields',()=>{
  const old=structuredClone(defaultConfig) as Partial<typeof defaultConfig>;delete old.variation;delete old.colorMood;
  const restored=configSchema.parse(old);assert.deepEqual(restored.palette,old.palette);assert.deepEqual(restored.field,old.field);
  assert.equal(restored.variation.surface,'fluid');assert.equal(restored.variation.autoEvolve,false);assert.equal(restored.variation.rotation,0);assert.equal(restored.colorMood.enabled,false);
  for(const preset of scenePresets)assert.ok(configSchema.safeParse({...restored,field:preset.field,macros:preset.macros}).success);
  assert.equal(configSchema.safeParse({...restored,variation:{...restored.variation,rotation:2}}).success,false);
  assert.equal(configSchema.safeParse({...restored,colorMood:{...restored.colorMood,warmth:NaN}}).success,false);
});

test('primary scenes restore their original expression after experiments while preserving colour and tempo',()=>{
  const config=structuredClone(defaultConfig);
  config.colorMood={enabled:true,warmth:.73,richness:.21};config.palette.colors=['#091022','#5574ab','#c9d9e8'];config.tempo.bpm=135;
  config.variation={...config.variation,surface:'hanzi',complexity:.12,rotation:.8,autoEvolve:true};
  const palette=structuredClone(config.palette),mood={...config.colorMood},tempo={...config.tempo};
  for(const preset of scenePresets.slice(0,3)){
    applyScenePreset(config,preset);
    assert.deepEqual(config.field,preset.field);assert.deepEqual(config.macros,preset.macros);
    assert.equal(config.variation.surface,'fluid');assert.equal(config.variation.rotation,0);assert.equal(config.variation.autoEvolve,false);assert.equal(config.variation.complexity,.72);
    assert.deepEqual(config.palette,palette);assert.deepEqual(config.colorMood,mood);assert.deepEqual(config.tempo,tempo);
  }
  config.variation.surface='dots';applyScenePreset(config,scenePresets[3]);assert.equal(config.variation.surface,'dots');
});
test('Oklab conversion round trips palette colours, and mood field preserves luminance hierarchy across the full plane',()=>{
  for(const hex of ['#000000','#ffffff','#c14e43','#27978e','#547cb9'])assert.equal(labToHex(hexToLab(hex)),hex);
  for(let y=0;y<=20;y++)for(let x=0;x<=30;x++){
    const palette=moodPalette(x/30,y/20);assert.equal(palette.colors.length,5);assert.equal(palette.background,palette.colors[0]);
    const labs=palette.colors.map(hexToLab);
    palette.colors.forEach(c=>assert.match(c,/^#[0-9a-f]{6}$/));
    for(let i=1;i<5;i++)assert.ok(labs[i][0]-labs[i-1][0]>.08,`Luminance collapsed at ${x},${y},${i}`);
    assert.ok(labs[4][0]>.88);assert.ok(labs[0][0]<.23);
  }
});
test('mood field is continuous across anchor boundaries and clamped at its edges',()=>{
  for(const x of [1/3,2/3])for(const y of [0,.5,1]){
    const a=moodPalette(x-.0001,y).colors.map(hexToLab),b=moodPalette(x+.0001,y).colors.map(hexToLab);
    a.forEach((lab,i)=>assert.ok(Math.hypot(...lab.map((v,k)=>v-b[i][k]))<.01));
  }
  assert.deepEqual(moodPalette(-1,4),moodPalette(0,1));
});
test('surface fades survive rapid interruptions with normalized nonnegative weights and frame-rate independent timing',()=>{
  const config=structuredClone(defaultConfig.variation),a=new VariationState(),b=new VariationState();config.surface='hanzi';
  for(let i=0;i<120;i++)a.update(1/60,config);
  for(let i=0;i<60;i++)b.update(1/30,config);
  a.weights.forEach((w,i)=>assert.ok(Math.abs(w-b.weights[i])<.00001));
  for(const surface of [...surfaceNames,...surfaceNames].reverse()){
    const before=Array.from(a.weights);config.surface=surface;a.update(1/60,config);
    assert.ok(Math.abs(a.weights.reduce((sum,w)=>sum+w,0)-1)<.00001);a.weights.forEach((w,i)=>{assert.ok(w>=0&&w<=1);assert.ok(Math.abs(w-before[i])<.025);});
  }
});
test('freeze holds the complete variation state; evolving forms and rotation stay bounded',()=>{
  const a=new VariationState(),config={...defaultConfig.variation,autoEvolve:true,rotation:.7,surface:'ascii' as const};
  for(let i=0;i<9000;i++){a.update(1/60,config);assert.ok(a.complexity>=0&&a.complexity<=1);assert.ok(a.particleForm>=0&&a.particleForm<=1);assert.ok(Math.abs(a.angle)<=Math.PI*2);}
  const before=JSON.stringify(a);for(let i=0;i<60;i++)a.update(1/60,config,true);assert.equal(JSON.stringify(a),before);
});
