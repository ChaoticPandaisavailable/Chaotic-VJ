import { clamp } from '../shared/config.ts';
import type { MusicResponse } from '../audio-engine/music-forces.ts';

export const FACET_GROUPS=6;
export type FacetTransform=readonly [number,number,number,number];

/** Musical choreography stays outside rendering so two decks share one update. */
export class FacetMotion {
  readonly groups:Array<[number,number,number,number]>=Array.from({length:FACET_GROUPS},()=>[0,0,0,0]);
  private positions=Array.from({length:FACET_GROUPS},()=>[0,0,0]);
  private targets=Array.from({length:FACET_GROUPS},()=>[0,0,0]);
  private step=0;
  private seedPhase=0;
  private lastKick=0;
  private sinceKick=1;
  private bass=0;
  private flowPhase=0;
  private accent=0;

  constructor(){this.reset();}

  reset(seed=1337){
    this.step=0;this.seedPhase=((seed>>>0)%997)/997*Math.PI*2;
    this.lastKick=0;this.sinceKick=1;this.bass=this.flowPhase=this.accent=0;
    for(let i=0;i<FACET_GROUPS;i++){this.groups[i].fill(0);this.positions[i].fill(0);this.targets[i].fill(0);}
  }

  private arrange(strength:number){
    // Four repeatable spatial phrases: fan, opposing rails, diagonal, open arc.
    // Only measured attacks advance them; no tempo clock generates new cues.
    const phrase=this.step%4,turn=Math.floor(this.step/4)*Math.PI/3;
    const weight=.5+strength*.5;
    for(let i=0;i<FACET_GROUPS;i++){
      const k=(i+Math.floor(this.step/4))%FACET_GROUPS;
      const a=k*Math.PI/3+this.seedPhase+turn;
      let x:number,y:number;
      if(phrase===0){x=Math.cos(a)*.59;y=Math.sin(a)*.29;}
      else if(phrase===1){x=(k%2===0?-1:1)*.47;y=(Math.floor(k/2)-1)*.25;}
      else if(phrase===2){x=(k-2.5)*.21;y=(k-2.5)*.1*(i%2===0?1:-1);}
      else{x=Math.sin(a)*.61;y=Math.cos(a*2)*.25;}
      this.targets[i][0]=x*weight;
      this.targets[i][1]=y*weight;
      this.targets[i][2]=Math.sin(a+phrase*.8)*(.14+strength*.16);
    }
    this.step=(this.step+1)%24;
  }

  update(dt:number,music:MusicResponse,paused=false){
    if(paused)return this.groups;
    const h=clamp(dt,0,.1);
    if(h===0)return this.groups;
    const kick=clamp(music.kick)*clamp(music.gain);
    this.sinceKick+=h;
    if(kick>.16&&kick>this.lastKick+.08&&this.sinceKick>=.16){this.arrange(kick);this.sinceKick=0;}
    this.lastKick=kick;

    const flow=clamp(music.flow,0,2),decay=Math.exp(-h/.42);
    // Exact integration of the smoothed bass envelope keeps drift independent
    // of display refresh rate. Its amplitude and the choreography stay bounded.
    this.flowPhase+=(flow*h+(this.bass-flow)*.42*(1-decay))*.38;
    this.bass=flow+(this.bass-flow)*decay;
    const high=clamp(music.detail+music.spark*clamp(music.gain)*.4);
    this.accent+=(high-this.accent)*(1-Math.exp(-h/(high>this.accent?.025:.16)));
    const settle=1-Math.exp(-h/.24);
    for(let i=0;i<FACET_GROUPS;i++){
      const p=this.positions[i],target=this.targets[i],group=this.groups[i];
      for(let j=0;j<3;j++)p[j]+=(target[j]-p[j])*settle;
      const phase=this.flowPhase*(i%2===0?1:-.78)+i*Math.PI/3+this.seedPhase;
      group[0]=p[0]+Math.sin(phase)*this.bass*.105;
      group[1]=p[1]+Math.cos(phase*.83)*this.bass*.064;
      group[2]=p[2]+Math.sin(phase*.7)*this.bass*.038;
      group[3]=this.accent*(.35+.65*(.5+.5*Math.cos(i*2.399+this.step*1.047)));
    }
    return this.groups;
  }
}
