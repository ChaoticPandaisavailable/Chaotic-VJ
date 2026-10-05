import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { configSchema,defaultConfig,applyScenePreset,scenePresets } from '../packages/shared/config.ts';
import { capturePalette,editablePalette } from '../packages/shared/palette-editing.ts';
import { moodPalette } from '../packages/shared/palette.ts';
import { PresetStore } from '../apps/upload-server/preset-store.ts';
import { uhdSize } from '../packages/shared/quality.ts';

test('old settings migrate to sparse chaos and fullscreen UHD without changing existing controls',()=>{
  const old=JSON.parse(JSON.stringify(defaultConfig));delete old.look.chaotic;delete old.look.lightAngle;delete old.renderer.fullscreenUhd;delete old.palette.mapping;
  const c=configSchema.parse(old);assert.equal(c.look.chaotic,0);assert.equal(c.renderer.fullscreenUhd,true);assert.equal(c.palette.mapping,'even');assert.deepEqual(c.palette.colors,old.palette.colors);
  c.look.chaotic=.9;applyScenePreset(c,scenePresets[0]);assert.equal(c.look.chaotic,.9);
  assert.equal(configSchema.safeParse({...c,look:{...c.look,chaotic:2}}).success,false);
});

test('editing a live cinematic palette keeps all other roles, background and spacing',()=>{
  for(const look of ['cedar','dusk','storm'] as const){
    const c=structuredClone(defaultConfig);c.colorLook=look;c.colorMood.enabled=true;
    const position={x:.72,y:.37},expected=moodPalette(position.x,position.y,look);
    assert.deepEqual(editablePalette(c,position),expected);capturePalette(c,position);
    assert.deepEqual(c.palette.colors,expected.colors);assert.equal(c.palette.background,expected.background);
    assert.equal(c.colorMotion.enabled,false);assert.equal(c.colorMood.enabled,false);assert.equal(c.palette.mapping,'cinematic');
    c.palette.colors[2]='#37c4b7';capturePalette(c,{x:0,y:1});assert.equal(c.palette.colors[2],'#37c4b7');
    assert.deepEqual(c.palette.colors.filter((_,i)=>i!==2),expected.colors.filter((_,i)=>i!==2));
  }
});

test('named presets survive a fresh store, retain custom colours, texture, light, MIDI and output settings',async()=>{
  const folder=await fs.mkdtemp(path.resolve('.runtime/preset-store-test-')),file=path.join(folder,'presets.json');
  const store=new PresetStore(file);await store.load();const c=structuredClone(defaultConfig);
  c.colorLook='cedar';c.colorMood.enabled=true;capturePalette(c);c.palette.colors[2]='#24b4c6';c.palette.background='#ffffff';c.look.chaotic=.81;c.look.light=.8;c.look.lightAngle=.2;
  const [first,second]=await Promise.all([store.save({name:'白雪青玉',config:c}),store.save({name:'第二组',config:defaultConfig})]);
  c.look.chaotic=.42;await store.save({name:'白雪青玉 · 更新',config:c},first.id);
  const restored=new PresetStore(file);await restored.load();assert.equal(restored.list().length,2);
  assert.deepEqual(restored.list().find(p=>p.id===first.id)?.config,c);assert.ok(restored.list().some(p=>p.id===second.id));
  await assert.rejects(()=>restored.save({name:'不存在',config:c},'not-an-id'));assert.equal(restored.list().length,2);
});

test('fullscreen UHD regenerates a 4K field even on small/low-DPI displays and bounds ultrawide/portrait GPUs',()=>{
  assert.deepEqual(uhdSize(1280,720),{width:3840,height:2160});
  assert.deepEqual(uhdSize(2560,1440),{width:3840,height:2160});
  assert.deepEqual(uhdSize(5120,1440),{width:3840,height:1080});
  assert.deepEqual(uhdSize(1080,1920),{width:1215,height:2160});
  assert.deepEqual(uhdSize(1920,1080,2048),{width:2048,height:1152});
});
