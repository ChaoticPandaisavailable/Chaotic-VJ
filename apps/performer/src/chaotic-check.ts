// Development-only deterministic material proof; not included in the production entry.
import { VisualEngine } from '../../../packages/visual-engine/index.ts';
import { defaultConfig,applyScenePreset,scenePresets,silentFeatures,type Config } from '../../../packages/shared/config.ts';
import type { ColorLook } from '../../../packages/shared/palette.ts';
const canvas=document.querySelector<HTMLCanvasElement>('#canvas')!,run=document.querySelector<HTMLButtonElement>('#run')!;
run.onclick=async()=>{
  run.disabled=true;document.querySelector('#proof')!.replaceChildren();
  const cases:[string,ColorLook,number,Config['look']['atmosphere']][]=[['云海风暴 · 幽蓝','storm',.35,'clouds'],['云海风暴 · 暮色','dusk',.65,'clouds'],['水墨山海 · 雪松','cedar',.5,'ink'],['水墨山海 · 沉金','gold',.75,'ink'],['熔流星云 · 岩浆','magma',.5,'nebula'],['熔流星云 · 电蓝','storm',.7,'nebula'],['经典卷曲 · 棱镜','prism',.8,'classic']];
  const results:Array<{name:string;output:string;field:string;frameP95:number;gpuP95:number;error:string|null}>=[];
  for(const [name,look,chaotic,atmosphere]of cases){
    const config=structuredClone(defaultConfig);applyScenePreset(config,scenePresets[0]);config.colorMood={enabled:true,warmth:.5,richness:.55};config.colorMotion.enabled=false;config.colorLook=look;config.palette.transitionSeconds=0;config.look.chaotic=chaotic;config.look.depth=.72;config.look.atmosphere=atmosphere;config.renderer.quality='ultra';config.renderer.adaptive=false;
    document.querySelector('#status')!.textContent=name;
    const engine=new VisualEngine(canvas);engine.resize(3840,2160,1,1);
    const times:number[]=[],gpu:number[]=[];let last=0;
    await new Promise<void>(resolve=>{
      let frame=0;
      const tick=(now:number)=>{
        if(frame>300){times.push(now-last);if(engine.gpuMs!==null)gpu.push(engine.gpuMs);}last=now;
        engine.render(1/60,config,silentFeatures(),{freeze:false,blackout:false,queuePaused:false,clearVersion:0},0);
        if(++frame<420){requestAnimationFrame(tick);return;}
        const figure=document.createElement('figure'),copy=document.createElement('canvas'),caption=document.createElement('figcaption');copy.width=1280;copy.height=720;copy.getContext('2d')!.drawImage(canvas,0,0,1280,720);caption.textContent=name;figure.append(copy,caption);document.querySelector('#proof')!.append(figure);
        const percentile=(a:number[],p:number)=>+a.sort((a,b)=>a-b)[Math.floor((a.length-1)*p)]?.toFixed(2);
        results.push({name,output:`${canvas.width} × ${canvas.height}`,field:engine.fieldResolution,frameP95:percentile(times,.95),gpuP95:percentile(gpu,.95),error:engine.error});engine.dispose();resolve();
      };requestAnimationFrame(tick);
    });
  }
  document.querySelector('#results')!.textContent=JSON.stringify(results,null,2);document.querySelector('#status')!.textContent='完成';run.disabled=false;
};
