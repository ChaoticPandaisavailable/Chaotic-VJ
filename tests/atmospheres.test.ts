import test from 'node:test';
import assert from 'node:assert/strict';
import { configSchema,defaultConfig } from '../packages/shared/config.ts';
import { capturePalette,rememberPalette,resetPalette } from '../packages/shared/palette-editing.ts';
import { selectedOutputSize } from '../packages/shared/quality.ts';

test('fixed output selections keep exact pixels in small windows and respect the GPU size limit',()=>{
  for(const [name,w,h]of [['1080p',1920,1080],['1440p',2560,1440],['2160p',3840,2160]]as const){
    assert.deepEqual(selectedOutputSize(name,451,617,1,'performance',false),{width:w,height:h});
    assert.deepEqual(selectedOutputSize(name,2560,1440,2,'fine',true),{width:w,height:h});
  }
  assert.deepEqual(selectedOutputSize('2160p',800,600,1,'fine',false,2048),{width:2048,height:1152});
  assert.deepEqual(selectedOutputSize('auto',1280,720,1,'fine',false),{width:1280,height:720});
  assert.deepEqual(selectedOutputSize('auto',1280,720,1,'fine',true),{width:3840,height:2160});
});

test('reset and undo preserve texture, output and MIDI while restoring all colour roles and grading',()=>{
  const c=structuredClone(defaultConfig);c.colorMood.enabled=true;c.colorLook='cedar';capturePalette(c,{x:.3,y:.7});
  const base=structuredClone(c.palette);c.palette.colors[0]='#a123bb';c.palette.colors[3]='#09ffff';c.palette.background='#444444';c.palette.brightness=1.7;c.palette.saturation=.2;
  c.look.chaotic=.72;c.look.atmosphere='ink';c.renderer.outputResolution='1440p';const before=structuredClone(c);
  const undo=resetPalette(c);assert.deepEqual(c.palette,base);assert.deepEqual(c.look,before.look);assert.deepEqual(c.renderer,before.renderer);assert.deepEqual(c.midi,before.midi);
  Object.assign(c,undo);assert.deepEqual(c,before);
  rememberPalette(c);const disk=configSchema.parse(JSON.parse(JSON.stringify(c)));disk.palette.colors[2]='#abcdef';resetPalette(disk);assert.deepEqual(disk.palette,c.palette);
});

test('older presets get natural clouds and selectable UHD output, and all atmospheres round trip',()=>{
  const old=JSON.parse(JSON.stringify(defaultConfig));delete old.look.atmosphere;delete old.renderer.outputResolution;delete old.paletteBaseline;
  const restored=configSchema.parse(old);assert.equal(restored.look.atmosphere,'clouds');assert.equal(restored.renderer.outputResolution,'2160p');assert.equal(restored.paletteBaseline,null);
  for(const atmosphere of ['clouds','ink','nebula','classic']as const){restored.look.atmosphere=atmosphere;assert.equal(configSchema.parse(JSON.parse(JSON.stringify(restored))).look.atmosphere,atmosphere);}
  assert.equal(configSchema.safeParse({...restored,renderer:{...restored.renderer,outputResolution:'8k'}}).success,false);
});
