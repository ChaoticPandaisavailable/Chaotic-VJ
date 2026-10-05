import type { Config } from './config.ts';
import { moodBounds } from './performance.ts';

const wrap=(v:number)=>((v%1)+1)%1;
const clip=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export function colorCue(config:Config){return JSON.stringify([config.colorMood,config.colorMotion,config.colorRange,config.colorLook]);}

/** A slow, continuous path through coordinated palettes; shared phase keeps windows together. */
export class ColorJourney {
  phase=0;
  position={x:.5,y:.45};
  private cue='';
  private initialized=false;
  update(dt:number,config:Config,paused=false,sharedPhase?:number){
    const cue=colorCue(config),b=moodBounds(config),base=config.colorMood;
    const bounded=config.colorRange.enabled||(config.colorLook??'free')!=='free';
    if(cue!==this.cue){this.cue=cue;this.phase=0;}
    if(!paused){
      if(sharedPhase!==undefined&&Number.isFinite(sharedPhase))this.phase=Math.max(0,sharedPhase);
      else if(base.enabled&&config.colorMotion.enabled)this.phase+=Math.max(0,dt)/config.colorMotion.seconds;
    }
    let x=clip(base.warmth,b.x0,b.x1),y=clip(base.richness,b.y0,b.y1);
    if(base.enabled&&config.colorMotion.enabled){
      if(bounded){
        const span=b.x1-b.x0,n=span?clip((x-b.x0)/span,0,1):.5;
        x=b.x0+span*(1-Math.cos(Math.acos(1-2*n)+this.phase*Math.PI*2))*.5;
      }else x=wrap(x+this.phase);
      y=clip(y+Math.sin(this.phase*Math.PI*2)*.14,b.y0,b.y1);
    }
    if(!this.initialized){this.position={x,y};this.initialized=true;}
    else if(!paused){
      const blend=config.palette.transitionSeconds===0?1:1-Math.exp(-Math.max(0,dt)*4/config.palette.transitionSeconds);
      const delta=bounded?x-this.position.x:wrap(x-this.position.x+.5)-.5;
      this.position.x=bounded?clip(this.position.x+delta*blend,b.x0,b.x1):wrap(this.position.x+delta*blend);
      this.position.y=clip(this.position.y+(y-this.position.y)*blend,b.y0,b.y1);
    }
    return this.position;
  }
}
