import { clamp } from '../shared/config.ts';
import type { MusicResponse } from '../audio-engine/music-forces.ts';

/** One measured-sound clock per engine, shared by A/B and outgoing scenes. */
export class SceneMotion {
  readonly music=[0,0,0,0]; // flow, detail, measured impact, shear
  readonly drift=[0,0,99,0]; // bass travel, broad kick, kick age, measured kick peak
  impulseTravel=0;
  private bass=0;
  private lastKick=0;
  reset(){this.music.fill(0);this.drift.splice(0,4,0,0,99,0);this.impulseTravel=this.bass=this.lastKick=0;}
  update(dt:number,response:MusicResponse,paused=false){
    if(paused)return;
    const h=clamp(dt,0,.1);if(!h)return;
    const flow=clamp(response.flow,0,2),impact=clamp(response.impact,0,2);
    const kick=clamp(response.kick)*clamp(response.gain);
    this.drift[2]=Math.min(99,this.drift[2]+h);
    if(kick>.16&&kick>this.lastKick+.08&&this.drift[2]>=.16){this.drift[2]=0;this.drift[3]=impact;}
    this.lastKick=kick;
    // Detection marks the wave's start; measured low-frequency energy sets its force.
    if(this.drift[2]<.12)this.drift[3]=Math.max(this.drift[3],impact);
    const tau=.22,decay=Math.exp(-h/tau);
    this.drift[0]+=flow*h+(this.bass-flow)*tau*(1-decay);
    this.bass=flow+(this.bass-flow)*decay;
    const broad=this.drift[1],release=impact>broad?.055:.55,fade=Math.exp(-h/release);
    this.impulseTravel+=impact*h+(broad-impact)*release*(1-fade);
    this.drift[1]=impact+(broad-impact)*fade;
    this.music[0]=flow;this.music[1]=clamp(response.detail,0,2);
    this.music[2]=impact;this.music[3]=clamp(response.shear,0,2);
  }
}
