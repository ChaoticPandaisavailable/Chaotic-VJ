import { clamp, type Config } from '../shared/config.ts';
import type { MusicResponse } from '../audio-engine/music-forces.ts';

const TAU=Math.PI*2,wrap=(x:number)=>((x%TAU)+TAU)%TAU;
// Keep the finite main nebula in view; infinite near/far noise can travel farther.
export const gasLayerSettings=[{radius:.7,rate:.035,drive:.08,bias:0},{radius:16,rate:.0027,drive:.017,bias:.26},{radius:9,rate:.0065,drive:.017,bias:-.35}] as const;
export type GasLayer=[number,number,number,number]; // translation xy, small acoustic tremor xy
export const hasGasMotion=(style:number)=>style===6;

/** Independent depth sheets pass over one another. No whole-image deformation map. */
export class GasMotion {
  readonly layers:GasLayer[]=gasLayerSettings.map(()=>[0,0,0,0]);
  readonly audioSpeed=[0,0,0];
  evolution=0;
  private phases=[0,0,0];
  private initial=[0,0,0];
  private vibration=0;
  reset(seed:number){
    const heading=((seed*0.61803398875)%1)*TAU;
    this.vibration=0;this.evolution=0;
    for(let i=0;i<3;i++){this.phases[i]=this.initial[i]=wrap(heading+gasLayerSettings[i].bias);this.audioSpeed[i]=0;this.layers[i].fill(0);}
  }
  update(dt:number,music:MusicResponse,config:Config,paused=false){
    if(paused)return this.layers;
    dt=clamp(dt,0,.1);
    const m=config.modulation,gain=music.gain<.001?0:m.level/.6;
    const bass=music.flow*m.bass/.7*gain,impact=music.impact*m.onset/.65*config.rhythm.impact/.75*gain;
    const middle=music.shear*m.mid/.4*gain,high=music.detail*m.high/.5*gain;
    const manual=(music.release*2+music.pressure*.14)*gain;
    const targets=[bass*7.2+impact*5.4+manual,bass*3.8+middle*.55+manual*.65,bass*8+impact*3.6+middle*1.2+high*.65+manual];
    const response=.07+config.rhythm.drift*.12,decay=Math.exp(-dt/response);
    this.vibration=wrap(this.vibration+dt*TAU*7.3);
    // Audio gates the vibration envelope; the carrier does not generate beat events.
    const tremor=.007*clamp(bass+impact*.55,0,1);
    for(let i=0;i<3;i++){
      const target=clamp(targets[i],0,8),old=this.audioSpeed[i];
      const travel=target*dt+(old-target)*response*(1-decay);
      this.audioSpeed[i]=target+(old-target)*decay;
      // Advance the gas's existing internal growth, not just a picture offset.
      // Integrated travel never pulls the pattern back after a transient ends.
      if(i===0)this.evolution+=travel*.8;
      const l=gasLayerSettings[i],layer=this.layers[i];
      this.phases[i]=wrap(this.phases[i]+l.rate*(.25+config.macros.motion*.75)*dt+travel*l.drive);
      // A long curved path keeps coordinates finite and continuous even after hours.
      layer[0]=(Math.cos(this.phases[i])-Math.cos(this.initial[i]))*l.radius;
      layer[1]=(Math.sin(this.phases[i])-Math.sin(this.initial[i]))*l.radius;
      layer[2]=Math.sin(this.vibration+i*1.9)*tremor*(.6+i*.2);
      layer[3]=Math.cos(this.vibration+i*2.3)*tremor*.55;
    }
    return this.layers;
  }
}

/** Front-to-back opacity composition, scalar radiance before the artist's palette. */
export function gasComposite(alpha:readonly number[],light:readonly number[],sky:number){
  let result=0,transmittance=1;
  for(let i=0;i<3;i++){result+=transmittance*alpha[i]*light[i];transmittance*=1-alpha[i];}
  return result+transmittance*sky;
}
export const gasCompositeGLSL=/* glsl */`
float compositeGas(vec3 alpha,vec3 light,float sky){
 float T=1.,result=0.;
 for(int i=0;i<3;i++){result+=T*alpha[i]*light[i];T*=1.-alpha[i];}
 return result+T*sky;
}
`;
