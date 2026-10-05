// Local proof/measurement page, excluded from the production entry.
import { VisualEngine } from '../../../packages/visual-engine/index.ts';
import { defaultConfig,scenePresets,applyScenePreset,silentFeatures } from '../../../packages/shared/config.ts';
import { cinematicLooks,type ColorLook } from '../../../packages/shared/palette.ts';
const canvas=document.querySelector<HTMLCanvasElement>('#canvas')!,button=document.querySelector<HTMLButtonElement>('#run')!;
let engine:VisualEngine|null=null;
button.onclick=()=>{
  button.disabled=true;document.querySelector('#proof')!.replaceChildren();engine?.dispose();engine=new VisualEngine(canvas);engine.resize(2560,1440,1,1);
  const config=structuredClone(defaultConfig);applyScenePreset(config,scenePresets[0]);config.colorMood={enabled:true,warmth:.5,richness:.55};config.colorMotion.enabled=false;config.palette.transitionSeconds=0;config.variation.roam=false;
  const audio=silentFeatures(),transport={freeze:false,blackout:false,queuePaused:false,clearVersion:0};
  const cases:Array<{name:string;look:ColorLook;bloom:number;proof?:boolean;scene?:number}>=[
    ...cinematicLooks.map(look=>({name:look.name,look:look.id,bloom:.14,proof:true})),
    {name:'原生 · 无光晕',look:'storm',bloom:0},{name:'原生 · 光晕',look:'storm',bloom:.14},
    {name:'体积 · 无光晕',look:'dusk',bloom:0,scene:1},{name:'体积 · 光晕',look:'dusk',bloom:.14,scene:1},
    {name:'粒子 · 光晕',look:'meadow',bloom:.14,scene:3},
  ];
  const results:object[]=[],cpu:number[]=[],gpu:number[]=[],frames:number[]=[];let index=-1,start=0,last=0;
  const percentile=(a:number[],p:number)=>{const sorted=a.slice().sort((a,b)=>a-b);return +(sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]??0).toFixed(3);};
  const tick=(now:number)=>{
    const dt=last?(now-last)/1000:1/60;last=now;
    if(index<0||now-start>4200){
      if(index>=0)results.push({name:cases[index].name,activeStyle:engine!.currentStyle,frameP95:percentile(frames,.95),gpuMedian:percentile(gpu,.5),gpuP95:percentile(gpu,.95),cpuP95:percentile(cpu,.95)});
      if(++index===cases.length){document.querySelector('#results')!.textContent=JSON.stringify({gpu:engine!.gpu,size:'2560×1440',results,error:engine!.error,notice:engine!.notice},null,2);document.querySelector('#status')!.textContent='完成';button.disabled=false;return;}
      start=now;cpu.length=gpu.length=frames.length=0;const next=cases[index];config.colorLook=next.look;config.renderer.bloom=next.bloom;applyScenePreset(config,scenePresets[next.scene??0]);document.querySelector('#status')!.textContent=next.name;
    }
    const before=performance.now();engine!.render(dt,config,audio,transport,0);const cost=performance.now()-before;
    if(now-start>1500){cpu.push(cost);frames.push(dt*1000);if(engine!.gpuMs!==null)gpu.push(engine!.gpuMs);}
    const current=cases[index];
    if(current.proof&&now-start>3200){
      const figure=document.createElement('figure'),copy=document.createElement('canvas'),caption=document.createElement('figcaption');copy.width=1280;copy.height=720;copy.getContext('2d')!.drawImage(canvas,0,0,1280,720);caption.textContent=current.name;figure.append(copy,caption);document.querySelector('#proof')!.append(figure);current.proof=false;
    }
    requestAnimationFrame(tick);
  };requestAnimationFrame(tick);
};
