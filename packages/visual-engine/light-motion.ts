import { clamp } from '../shared/config.ts';

/** A bounded set of real strikes. A new beat never resets an older travelling wave. */
export class LightFieldMotion {
  readonly waves=Array.from({length:6},()=>[99,0,0,0]); // age, measured energy, origin x/y
  private previousAge=99;
  private cursor=-1;
  private sequence=0;
  reset(){for(const wave of this.waves)wave.splice(0,4,99,0,0,0);this.previousAge=99;this.cursor=-1;this.sequence=0;}
  update(dt:number,drift:readonly number[],paused=false){
    if(paused)return;
    const h=clamp(dt,0,.1);if(!h)return;
    for(const wave of this.waves)wave[0]=Math.min(99,wave[0]+h);
    const age=drift[2];
    if(age<this.previousAge){
      this.cursor=(this.cursor+1)%this.waves.length;this.sequence++;
      this.waves[this.cursor].splice(0,4,age,clamp(drift[3],0,2),Math.sin(this.sequence*2.39996)*.72,Math.cos(this.sequence*2.39996)*.42);
    }
    if(this.cursor>=0&&age<.12)this.waves[this.cursor][1]=Math.max(this.waves[this.cursor][1],clamp(drift[3],0,2));
    this.previousAge=age;
  }
}
