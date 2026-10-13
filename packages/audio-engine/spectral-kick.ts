/** Causal, allocation-free STFT support for kicks buried beneath a sustained bass.
 * Uses positive spectral changes, per-bin whitening and a past-frame neighbour max.
 * Inspired by aubio/SuperFlux; this is a small original kick-specific implementation,
 * not a port of their general-purpose onset detectors or an instrument separator.
 */
export class SpectralKick {
  readonly size:number;
  private hop:number;
  private position=0;private filled=0;private pending=0;
  private ring:Float64Array[];
  private real:Float64Array;private imag:Float64Array;
  private window:Float64Array;private reverse:Uint32Array;
  private cosine:Float64Array;private sine:Float64Array;
  private power:Float64Array;private baseline:Float64Array;
  private past:Float64Array[];private history=0;
  private fluxFloor=[.01,.01];
  private lowHold=0;private bodyHold=0;
  private armed=true;
  private rate:number;
  constructor(rate:number){
    this.rate=rate;
    this.size=2**Math.round(Math.log2(rate*.043));this.hop=this.size/8;
    const n=this.size,bits=Math.log2(n);
    this.ring=[new Float64Array(n),new Float64Array(n)];
    this.real=new Float64Array(n);this.imag=new Float64Array(n);
    this.window=new Float64Array(n);this.reverse=new Uint32Array(n);
    this.cosine=new Float64Array(n/2);this.sine=new Float64Array(n/2);
    this.power=new Float64Array(n/2);this.baseline=new Float64Array(n/2);
    this.past=Array.from({length:2},()=>new Float64Array(n/2));
    for(let i=0;i<n;i++){
      this.window[i]=.5-.5*Math.cos(2*Math.PI*i/n);
      let r=0,v=i;for(let b=0;b<bits;b++){r=(r<<1)|(v&1);v>>=1;}this.reverse[i]=r;
      if(i<n/2){this.cosine[i]=Math.cos(-2*Math.PI*i/n);this.sine[i]=Math.sin(-2*Math.PI*i/n);}
    }
  }
  process(left:Float32Array,right:Float32Array,sensitivity:number){
    let hit=0;
    for(let i=0;i<left.length;i++){
      this.ring[0][this.position]=Number.isFinite(left[i])?left[i]:0;
      this.ring[1][this.position]=Number.isFinite(right[i])?right[i]:0;
      this.position=(this.position+1)&(this.size-1);this.filled++;
      if(++this.pending>=this.hop){this.pending=0;if(this.filled>=this.size)hit=Math.max(hit,this.analyze(sensitivity));}
    }
    return hit;
  }
  private analyze(sensitivity:number){
    const n=this.size,dt=this.hop/this.rate,re=this.real,im=this.imag;
    const maxBin=Math.min(n/2-2,Math.ceil(900*n/this.rate)+1),baselineDecay=Math.exp(-dt/.35);
    this.power.fill(0);
    // Independent channel spectra retain transients in opposite-phase stereo.
    for(let c=0;c<2;c++){
      for(let i=0;i<n;i++){const j=this.reverse[i];re[j]=this.ring[c][(this.position+i)&(n-1)]*this.window[i];im[j]=0;}
      for(let len=2;len<=n;len*=2){
        const half=len/2,step=n/len;
        for(let start=0;start<n;start+=len)for(let j=0;j<half;j++){
          const a=start+j,b=a+half,k=j*step;
          const tr=re[b]*this.cosine[k]-im[b]*this.sine[k],ti=re[b]*this.sine[k]+im[b]*this.cosine[k];
          re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;
        }
      }
      for(let i=1;i<=maxBin;i++)this.power[i]+=(re[i]*re[i]+im[i]*im[i])*8/(n*n);
    }
    const old=this.past[this.history];
    let low=0,body=0,lowCount=0,bodyCount=0,lowRise=0,bodyRise=0,subPower=0,totalPower=0;
    for(let i=1;i<=maxBin;i++){
      const mag=Math.sqrt(this.power[i]);this.power[i]=mag;
      const hz=i*this.rate/n;
      // Only widen the upper bins: doing this at sub-bass resolution would let
      // a loud bass bin hide a quieter kick in the adjacent bin all over again.
      const reference=hz<200?old[i]:Math.max(old[i-1],old[i],old[i+1]);
      const rise=Math.max(0,mag-reference);
      const whitened=Math.log1p(rise/Math.max(.0012,this.baseline[i]*.6));
      if(hz>=35&&hz<150){low+=whitened;lowRise+=rise;lowCount++;}
      if(hz>=150&&hz<900){body+=whitened;bodyRise+=rise;bodyCount++;}
      if(hz>=35&&hz<120)subPower+=mag*mag;
      if(hz>=35&&hz<900)totalPower+=mag*mag;
      this.baseline[i]=Math.max(mag,this.baseline[i]*baselineDecay);
    }
    old.set(this.power);this.history=(this.history+1)%2;
    low/=Math.max(1,lowCount);body/=Math.max(1,bodyCount);
    const lowThreshold=Math.max(.08+(1-sensitivity)*.12,this.fluxFloor[0]*2.8);
    const bodyThreshold=Math.max(.08+(1-sensitivity)*.12,this.fluxFloor[1]*2.8);
    // Accumulate evidence briefly: a kick's pitch falls through adjacent bands.
    this.lowHold=Math.max(low/lowThreshold,this.lowHold*Math.exp(-dt/.018));
    this.bodyHold=Math.max(body/bodyThreshold,this.bodyHold*Math.exp(-dt/.018));
    const score=Math.min(this.lowHold,this.bodyHold);
    if(score<1)this.armed=true;
    // Absolute sub-bass support rejects spectral leakage from vocal consonants.
    const trigger=this.armed&&score>1&&lowRise>.0015&&bodyRise>.002&&subPower>totalPower*.18;
    if(trigger)this.armed=false;
    this.fluxFloor[0]+=(Math.min(low,.3)-this.fluxFloor[0])*(1-Math.exp(-dt/.5));
    this.fluxFloor[1]+=(Math.min(body,.3)-this.fluxFloor[1])*(1-Math.exp(-dt/.5));
    return trigger?Math.min(1,.32+score*.18):0;
  }
}
