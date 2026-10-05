export interface Impulse {x:number;y:number;age:number;strength:number;angle:number}
/** Audio events have persistent spatial identities; no random jumps every rendered frame. */
export class ImpulseField{
  readonly events:Impulse[]=Array.from({length:3},()=>({x:.5,y:.5,age:99,strength:0,angle:0}));
  x=0;y=0;colorPhase=0;private colorTarget=0;private vx=0;private vy=0;private previous=0;private cooldown=0;private cursor=0;private seed=1337;
  reset(seed:number){this.seed=seed||1;this.x=this.y=this.vx=this.vy=this.previous=this.cooldown=this.cursor=this.colorPhase=this.colorTarget=0;for(const event of this.events){event.age=99;event.strength=0;}}
  private random(){this.seed^=this.seed<<13;this.seed^=this.seed>>>17;this.seed^=this.seed<<5;return(this.seed>>>0)/4294967296;}
  update(dt:number,kick:number,amount:number){
    dt=Math.min(.1,Math.max(0,dt));this.cooldown-=dt;
    for(const event of this.events)event.age+=dt;
    if(kick>.12&&kick>this.previous*1.15&&this.cooldown<=0){
      const event=this.events[this.cursor++%this.events.length];
      event.x=.12+this.random()*.76;event.y=.16+this.random()*.68;event.age=0;event.strength=kick;event.angle=this.random()*Math.PI*2;
      this.colorTarget+=.45+kick*.8;
      this.vx+=Math.cos(event.angle)*kick*amount*.85;this.vy+=Math.sin(event.angle)*kick*amount*.55;this.cooldown=.18;
    }
    this.previous=kick;
    this.colorPhase+=(this.colorTarget-this.colorPhase)*(1.-Math.exp(-dt/.65));
    for(let remaining=dt;remaining>0;){const h=Math.min(remaining,1/120);this.vx+=(-this.x*1.4-this.vx*2.8)*h;this.vy+=(-this.y*1.4-this.vy*2.8)*h;this.x+=this.vx*h;this.y+=this.vy*h;remaining-=h;}
  }
}
