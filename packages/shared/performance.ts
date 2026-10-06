import { nextShuffle, setShuffle, shuffleSteps } from './shuffle.ts';
import { applyScenePreset, scenePresets, type Config } from './config.ts';
import { type MidiTarget, unitClamp } from './midi.ts';

export function moodBounds(config:Config){const r=config.colorRange;return r.enabled?{x0:r.warmMin,x1:r.warmMax,y0:r.richMin,y1:r.richMax}:{x0:0,x1:1,y0:0,y1:1};}
export function setColorMood(config:Config,x:number,y:number){
  const b=moodBounds(config);
  config.colorMood={enabled:true,warmth:Math.max(b.x0,Math.min(b.x1,x)),richness:Math.max(b.y0,Math.min(b.y1,y))};
}
const inverse=(value:number,min:number,max:number)=>max===min?.5:unitClamp((value-min)/(max-min));
export function controlValue(config:Config,target:MidiTarget):number{
  const b=moodBounds(config);
  if(target==='warmth')return inverse(config.colorMood.warmth,b.x0,b.x1);
  if(target==='richness')return inverse(config.colorMood.richness,b.y0,b.y1);
  if(target==='shuffle:next')return 0;
  if(target==='shuffle')return config.renderer.shuffle/shuffleSteps;
  if(target==='mix')return config.performance.mix;
  if(target==='rotation')return (config.variation.rotation+1)/2;
  if(target==='complexity')return config.variation.complexity;
  if(target.startsWith('music:'))return config.music[target.slice(6) as 'amount'|'impact'|'flow'|'detail'];
  if(target.startsWith('section:'))return 0;
  if(target.startsWith('scene:'))return 0;
  return config.macros[target as keyof Config['macros']];
}
export function applyControl(config:Config,target:MidiTarget,value:number){
  value=unitClamp(value);const b=moodBounds(config);
  if(target==='shuffle:next'){nextShuffle(config);return;}
  if(target==='shuffle'){setShuffle(config,value);return;}
  if(target.startsWith('music:')){config.music[target.slice(6) as 'amount'|'impact'|'flow'|'detail']=value;return;}
  if(target.startsWith('section:')){config.music.section=target==='section:build'?'build':'steady';if(target==='section:release')config.music.releaseId++;return;}
  if(target.startsWith('scene:')){const scene=Number(target.split(':')[1]);if(config.performance.padTarget==='b')config.performance.sceneB=scene;else applyScenePreset(config,scenePresets[scene]);return;}
  if(target==='mix'){config.performance.enabled=true;config.performance.mix=value;return;}
  if(target==='warmth'){setColorMood(config,b.x0+value*(b.x1-b.x0),config.colorMood.richness);return;}
  if(target==='richness'){setColorMood(config,config.colorMood.warmth,b.y0+value*(b.y1-b.y0));return;}
  if(target==='rotation'){config.variation.rotation=value*2-1;return;}
  if(target==='complexity'){config.variation.complexity=value;return;}
  config.macros[target as keyof Config['macros']]=value;
}
