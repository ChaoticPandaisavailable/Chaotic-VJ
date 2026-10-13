/** RBJ two-pole filter, unity passband (bandpass is unity at its centre). */
export class Biquad {
  private b0:number;private b1:number;private b2:number;private a1:number;private a2:number;
  private z1=0;private z2=0;
  constructor(rate:number,hz:number,mode:'lowpass'|'highpass'|'bandpass'='lowpass',q=Math.SQRT1_2){
    const w=2*Math.PI*hz/rate,c=Math.cos(w),alpha=Math.sin(w)/(2*q),a0=1+alpha;
    this.b0=(mode==='bandpass'?alpha:mode==='highpass'?(1+c)/2:(1-c)/2)/a0;
    this.b1=(mode==='bandpass'?0:mode==='highpass'?-(1+c):1-c)/a0;
    this.b2=mode==='bandpass'?-this.b0:this.b0;
    this.a1=-2*c/a0;this.a2=(1-alpha)/a0;
  }
  sample(x:number){const y=this.b0*x+this.z1;this.z1=this.b1*x-this.a1*y+this.z2;this.z2=this.b2*x-this.a2*y;return y;}
}
