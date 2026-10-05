/** Duration-based easing reaches both endpoints exactly; Freeze does not consume time. */
export class TransitionEnvelope {
  progress=1;
  seconds=3;
  begin(seconds:number){this.seconds=Math.max(.01,seconds);this.progress=0;}
  update(dt:number,paused=false){if(!paused)this.progress=Math.min(1,this.progress+Math.max(0,dt)/this.seconds);return this.value;}
  get value(){const t=this.progress;return t*t*(3-2*t);}
}
