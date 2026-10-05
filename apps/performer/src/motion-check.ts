// Development-only regression: remove camera motion, sound, colour drift and trails.
// The remaining pixel changes must come from the material's internal evolution.
import { VisualEngine } from '../../../packages/visual-engine/index.ts';
import { defaultConfig,applyScenePreset,scenePresets,silentFeatures,type Config } from '../../../packages/shared/config.ts';

const canvas=document.querySelector<HTMLCanvasElement>('#canvas')!,run=document.querySelector<HTMLButtonElement>('#run')!;
const probe=document.createElement('canvas');probe.width=320;probe.height=180;
const context=probe.getContext('2d',{willReadFrequently:true})!;
function pixels(){context.drawImage(canvas,0,0,320,180);return context.getImageData(0,0,320,180).data;}
function difference(a:Uint8ClampedArray,b:Uint8ClampedArray){
  let sum=0,changed=0;for(let i=0;i<a.length;i+=4){const d=(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]))/3;sum+=d;if(d>4)changed++;}
  return {mean:+(sum/(a.length/4)).toFixed(4),changedPercent:+(changed/(a.length/4)*100).toFixed(2)};
}
run.onclick=async()=>{
  run.disabled=true;document.querySelector('#proof')!.replaceChildren();const results=[];
  for(const [atmosphere,hz]of [['clouds',60],['ink',60],['nebula',60],['classic',60],['clouds',144]]as const){
    const config:Config=structuredClone(defaultConfig);applyScenePreset(config,scenePresets[0]);
    config.field.amplitude=0;config.field.scale=1;config.macros.motion=.32;config.macros.memory=0;
    config.look.chaotic=.42;config.look.atmosphere=atmosphere;config.colorMood.enabled=true;config.colorLook='storm';config.colorMotion.enabled=false;
    config.renderer.grain=0;config.renderer.aberration=0;config.renderer.adaptive=false;config.palette.transitionSeconds=0;
    config.rhythm.drift=0;config.rhythm.color=0;config.modulation.beat=0;
    const engine=new VisualEngine(canvas);engine.resize(1280,720,1,1);
    const transport={freeze:false,blackout:false,queuePaused:false,clearVersion:0};
    async function advance(seconds:number){
      for(let frame=0;frame<Math.round(seconds*hz);frame++){
        if(frame%48===0)await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
        engine.render(1/hz,config,silentFeatures(),transport,0);
      }
    }
    const capture=(label:string)=>{const figure=document.createElement('figure'),copy=document.createElement('canvas'),caption=document.createElement('figcaption');copy.width=640;copy.height=360;copy.getContext('2d')!.drawImage(canvas,0,0,640,360);caption.textContent=label;figure.append(copy,caption);document.querySelector('#proof')!.append(figure);};
    document.querySelector('#status')!.textContent=`${atmosphere} · ${hz} Hz`;
    await advance(8);const before=pixels();if(hz===60)capture(`${atmosphere} · 初始`);
    await advance(1/hz);const adjacent=pixels();await advance(4-1/hz);const after=pixels();if(hz===60)capture(`${atmosphere} · 4 秒后`);
    transport.freeze=true;await advance(1);const frozen=pixels();transport.freeze=false;await advance(2);const resumed=pixels();
    results.push({atmosphere,hz,internal4s:difference(before,after),adjacent:difference(before,adjacent),frozen:difference(after,frozen),resumed2s:difference(frozen,resumed),error:engine.error});engine.dispose();
  }
  document.querySelector('#results')!.textContent=JSON.stringify(results,null,2);document.querySelector('#status')!.textContent='完成';run.disabled=false;
};
