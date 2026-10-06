import { clamp, smoothstep, silentFeatures, type AudioFeatures, type Config } from '../shared/config.ts';
import { smooth } from './features.ts';

export interface MusicResponse {
  kick:number; strike:number; spark:number; gain:number; impact:number; flow:number; detail:number; shear:number;
  pressure:number; release:number; activity:number;
}
const resting=():MusicResponse=>({kick:0,strike:0,spark:0,gain:0,impact:0,flow:0,detail:0,shear:0,pressure:0,release:0,activity:0});

/** Delays visual analysis only; audio playback and the manual base configuration stay untouched. */
export class AudioFeatureDelay {
  private clock=0;
  private queue:Array<{at:number;features:AudioFeatures}>=[];
  private current=silentFeatures();
  update(dt:number,features:AudioFeatures,delayMs:number){
    this.clock+=dt;
    if(delayMs===0){this.queue.length=0;this.current=features;return features;}
    this.queue.push({at:this.clock,features:{...features}});
    const due=this.clock-delayMs/1000;
    while(this.queue.length&&this.queue[0].at<=due)this.current=this.queue.shift()!.features;
    // A paused/background tab must not build an unbounded audio queue.
    if(this.queue.length>512)this.queue.splice(0,this.queue.length-512);
    return this.current;
  }
}

/** Separate response times give each frequency band a spatial role. No parameter randomization. */
export class MusicForces {
  value=resting();
  private body=0;
  private edge=0;
  private shear=0;
  private pressure=0;
  private release=0;
  private releaseTarget=0;
  private kickAge=99;
  private kickStrength=0;
  private lastKick=0;
  private lastRelease:number|undefined;
  private influence=0;
  private delay=new AudioFeatureDelay();
  reset(){this.value=resting();this.body=this.edge=this.shear=this.pressure=this.release=this.releaseTarget=this.influence=0;this.kickAge=99;this.kickStrength=this.lastKick=0;this.lastRelease=undefined;this.delay=new AudioFeatureDelay();}
  update(dt:number,input:AudioFeatures,music:Config['music'],_bpm:number,paused=false):MusicResponse {
    if(paused)return this.value;
    dt=clamp(dt,0,.1);
    const audio=this.delay.update(dt,input,music.delayMs);
    // Tempo is deliberately absent from motion. Only measured sound opens this gate.
    const audible=smoothstep(.008,.065,audio.rms);
    const kick=(audio.kick??0)*audible;
    if(kick>.18&&kick>this.lastKick+.12){this.kickAge=0;this.kickStrength=kick;}
    this.lastKick=kick;this.kickAge+=dt;
    this.influence=smooth(this.influence,music.amount,dt,.12,.22);
    // Follow measured bass with a short attack; treble cannot accelerate the large-scale current.
    this.body=smooth(this.body,audio.bass*clamp(audio.rms*8),dt,.12,.24);
    this.edge=smooth(this.edge,clamp(audio.high*.22+(audio.hat??0)*.85)*audible,dt,.035,.10);
    this.shear=smooth(this.shear,(audio.snare??0)*audible,dt,.045,.14);
    this.pressure=smooth(this.pressure,music.section==='build'?1:0,dt,2.8,.85);
    if(this.lastRelease!==undefined&&music.releaseId!==this.lastRelease)this.releaseTarget=.45+this.pressure*.55;
    this.lastRelease=music.releaseId;
    // A short attack avoids a one-frame shape jump when the performer releases pressure.
    this.release=smooth(this.release,this.releaseTarget,dt,.065,.25);
    this.releaseTarget*=Math.exp(-dt/1.05);
    const impact=this.kickStrength*(1-Math.exp(-this.kickAge/.05))*Math.exp(-this.kickAge/.17)*audible;
    const gain=this.influence;
    this.value={kick:kick*music.impact,strike:(audio.snare??0)*music.impact*audible,spark:(audio.hat??0)*music.detail*audible,gain,impact:impact*gain*music.impact,flow:this.body*gain*music.flow*audible,detail:this.edge*gain*music.detail*audible,shear:this.shear*gain*music.impact*audible,pressure:this.pressure*gain,release:this.release*gain,activity:clamp(audio.rms*6)*gain};
    return this.value;
  }
}
