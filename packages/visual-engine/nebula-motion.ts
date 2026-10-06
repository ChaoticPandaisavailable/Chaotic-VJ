import { clamp } from '../shared/config.ts';

/** Small seeded centre drifts and independent local curls, never a global spin. */
export class NebulaMotion {
  readonly values:[number,number,number,number]=[0,0,0,0]; // centre xy, two local curl angles
  private from=[0,0,0,0];
  private target=[0,0,0,0];
  private elapsed=0;
  private duration=24;
  private randomState=1;
  private random(){this.randomState=(Math.imul(this.randomState,1664525)+1013904223)>>>0;return this.randomState/4294967296;}
  private next(){
    this.from=[...this.values];this.duration=16+this.random()*14;
    const bounds=[.40,.26,.24,.20];
    for(let i=0;i<4;i++)this.target[i]=this.random()<.22?this.values[i]:(this.random()*2-1)*bounds[i];
  }
  constructor(){this.reset(1337);}
  reset(seed:number){
    this.randomState=(seed^0x74BA361D)>>>0;this.elapsed=0;this.values.fill(0);this.next();
  }
  update(dt:number,motion:number,wind:number,paused=false){
    if(paused)return;
    // Audio can gently propel the drift; it cannot make the whole scene orbit faster.
    this.elapsed+=clamp(dt,0,.1)*(.8+clamp(motion)*.3+clamp(wind,0,3)*.10);
    while(this.elapsed>=this.duration){
      this.elapsed-=this.duration;
      for(let i=0;i<4;i++)this.values[i]=this.target[i];
      this.next();
    }
    const t=this.elapsed/this.duration,ease=t*t*t*(t*(t*6-15)+10);
    for(let i=0;i<4;i++)this.values[i]=this.from[i]+(this.target[i]-this.from[i])*ease;
  }
}
