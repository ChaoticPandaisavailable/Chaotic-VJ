import { clamp, smoothstep } from '../shared/config.ts';

/** These spatial materials receive a separate sky after history/lighting. */
export const hasBackdropStars=(style:number)=>[4,7,8,9,10].includes(style);

/** A quiet sky clock, independent of the audio-driven gas clock. One meteor at a time. */
export class StarfieldMotion {
  time=0;
  readonly meteor:[number,number,number,number]=[0,0,0,0]; // progress, tail length, opacity, width
  readonly path:[number,number,number,number]=[0,0,0,0]; // start/end in viewport UV
  private state=0;
  private next=0;
  private start=Infinity;
  private duration=1;
  private strength=0;
  constructor(){this.reset(1337);}
  private random(){
    this.state=(this.state+0x6D2B79F5)>>>0;
    let x=this.state;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);
    return ((x^(x>>>14))>>>0)/4294967296;
  }
  reset(seed:number){
    this.state=(seed^0xA53C79B1)>>>0;this.time=0;this.start=Infinity;
    this.meteor.fill(0);this.path.fill(0);this.next=3+this.random()*5;
  }
  update(dt:number,paused=false){
    if(paused)return;
    this.time+=clamp(dt,0,.1);
    if(this.time>=this.next){
      this.start=this.next;this.duration=.85+this.random()*.65;
      const direction=this.random()<.5?-1:1;
      const x=direction>0?.08+this.random()*.27:.65+this.random()*.27,y=.65+this.random()*.27;
      this.path[0]=x;this.path[1]=y;
      this.path[2]=clamp(x+direction*(.30+this.random()*.30),.04,.96);
      this.path[3]=y-(.22+this.random()*.30);
      this.meteor[1]=.09+this.random()*.11;this.meteor[3]=.8+this.random()*.55;
      this.strength=.58+this.random()*.26;
      this.next=this.start+this.duration+11+this.random()*15;
    }
    const phase=(this.time-this.start)/this.duration;
    this.meteor[0]=clamp(phase);
    this.meteor[2]=phase<0||phase>1?0:smoothstep(0,.14,phase)*(1-smoothstep(.58,1,phase))*this.strength;
  }
}

export const starfieldGLSL=/* glsl */`
float starLayer(vec2 p,float grid,float threshold,float salt,float size){
 vec2 cell=floor(p*grid),local=fract(p*grid);
 float identity=hash(cell+salt);
 if(identity<threshold)return 0.;
 vec2 center=.22+.56*hash2(cell+salt+19.);
 float character=hash(cell+salt+41.),phase=hash(cell+salt+57.);
 float pixel=grid/uResolution.y;
 float distance=length(local-center),prominence=smoothstep(.88,.995,character);
 float idle=.83+.11*sin(uSkyTime*(.7+character*1.3)+phase*31.)+.06*sin(uSkyTime*.41+phase*47.);
 // MusicForces already gives treble a 35 ms attack / 100 ms release. Reuse it
 // for a small breathing core; independent phases prevent a whole-sky flash.
 float selected=pow(.5+.5*sin(uSkyTime*(1.8+phase*2.2)+character*61.),8.);
 float response=clamp(uMusic.y*4.,0.,1.)*selected;
 float radius=(mix(.72,1.5,character*character)+prominence*.60)*size*pixel*max(1.,uResolution.y/1080.);
 radius*=1.+response*.24;
 float core=1.-smoothstep(max(0.,radius-pixel*.6),radius+pixel*.6,distance);
 // A small minority have soft halos. Fine stars retain a crisp, quiet core.
 float halo=exp(-2.*pow(distance/max(radius*2.8,pixel),2.))*prominence*.19;
 vec2 ray=abs(local-center);
 float rays=(exp(-ray.x/max(radius*.16,pixel*.3)-ray.y/(radius*3.5))+exp(-ray.y/max(radius*.16,pixel*.3)-ray.x/(radius*3.5)))*prominence*.075;
 float light=(mix(.38,.74,phase)+prominence*.17)*idle+response*(.18+prominence*.13);
 return min(.97,core*light+(halo+rays)*(1.+response*.55));
}
float meteorLight(vec2 sky){
 if(uMeteor.z<.0001)return 0.;
 vec2 aspect=vec2(uResolution.x/uResolution.y,1.);
 vec2 start=(uMeteorPath.xy-.5)*aspect,end=(uMeteorPath.zw-.5)*aspect;
 vec2 direction=normalize(end-start),delta=sky-mix(start,end,uMeteor.x);
 float behind=-dot(delta,direction),across=length(delta+direction*behind);
 float pixel=1./uResolution.y,width=max(pixel*.65,.00055)*uMeteor.w;
 float tail=(1.-smoothstep(width,width+pixel,across))*smoothstep(-pixel*2.,pixel,behind);
 tail*=pow(1.-clamp(behind/uMeteor.y,0.,1.),2.);
 float head=1.-smoothstep(pixel*.4,pixel*2.,length(delta));
 return min(.95,(tail*.72+head*.75)*uMeteor.z);
}
float gasStars(vec2 sky){
 // Three size populations: many fine stars, medium stars and a few foreground beacons.
 return min(.97,starLayer(sky,52.,.958,71.,1.2)+starLayer(sky+vec2(3.7,8.2),97.,.982,127.,.84)*.67+starLayer(sky+vec2(8.1,2.4),23.,.975,301.,2.1)+meteorLight(sky));
}
`;
