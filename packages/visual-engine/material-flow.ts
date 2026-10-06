import { clamp, type Config } from '../shared/config.ts';
import type { MusicResponse } from '../audio-engine/music-forces.ts';

const TAU=Math.PI*2;
// Coordinates are in viewport-height units. Each pair is an invertible shear,
// so det(J)=1 even when the phases change. Never advect yesterday's coordinates.
export const flowLayers=[
  {amplitude:.10,frequency:4,angle:.25,rate:.045},
  {amplitude:.036,frequency:9,angle:-.65,rate:.065},
  {amplitude:.008,frequency:24,angle:1.1,rate:.10},
] as const;
export type FlowLayer=[number,number,number,number]; // phase X, phase Y, amplitude, frequency
const wrap=(v:number)=>((v%TAU)+TAU)%TAU;

/** Bounded material transport: music advances a travelling current, never its dilation. */
export class MaterialFlow {
  readonly layers:FlowLayer[]=flowLayers.map(l=>[0,0,l.amplitude,l.frequency]);
  readonly audioSpeed=[0,0,0];
  reset(seed:number){
    let state=(seed^0x245abc1)>>>0;
    const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};
    for(let i=0;i<3;i++){
      this.layers[i]=[random()*TAU,random()*TAU,flowLayers[i].amplitude,flowLayers[i].frequency];
      this.audioSpeed[i]=0;
    }
  }
  update(dt:number,music:MusicResponse,config:Config,paused=false){
    if(paused)return this.layers;
    dt=clamp(dt,0,.1);
    const m=config.modulation,level=music.gain<.001?0:m.level/.6;
    const targets=[
      (music.impact*m.onset/.65*8*config.rhythm.impact/.75+music.flow*m.bass/.7*4.8+music.release*2+music.pressure*.14)*level,
      (music.shear*m.mid/.4*4.5)*level,
      (music.detail*m.high/.5*5)*level,
    ];
    const response=.07+config.rhythm.drift*.12,decay=Math.exp(-dt/response);
    // Changing the reach also preserves area and bounds the maximum local strain.
    const reach=.8+config.rhythm.ripple*.4;
    for(let i=0;i<3;i++){
      const target=clamp(targets[i],0,6),old=this.audioSpeed[i];
      const travel=target*dt+(old-target)*response*(1-decay);
      this.audioSpeed[i]=target+(old-target)*decay;
      const natural=flowLayers[i].rate*(.25+config.macros.motion*.75)*dt;
      const layer=this.layers[i];
      // Phases keep travelling in the same direction after a note. No return-to-zero spring.
      layer[0]=wrap(layer[0]+natural+travel);
      layer[1]=wrap(layer[1]+natural*.83+travel*.73);
      layer[2]=flowLayers[i].amplitude*reach;
      layer[3]=flowLayers[i].frequency/reach;
    }
    return this.layers;
  }
}

/** CPU reference used for area, inverse, continuity and endurance checks. */
export function transportPoint(x:number,y:number,layers:ReadonlyArray<Readonly<FlowLayer>>,inverse=false):[number,number]{
  for(let step=0;step<3;step++){
    const i=inverse?2-step:step,[px,py,a,k]=layers[i],c=Math.cos(flowLayers[i].angle),s=Math.sin(flowLayers[i].angle);
    let u=c*x-s*y,v=s*x+c*y;
    if(inverse){v-=a*.8*Math.sin(k*u-py);u-=a*Math.sin(k*v-px);}
    else{u+=a*Math.sin(k*v-px);v+=a*.8*Math.sin(k*u-py);}
    x=c*u+s*v;y=-s*u+c*v;
  }
  return [x,y];
}

export const materialFlowGLSL=/* glsl */`
uniform vec4 uTransport[3];
vec2 transportMaterial(vec2 p){
${flowLayers.map((l,i)=>`{
  float c=${Math.cos(l.angle)},s=${Math.sin(l.angle)};
  vec2 q=vec2(c*p.x-s*p.y,s*p.x+c*p.y);
  vec4 f=uTransport[${i}];
  q.x+=f.z*sin(f.w*q.y-f.x);
  q.y+=f.z*.8*sin(f.w*q.x-f.y);
  p=vec2(c*q.x+s*q.y,-s*q.x+c*q.y);
}`).join('\n')}
  return p;
}
`;
