/** A gradual change of current curvature, in the engine's visual time. */
export const particleCycleDuration=24;

export const particleRegionCount=15;

/**
 * Stateless sampling of the shared measured-kick clock: [flow phase, envelope, age, peak].
 * Three currents and five regions respond in a staggered order; multiple render decks
 * sample the same instant without integrating or inventing additional attacks.
 */
export function sampleParticleKick(drift:ArrayLike<number>,out=new Float32Array(particleRegionCount)){
  const age=Number.isFinite(drift[2])?drift[2]:99;
  const strength=Number.isFinite(drift[3])?Math.max(0,Math.min(1.5,drift[3])):0;
  for(let layer=0;layer<3;layer++)for(let region=0;region<5;region++){
    const elapsed=age-((region*3)%5)*.038-layer*.026;
    out[layer*5+region]=age<0||elapsed<=0||elapsed>=4?0:strength*(1-Math.exp(-elapsed/.05))*Math.exp(-elapsed/.56);
  }
  return out;
}

/** Follow the shared kick clock once per frame, before either A/B deck renders. */
export class ParticleMusicMotion {
  readonly values=new Float32Array(particleRegionCount);
  private target=new Float32Array(particleRegionCount);

  reset(){this.values.fill(0);this.target.fill(0);}

  update(dt:number,drift:ArrayLike<number>,paused=false){
    if(paused||!Number.isFinite(dt)||dt<=0)return this.values;
    const step=Math.min(.1,dt);
    sampleParticleKick(drift,this.target);
    for(let i=0;i<particleRegionCount;i++){
      const tau=this.target[i]>this.values[i]?.025:.14;
      this.values[i]+=(this.target[i]-this.values[i])*(1-Math.exp(-step/tau));
    }
    return this.values;
  }
}

/** Analytic weights avoid frame-rate drift and hold naturally when visual time freezes. */
export function sampleParticleCycle(time:number,seed:number,out=new Float32Array(4)){
  const offset=(seed%97)/388;
  const elapsed=time/particleCycleDuration+offset,phase=elapsed-Math.floor(elapsed);
  const section=phase*3,index=Math.floor(section),local=section-index;
  const blend=Math.max(0,Math.min(1,local*local*local*(local*(local*6-15)+10)));
  out[0]=out[1]=out[2]=0;
  out[index]=1-blend;out[(index+1)%3]=blend;
  out[3]=phase*Math.PI*2;
  return out;
}
