import { defaultConfig, type Config } from '../shared/config.ts';
export const surfaceNames=['fluid','dots','pixels','contours','ascii','hanzi'] as const;
/** All coefficients remain continuous, including interrupted transitions. */
export class VariationState {
  weights=new Float32Array([1,0,0,0,0,0]);
  complexity=defaultConfig.variation.complexity;
  cellSize=defaultConfig.variation.cellSize;
  particleForm=defaultConfig.variation.particleForm;
  spread=defaultConfig.variation.spread;
  angle=0;
  private speed=0;
  private phase=0;
  reset(){this.phase=0;this.angle=0;this.speed=0;}
  update(dt:number,config:Config['variation'],paused=false){
    if(paused)return;
    const h=Math.max(0,Math.min(.1,dt)),a=1-Math.exp(-h*4/config.transitionSeconds);
    const mode=surfaceNames.indexOf(config.surface);
    for(let i=0;i<this.weights.length;i++)this.weights[i]+=((i===mode?1:0)-this.weights[i])*a;
    this.phase+=h*(.055+config.evolution*.2);
    const breath=.5+.5*Math.sin(this.phase);
    const complexity=config.autoEvolve?.1+config.complexity*(.15+.85*breath):config.complexity;
    this.complexity+=(Math.min(1,complexity)-this.complexity)*a;
    this.cellSize+=(config.cellSize-this.cellSize)*a;
    this.particleForm+=(Math.max(0,Math.min(1,config.particleForm+(config.autoEvolve?Math.sin(this.phase*.61)*.24:0)))-this.particleForm)*a;
    this.spread+=(config.spread-this.spread)*a;
    this.speed+=(config.rotation-this.speed)*(1-Math.exp(-h*2));
    this.angle=(this.angle+this.speed*h*.24)%(Math.PI*2);
  }
}
