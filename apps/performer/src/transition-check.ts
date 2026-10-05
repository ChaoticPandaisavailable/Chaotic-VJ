// Local development harness. This HTML is not an entry in the production build.
import {VisualEngine} from '../../../packages/visual-engine/index.ts';
import {defaultConfig,scenePresets,applyScenePreset,silentFeatures} from '../../../packages/shared/config.ts';
const canvas=document.querySelector<HTMLCanvasElement>('#canvas')!;
const button=document.querySelector<HTMLButtonElement>('#run')!;
let engine:VisualEngine|null=null;
button.onclick=async()=>{
  button.disabled=true;engine?.dispose();engine=new VisualEngine(canvas);engine.resize(2560,1440,1,1);
  const config=structuredClone(defaultConfig),audio=silentFeatures(),transport={freeze:false,blackout:false,queuePaused:false,clearVersion:0};
  config.colorMood={enabled:true,warmth:.61,richness:.84};config.colorMotion.enabled=false;
  config.variation.transitionSeconds=3;config.variation.roam=false;
  const sequence=[6,7,8,6,9,10,6,0,4,6,7,8,9,10,6];
  const results:object[]=[],intervals:number[]=[],costs:number[]=[],gpu:number[]=[];
  let index=-1,started=0,last=0,elapsed=0;
  const percentile=(values:number[],p:number)=>{const sorted=values.slice().sort((a,b)=>a-b);return +(sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]??0).toFixed(2);};
  const report=()=>{if(index<0)return;results.push({style:sequence[index],activeStyle:engine!.currentStyle,preparing:engine!.preparing,transitioning:engine!.transitioning,frames:intervals.length,frameP95:percentile(intervals,.95),frameMax:percentile(intervals,1),cpuP95:percentile(costs,.95),cpuMax:percentile(costs,1),gpuP95:percentile(gpu,.95),over33ms:intervals.filter(v=>v>33.4).length});document.querySelector('#results')!.textContent=JSON.stringify({gpu:engine!.gpu,size:'2560×1440',results,error:engine!.error,notice:engine!.notice},null,2);};
  const tick=(now:number)=>{
    const dt=last?(now-last)/1000:1/60;last=now;elapsed+=dt;
    if(index>=0){intervals.push(dt*1000);}
    const duration=index===sequence.length-1?7000:index>=10?180:4200;
    if(index<0||now-started>duration){report();if(++index>=sequence.length){document.querySelector('#status')!.textContent='完成';button.disabled=false;return;}intervals.length=costs.length=gpu.length=0;started=now;applyScenePreset(config,scenePresets.find(p=>p.field.style===sequence[index])!);document.querySelector('#status')!.textContent=`检查 ${index+1}/${sequence.length} · ${config.field.style}`;}
    const start=performance.now();engine!.render(dt,config,audio,transport,elapsed*2%16);costs.push(performance.now()-start);if(engine!.gpuMs!==null)gpu.push(engine!.gpuMs);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
