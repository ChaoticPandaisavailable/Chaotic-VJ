import test from 'node:test';
import assert from 'node:assert/strict';
import { configSchema, defaultConfig, scenePresets } from '../packages/shared/config.ts';
import { availableSceneIndexes, isMilkdropStyle } from '../packages/shared/scene-catalog.ts';
import { midiTargets } from '../packages/shared/midi.ts';
import { applyVisual, matchesVisual, selectedVisual, visualEntries, visualGroups } from '../apps/performer/src/visual-library.ts';
import { defaultPad, padShortcut, readPad } from '../apps/performer/src/performance-pad.ts';

test('the visual library includes every retained scene and all four chaos atmospheres',()=>{
  assert.equal(visualEntries.length,11);
  assert.equal(new Set(visualEntries.map(entry=>entry.id)).size,11);
  assert.deepEqual(availableSceneIndexes,[0,1,2,3,4,9,19,20]);
  assert.deepEqual(visualEntries.filter(entry=>!entry.atmosphere).map(entry=>entry.sceneIndex).sort((a,b)=>a-b),availableSceneIndexes.filter(index=>index!==0));
  const atmospheres=visualEntries.filter(entry=>entry.atmosphere);
  assert.deepEqual(atmospheres.map(entry=>entry.atmosphere),['nebula','clouds','ink','classic']);
  assert.ok(atmospheres.every(entry=>scenePresets[entry.sceneIndex].field.style===6));
  assert.deepEqual(visualGroups.map(group=>visualEntries.filter(entry=>entry.group===group.id).length),[6,5]);
  assert.equal(visualEntries.find(entry=>entry.id==='vortex')?.group,'atmosphere');
});

test('library grouping never renumbers persisted scene and MIDI indexes',()=>{
  const legacyStyles=[6,7,8,9,10,0,1,2,3,4,5,11,12,13,14,15,16,17,18,19,20];
  assert.deepEqual(scenePresets.map(preset=>preset.field.style),legacyStyles);
  for(const entry of visualEntries){
    const config=structuredClone(defaultConfig);
    config.performance={enabled:true,sceneB:entry.sceneIndex,mix:.42,padTarget:'b'};
    config.midi.bindings=[{target:`scene:${entry.sceneIndex}`,kind:'note',channel:1,number:48,mode:'absolute',min:0,max:1,pickup:true}];
    const performance=structuredClone(config.performance),midi=structuredClone(config.midi);
    assert.equal(applyVisual(config,entry.id),true);
    assert.equal(config.field.style,legacyStyles[entry.sceneIndex]);
    assert.equal(selectedVisual(config)?.id,entry.id);
    const recalled=configSchema.parse(JSON.parse(JSON.stringify(config)));
    assert.equal(selectedVisual(recalled)?.id,entry.id);
    assert.deepEqual(recalled.performance,performance);
    assert.deepEqual(recalled.midi,midi);
  }
});

test('new light fields remain native shaders, separate from archived MilkDrop IDs',()=>{
  for(let style=11;style<=18;style++)assert.equal(isMilkdropStyle(style),true);
  for(const style of [6,9,10,19,20])assert.equal(isMilkdropStyle(style),false);
  for(const id of ['aurora','tidal']){
    const config=structuredClone(defaultConfig);config.variation.surface='ascii';config.variation.rotation=.5;
    applyVisual(config,id);assert.equal(config.variation.surface,'fluid');assert.equal(config.variation.rotation,0);
    assert.equal(selectedVisual(configSchema.parse(JSON.parse(JSON.stringify(config))))?.id,id);
  }
});

test('search combines words across name, description, ID and category',()=>{
  const aurora=visualEntries.find(entry=>entry.id==='aurora')!;
  assert.equal(matchesVisual(aurora,' AURORA   星空 '),true);
  assert.equal(matchesVisual(aurora,'光帘 纤维'),true);
  assert.equal(matchesVisual(aurora,'光帘 波面'),false);
  assert.equal(matchesVisual(aurora,' '),true);
});

test('saved pads keep stable empty positions and reject removed or corrupt IDs',()=>{
  assert.deepEqual(readPad(null),defaultPad);
  assert.deepEqual(readPad({slots:['facets']}),defaultPad);
  assert.deepEqual(readPad(['tidal',null,'tunnel',9,'nebula','aurora','facets']),['tidal',null,null,null,'nebula','aurora']);
  assert.deepEqual(readPad([]),Array(6).fill(null));
});

test('show shortcuts do not steal typing, modifiers, repeats or IME input',()=>{
  const key={code:'Digit5',key:'5',shiftKey:false,ctrlKey:false,metaKey:false,altKey:false,repeat:false,isComposing:false};
  assert.deepEqual(padShortcut(key),{type:'play',slot:4});
  assert.deepEqual(padShortcut({...key,shiftKey:true,key:'%'}),{type:'stage',slot:4});
  for(const flag of ['ctrlKey','metaKey','altKey','repeat','isComposing'])assert.equal(padShortcut({...key,[flag]:true}),null);
  assert.equal(padShortcut(key,true),null);
  assert.equal(padShortcut({...key,code:'Digit7',key:'7'}),null);
  assert.deepEqual(padShortcut({...key,code:'Slash',key:'/'}),{type:'search'});
  assert.deepEqual(padShortcut({...key,code:'Enter',key:'Enter'}),{type:'take'});
  assert.deepEqual(padShortcut({...key,code:'Escape',key:'Escape'}),{type:'cancel'});
});

test('changing atmosphere preserves a live gas performance while entering gas restores its scene defaults',()=>{
  const config=structuredClone(defaultConfig);
  config.field.style=6;config.field.scale=2.1;config.macros.density=.23;config.macros.motion=.91;
  config.variation.surface='dots';config.variation.rotation=.35;config.variation.autoEvolve=true;
  const expected=structuredClone(config);expected.look.atmosphere='nebula';
  applyVisual(config,'nebula');
  assert.deepEqual(config,expected);

  applyVisual(config,'facets');
  const preserved={palette:structuredClone(config.palette),colorMood:structuredClone(config.colorMood),midi:structuredClone(config.midi),look:structuredClone(config.look)};
  applyVisual(config,'ink');
  assert.deepEqual(config.field,scenePresets[0].field);
  assert.deepEqual(config.macros,scenePresets[0].macros);
  assert.equal(config.variation.surface,'fluid');
  assert.equal(config.variation.rotation,0);
  assert.equal(config.variation.autoEvolve,false);
  assert.deepEqual(config.palette,preserved.palette);
  assert.deepEqual(config.colorMood,preserved.colorMood);
  assert.deepEqual(config.midi,preserved.midi);
  assert.deepEqual(config.look,{...preserved.look,atmosphere:'ink'});
});

test('all visual choices preserve custom colour, MIDI, and output settings',()=>{
  const config=structuredClone(defaultConfig);
  config.palette.colors=['#152436','#485a8a','#a1b2c3'];config.palette.background='#132435';
  config.colorLook='cedar';config.colorMood={enabled:true,warmth:.37,richness:.82};
  config.colorMotion={enabled:true,seconds:180};
  config.renderer.outputResolution='1440p';config.look.chaotic=.73;
  config.midi.bindings=[{target:'motion',kind:'cc',channel:1,number:21,mode:'relative1',min:.2,max:.8,pickup:false}];
  const before=structuredClone(config);
  for(const entry of visualEntries){
    applyVisual(config,entry.id);
    for(const key of ['palette','colorLook','colorMood','colorMotion','colorRange','renderer','midi'] as const)assert.deepEqual(config[key],before[key]);
    assert.equal(config.look.chaotic,.73);
  }
  const unchanged=structuredClone(config);
  assert.equal(applyVisual(config,'removed-visual'),false);
  assert.deepEqual(config,unchanged);
});

test('retired scenes leave selection menus while historical configs and MIDI bindings still load',()=>{
  assert.deepEqual(midiTargets.filter(target=>target.startsWith('scene:')),availableSceneIndexes.map(index=>`scene:${index}`));
  for(const index of [5,6,7,8,10,11,12,13,14,15,16,17,18]){
    const config=structuredClone(defaultConfig);
    config.field={...scenePresets[index].field};
    config.performance={enabled:true,sceneB:index,mix:.37,padTarget:'b'};
    config.midi.bindings=[{target:`scene:${index}`,kind:'note',channel:1,number:48,mode:'absolute',min:0,max:1,pickup:true}];
    const recalled=configSchema.parse(JSON.parse(JSON.stringify(config)));
    assert.deepEqual(recalled,config);
    assert.equal(selectedVisual(recalled),undefined);
  }
  const config=structuredClone(defaultConfig),before=structuredClone(config);
  for(const id of ['torrent','organism','prism','ribbon','rift','tunnel','silver','mandala','origami','amulet','mindblob','resonance','julia'])assert.equal(applyVisual(config,id),false);
  assert.deepEqual(config,before);
});
