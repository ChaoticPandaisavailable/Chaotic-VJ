import test from 'node:test';
import assert from 'node:assert/strict';
import { configSchema, defaultConfig, scenePresets } from '../packages/shared/config.ts';
import { decodeMidi, MidiControl, relativeDelta, type MidiBinding } from '../packages/shared/midi.ts';
import { applyControl, controlValue, setColorMood } from '../packages/shared/performance.ts';
import { TransitionEnvelope } from '../packages/visual-engine/transition.ts';
import { maxSceneId } from '../packages/shared/scene-catalog.ts';

const binding:MidiBinding={target:'mix',kind:'cc',channel:1,number:74,mode:'absolute',min:0,max:1,pickup:true};
const cc=(value:number)=>decodeMidi([0xb0,74,value])!;
test('legacy config has safe, inactive performance and MIDI defaults; invalid limits are rejected',()=>{
  const old=structuredClone(defaultConfig) as Partial<typeof defaultConfig>;delete old.performance;delete old.midi;delete old.colorRange;
  const result=configSchema.parse(old);assert.equal(result.performance.enabled,false);assert.deepEqual(result.midi.bindings,[]);assert.equal(result.colorRange.enabled,false);
  assert.equal(configSchema.safeParse({...result,colorRange:{...result.colorRange,warmMin:.8,warmMax:.2}}).success,false);
  assert.equal(configSchema.safeParse({...result,midi:{bindings:[{...binding,number:128}]}}).success,false);
  assert.equal(configSchema.safeParse({...result,performance:{enabled:true,sceneB:maxSceneId+1,mix:0}}).success,false);
});
test('MIDI filters system messages and recognizes note-off conventions and channels',()=>{
  assert.equal(decodeMidi([0xf8]),null);assert.equal(decodeMidi([0xf0,1,2]),null);assert.equal(decodeMidi([0xd0,1]),null);
  assert.deepEqual(decodeMidi([0x99,36,120]),{kind:'note',channel:10,number:36,value:120,pressed:true});
  assert.equal(decodeMidi([0x99,36,0])?.pressed,false);assert.equal(decodeMidi([0x89,36,100])?.pressed,false);
});
test('pads trigger once per press and CC switches only on rising edges',()=>{
  const control=new MidiControl(),b={...binding,target:'scene:3' as const,kind:'note' as const,channel:10,number:36};
  const note=(v:number)=>decodeMidi([0x99,36,v])!;
  assert.equal(control.value(note(100),b,0),1);assert.equal(control.value(note(100),b,0),null);
  assert.equal(control.value(note(0),b,0),null);assert.equal(control.value(note(127),b,0),1);
  const button=new MidiControl(),cb={...binding,target:'scene:2' as const};
  assert.equal(button.value(cc(0),cb,0),null);assert.equal(button.value(cc(127),cb,0),1);assert.equal(button.value(cc(100),cb,0),null);
});
test('absolute knobs wait for pickup, detect crossings, re-arm after mouse moves, support inverted ranges',()=>{
  const control=new MidiControl();assert.equal(control.value(cc(0),binding,.5),null);assert.equal(control.value(cc(40),binding,.5),null);
  const caught=control.value(cc(80),binding,.5)!;assert.equal(caught,80/127);
  assert.equal(control.value(cc(90),binding,caught),90/127);
  assert.equal(control.value(cc(92),binding,.2),null);
  assert.equal(control.value(cc(20),binding,.2),20/127);
  const limited=new MidiControl();assert.equal(limited.value(cc(0),{...binding,min:.2,max:.6},.9),null);assert.equal(limited.value(cc(127),{...binding,min:.2,max:.6},.9),.6);
  const inverted={...binding,min:.8,max:.2,pickup:false};const other=new MidiControl();assert.equal(other.value(cc(0),inverted,.5),.8);assert.ok(Math.abs(other.value(cc(127),inverted,.8)!-.2)<1e-8);
});
test('all three Arturia relative modes move both ways and stop at configured limits',()=>{
  for(const [mode,up,down] of [['relative1',65,63],['relative2',1,127],['relative3',17,15]] as const){
    assert.equal(relativeDelta(up,mode),1);assert.equal(relativeDelta(down,mode),-1);
    assert.equal(relativeDelta(0,mode),0);
    const b={...binding,mode,min:.2,max:.8},control=new MidiControl();
    assert.ok(control.value(cc(up),b,.5)!>.5);assert.ok(control.value(cc(down),b,.5)!<.5);
    assert.equal(control.value(cc(up),b,.8),.8);assert.equal(control.value(cc(down),b,.2),.2);
    assert.equal(control.value(cc(0),b,.5),null);
  }
  assert.equal(relativeDelta(61,'relative1'),-3);assert.equal(relativeDelta(67,'relative1'),3);
  assert.equal(relativeDelta(125,'relative2'),-3);assert.equal(relativeDelta(3,'relative2'),3);
  assert.equal(relativeDelta(13,'relative3'),-3);assert.equal(relativeDelta(19,'relative3'),3);
});
test('colour ranges map the whole encoder travel and preserve custom palette across scene changes',()=>{
  const config=structuredClone(defaultConfig);config.colorRange={enabled:true,warmMin:.2,warmMax:.65,richMin:.15,richMax:.5};
  applyControl(config,'warmth',0);assert.equal(config.colorMood.warmth,.2);applyControl(config,'warmth',1);assert.equal(config.colorMood.warmth,.65);assert.equal(controlValue(config,'warmth'),1);
  setColorMood(config,0,1);assert.equal(config.colorMood.warmth,.2);assert.equal(config.colorMood.richness,.5);
  const palette=structuredClone(config.palette);for(let i=0;i<scenePresets.length;i++){applyControl(config,`scene:${i}` as MidiBinding['target'],1);assert.deepEqual(config.palette,palette);}
  config.colorRange.warmMax=.2;assert.equal(controlValue(config,'warmth'),.5);
  applyControl(config,'mix',.42);assert.equal(config.performance.enabled,true);assert.equal(config.performance.mix,.42);
  const field={...config.field};config.performance.padTarget='b';applyControl(config,'scene:3',1);assert.equal(config.performance.sceneB,3);assert.deepEqual(config.field,field);
});
test('eased transitions reach endpoints, survive interruptions and pause without consuming duration',()=>{
  const a=new TransitionEnvelope(),b=new TransitionEnvelope();a.begin(3);b.begin(3);
  for(let i=0;i<90;i++)a.update(1/60);for(let i=0;i<45;i++)b.update(1/30);
  assert.ok(Math.abs(a.value-.5)<1e-10);assert.ok(Math.abs(a.value-b.value)<1e-10);
  const before=a.value;for(let i=0;i<60;i++)a.update(1/60,true);assert.equal(a.value,before);
  for(let i=0;i<20;i++){a.begin(.3+i*.1);assert.equal(a.value,0);assert.ok(a.update(1/60)<.01);}
  a.update(30);assert.equal(a.value,1);
});
