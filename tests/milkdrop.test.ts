import test from 'node:test';
import assert from 'node:assert/strict';
import { pcmBytes } from '../packages/audio-engine/pcm.ts';
import { configSchema, defaultConfig, scenePresets } from '../packages/shared/config.ts';
import { milkdropScenes, originalSceneCount, maxSceneId } from '../packages/shared/scene-catalog.ts';
import { applyControl } from '../packages/shared/performance.ts';
import type { MidiTarget } from '../packages/shared/midi.ts';

test('silence is centered PCM; missing/invalid samples cannot produce noise or wraparound',()=>{
  const out=new Uint8Array(8);out.fill(255);assert.equal(pcmBytes(null,out),out);assert.deepEqual([...out],Array(8).fill(128));
  pcmBytes({samples:new Float32Array([-2,-1,0,1,2,NaN,Infinity,0]),sampleRate:44100},out);
  assert.deepEqual([...out],[0,1,128,255,255,128,128,128]);
  pcmBytes({samples:new Float32Array(8),sampleRate:NaN},out);assert.deepEqual([...out],Array(8).fill(128));
});
test('48 kHz input resamples the newest window at 44.1 kHz without changing a sine frequency',()=>{
  const rate=48000,hz=1000,samples=Float32Array.from({length:2048},(_,i)=>Math.sin(2*Math.PI*hz*i/rate)),out=new Uint8Array(1024);
  pcmBytes({samples,sampleRate:rate},out);
  for(let i=0;i<out.length;i++){
    const sampleTime=(samples.length-1)/rate-(out.length-1-i)/44100;
    assert.ok(Math.abs(out[i]-(128+127*Math.sin(2*Math.PI*hz*sampleTime)))<1);
  }
});
test('appended scenes work in config, MIDI A/B and saved presets without renumbering original styles',()=>{
  assert.deepEqual(scenePresets.slice(0,originalSceneCount).map(p=>p.field.style),[6,7,8,9,10,0,1,2,3,4,5]);
  assert.equal(new Set(scenePresets.map(p=>p.field.style)).size,scenePresets.length);
  for(const scene of milkdropScenes){
    const config=structuredClone(defaultConfig),palette=structuredClone(config.palette),target=`scene:${scene.style}` as MidiTarget;
    config.midi.bindings=[{target,kind:'note',channel:10,number:36,mode:'absolute',min:0,max:1,pickup:false}];
    applyControl(config,target,1);assert.equal(config.field.style,scene.style);assert.deepEqual(config.palette,palette);
    config.performance.padTarget='b';applyControl(config,target,1);assert.equal(config.performance.sceneB,scene.style);
    assert.equal(configSchema.parse(JSON.parse(JSON.stringify(config))).field.style,scene.style);
  }
  assert.equal(configSchema.safeParse({...defaultConfig,field:{...defaultConfig.field,style:maxSceneId+1}}).success,false);
});
