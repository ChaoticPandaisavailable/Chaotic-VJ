/** Coalesce an encoder sweep into one reset; honor explicit clearing even at the same seed. */
export class FlowReset {
  seed=-1;
  private pending=-1;
  private age=0;
  private clearVersion=-1;
  update(dt:number,seed:number,clearVersion:number,paused=false):'composition'|'history'|null{
    if(paused)return null;
    if(seed!==this.pending){this.pending=seed;this.age=0;}else this.age+=dt;
    const resetSeed=this.seed<0||(seed!==this.seed&&this.age>=.12);
    const resetHistory=clearVersion!==this.clearVersion;
    this.clearVersion=clearVersion;
    if(resetSeed){this.seed=seed;return 'composition';}
    return resetHistory?'history':null;
  }
}
