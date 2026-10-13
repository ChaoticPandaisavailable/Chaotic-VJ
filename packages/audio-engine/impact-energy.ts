import {Biquad} from './biquad.ts';

/** Meter only: no EQ or gain is applied to the sound the audience hears. */
export class ImpactEnergy {
  private filters:Biquad[][];
  private envelope=0;
  constructor(private rate:number){
    this.filters=Array.from({length:2},()=>[
      new Biquad(rate,20,'highpass'),
      // Fourth-order Butterworth at 200 Hz.
      new Biquad(rate,200,'lowpass',.5411961),new Biquad(rate,200,'lowpass',1.306563),
      new Biquad(rate,80,'bandpass',1.1)
    ]);
  }
  process(left:Float32Array,right=left){
    if(!left.length)return this.envelope;
    let broad=0,weight80=0;
    for(let c=0;c<2;c++){
      const data=c?right:left,[dc,lp1,lp2,focus]=this.filters[c];
      for(let i=0;i<left.length;i++){
        const low=lp2.sample(lp1.sample(dc.sample(Number.isFinite(data[i])?data[i]:0)));
        const centre=focus.sample(low);broad+=low*low;weight80+=centre*centre;
      }
    }
    // A fixed gain preserves song dynamics. No AGC/normalization that inflates quiet kicks.
    const target=Math.min(1,1.4*Math.sqrt((.3*broad+.7*weight80)/(2*left.length)));
    const dt=left.length/this.rate;
    this.envelope+=(target-this.envelope)*(1-Math.exp(-dt/(target>this.envelope ? .006 : .045)));
    return this.envelope;
  }
}
