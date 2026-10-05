/** Deterministic, bounded composition changes; random targets are never applied as jumps. */
export class CompositionDrift {
  revision=0;
  readonly values=new Float32Array(6);
  private start=new Float32Array(6);
  private target=new Float32Array(6);
  private seed=-1;
  private randomState=1;
  private requested=-1;
  private elapsed=0;
  private duration=22;
  private active=false;
  private random(){this.randomState=(Math.imul(this.randomState,1664525)+1013904223)>>>0;return this.randomState/4294967296;}
  private next(speed:number,neutral=false){
    this.revision++;
    this.start.set(this.values);this.elapsed=0;this.duration=neutral?4:14+(1-speed)*22+this.random()*9;
    for(let i=0;i<6;i++)this.target[i]=neutral?0:this.random()*2-1;
  }
  update(dt:number,seed:number,request:number,enabled:boolean,speed:number,paused=false){
    if(paused)return;
    if(seed!==this.seed){this.seed=seed;this.randomState=(seed>>>0)||1;this.requested=request;this.active=enabled;this.next(speed,!enabled);}
    else if(request!==this.requested){this.requested=request;this.active=enabled;this.next(speed);this.duration=5;}
    else if(enabled!==this.active){this.active=enabled;this.next(speed,!enabled);}
    this.elapsed+=Math.max(0,Math.min(.1,dt));
    const t=Math.min(1,this.elapsed/this.duration),ease=t*t*t*(t*(t*6-15)+10);
    for(let i=0;i<6;i++)this.values[i]=this.start[i]+(this.target[i]-this.start[i])*ease;
    if(t===1&&enabled)this.next(speed);
  }
}
