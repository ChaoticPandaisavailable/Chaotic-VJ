import {SpectralKick} from './spectral-kick.ts';
import {Biquad} from './biquad.ts';
import {ImpactEnergy} from './impact-energy.ts';
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const follow=(from:number,to:number,dt:number,attack:number,release=attack)=>from+(to-from)*(1-Math.exp(-dt/(to>from?attack:release)));

export interface TransientReading {kick:number;bass:number;eventId:number;rms:number;lowImpact?:number;}
export type TimedTransient=TransientReading&{audioTime:number};

/** Latest state + one short-lived attack latch; slow display frames cannot build an event queue. */
export class TransientMailbox {
  private latest:TimedTransient|null=null;
  private eventId=0;private pendingKick=0;private pendingAt=0;
  accept(data:TimedTransient,now:number){
    if(now-data.audioTime>.12||data.audioTime>now+.05)return false;
    this.latest=data;
    if(data.eventId!==this.eventId){this.eventId=data.eventId;this.pendingKick=Math.max(this.pendingKick,data.kick);this.pendingAt=data.audioTime;}
    return true;
  }
  apply<T extends {kick:number;bass:number;rms:number;lowImpact?:number}>(features:T,now:number):T{
    const last=this.latest;
    if(!last||now-last.audioTime>.12){features.kick=0;features.lowImpact=0;this.pendingKick=0;return features;}
    const pulse=now-this.pendingAt<.12?this.pendingKick:0;this.pendingKick=0;
    features.kick=Math.max(pulse,last.kick*Math.exp(-Math.max(0,now-last.audioTime)/.085))*(last.rms>.002?1:0);
    features.bass=last.bass;
    features.lowImpact=last.lowImpact;
    // An analyser downmix can cancel opposite-phase stereo; channel energies cannot.
    features.rms=Math.max(features.rms,clamp(last.rms*3.3));
    return features;
  }
}

/** Two causal paths: fast energy attacks + whitened spectral attacks under loud bass. */
export class TransientDetector {
  sensitivity=.5;
  readonly reading:TransientReading={kick:0,bass:0,eventId:0,rms:0};
  private filters:Biquad[][];
  private rate:number;
  private spectral:SpectralKick;
  private impactEnergy:ImpactEnergy;
  private fast=0;private reference=0;private bodyFast=0;private bodyReference=0;
  private previousFast=0;private wait=0;private armed=true;private age=99;
  private candidate=0;private strongest=0;private attackEvidence=0;private steepness=0;
  constructor(rate:number){
    this.rate=rate;
    this.spectral=new SpectralKick(rate);
    this.impactEnergy=new ImpactEnergy(rate);
    this.filters=Array.from({length:2},()=>[new Biquad(rate,30,'highpass'),new Biquad(rate,170),new Biquad(rate,180,'highpass'),new Biquad(rate,1800)]);
  }
  process(left:Float32Array,right=left):TransientReading{
    const n=left.length,dt=n/this.rate;if(!n)return this.reading;
    this.reading.lowImpact=this.impactEnergy.process(left,right);
    let lowEnergy=0,bodyEnergy=0,total=0;
    for(let c=0;c<2;c++){
      const data=c?right:left,f=this.filters[c];
      for(let i=0;i<n;i++){
        const x=Number.isFinite(data[i])?data[i]:0;
        const low=f[1].sample(f[0].sample(x)),body=f[3].sample(f[2].sample(x));
        lowEnergy+=low*low;bodyEnergy+=body*body;total+=x*x;
      }
    }
    const low=Math.sqrt(lowEnergy/(n*2)),body=Math.sqrt(bodyEnergy/(n*2)),rms=Math.sqrt(total/(n*2));
    // Smooth over sub-bass half cycles; individual 35–50 Hz lobes are not new drum hits.
    this.fast=follow(this.fast,low,dt,.008,.025);
    this.bodyFast=follow(this.bodyFast,body,dt,.003,.012);
    const rise=Math.max(0,this.fast-this.reference),contrast=rise/Math.max(.008,this.reference);
    const slope=(this.fast-this.previousFast)/dt;this.previousFast=this.fast;
    const bodyRise=Math.max(0,this.bodyFast-this.bodyReference);
    const sensitivity=clamp(this.sensitivity),threshold=.95-sensitivity*.65;
    // A kick's upper attack can corroborate a smaller low-band rise when a loud bass masks it.
    const bodyAttack=bodyRise>Math.max(.005,this.bodyReference*1.8)&&contrast>.12;
    this.wait-=dt;this.age+=dt;
    // Re-arm only after the previous attack has settled, not on every bass waveform cycle.
    if(contrast<.22||rms<.003)this.armed=true;
    if(!this.candidate&&this.armed&&this.wait<=0&&rms>.006&&this.fast>.005
      &&(contrast>threshold||bodyAttack)&&slope>.45-sensitivity*.25){
      this.candidate=dt;this.strongest=rise;this.attackEvidence=bodyRise;this.steepness=0;
    }
    if(this.candidate){
      this.candidate+=dt;this.strongest=Math.max(this.strongest,rise);this.attackEvidence=Math.max(this.attackEvidence,bodyRise);
      this.steepness=Math.max(this.steepness,slope/Math.max(.01,this.fast));
      // A few audio blocks distinguish a genuine rising attack from a single discontinuity.
      if(this.candidate>=.012){
        const lowDominant=this.fast>this.bodyFast*.65;
        const sharp=this.attackEvidence>Math.max(.0015+(1-sensitivity)*.002,this.strongest*.4)
          ||this.strongest>.025+(1-sensitivity)*.02&&this.steepness>55;
        if(lowDominant&&sharp&&rms>.006&&(contrast>threshold*.7||bodyAttack)){
          this.reading.kick=clamp(.3+this.strongest*8);this.reading.eventId++;this.age=0;this.wait=.15;this.armed=false;
        }
        this.candidate=0;
      }
    }
    this.reference=follow(this.reference,low,dt,.085,.12);
    this.bodyReference=follow(this.bodyReference,body,dt,.08,.10);
    // The spectral path does not require the whole bass band to become louder.
    // Both paths share one lockout, so a single kick can never fire twice.
    const spectralKick=this.spectral.process(left,right,sensitivity);
    if(spectralKick>0&&this.wait<=0&&rms>.006&&this.fast>.01){
      this.reading.kick=spectralKick;this.reading.eventId++;this.age=0;this.wait=.15;this.armed=false;this.candidate=0;
    }
    // Bass is deliberately slower than kick. Sustain steers wind, never the impact oscillator.
    this.reading.bass=follow(this.reading.bass,clamp(low*4),dt,.085,.22);
    if(this.age>0)this.reading.kick*=Math.exp(-dt/.085);
    if(rms<.002)this.reading.kick*=Math.exp(-dt/.012);
    this.reading.rms=rms;
    return this.reading;
  }
}
