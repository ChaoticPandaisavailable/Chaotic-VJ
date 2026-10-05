import type { Config } from './config.ts';

/** Spend the full GPU budget on the active output, not on every open controller. */
export function renderPolicy(owner:boolean,output:boolean,hidden:boolean,fullscreen=false,frameRate:Config['renderer']['frameRate']='display'){
  if(!owner&&(hidden||output))return {fps:4,draw:false,previewLimit:720};
  if(!owner)return {fps:30,draw:true,previewLimit:fullscreen?Infinity:1707};
  return {fps:frameRate==='display'?Infinity:Number(frameRate),draw:true,previewLimit:Infinity};
}

/** An uncapped output draws once per browser refresh; finite caps preserve fractional time. */
export class FramePacer {
  private budget=0;
  private limit=0;
  ready(dt:number,fps:number){
    if(this.limit!==fps){this.limit=fps;this.budget=0;}
    if(!Number.isFinite(fps)){this.budget=0;return true;}
    const interval=1/fps;
    this.budget+=Math.min(.25,Math.max(0,dt));
    if(this.budget+.0001<interval)return false;
    this.budget=Math.max(0,this.budget-interval);
    if(this.budget>=interval)this.budget%=interval;
    return true;
  }
}

/** Consecutive good frames are required before increasing resolution again. */
export class AdaptiveQuality {
  private key='';
  private scale=1;
  private slow=0;
  private fast=0;
  update(dt:number,ceiling:number,floor:number,key:string,adaptive:boolean,measure:boolean,gpuMs:number|null){
    const signature=`${key}:${ceiling}`;
    if(this.key!==signature){this.key=signature;this.scale=ceiling;this.slow=this.fast=0;}
    if(!adaptive){this.scale=ceiling;return ceiling;}
    if(measure){
      const cost=gpuMs??dt*1000;
      this.slow=cost>15?this.slow+Math.min(.1,dt):Math.max(0,this.slow-dt*2);
      this.fast=cost<9?this.fast+Math.min(.1,dt):0;
      if(this.slow>=1.5){this.scale=Math.max(floor,Math.round((this.scale-.1)*100)/100);this.slow=this.fast=0;}
      else if(this.fast>=18){this.scale=Math.min(ceiling,Math.round((this.scale+.05)*100)/100);this.fast=0;}
    }
    return Math.min(ceiling,Math.max(floor,this.scale));
  }
}
