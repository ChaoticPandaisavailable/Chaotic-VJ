// Development-only visible harness. Each case starts from the same seed and base configuration.
import { VisualEngine } from '../../../packages/visual-engine/index.ts';
import { FeatureExtractor } from '../../../packages/audio-engine/features.ts';
import { checkFlow } from './flow-check.ts';
import { defaultConfig,applyScenePreset,scenePresets,silentFeatures,type AudioFeatures } from '../../../packages/shared/config.ts';
const canvas=document.querySelector<HTMLCanvasElement>('#visual')!,run=document.querySelector<HTMLButtonElement>('#run')!;
const probe=document.createElement('canvas');probe.width=320;probe.height=180;const ctx=probe.getContext('2d',{willReadFrequently:true})!;
const pixels=()=>{ctx.drawImage(canvas,0,0,320,180);return ctx.getImageData(0,0,320,180).data;};
const difference=(a:Uint8ClampedArray,b:Uint8ClampedArray)=>a.reduce((sum,value,i)=>sum+(i%4===3?0:Math.abs(value-b[i])),0)/(a.length*.75);
const transport={freeze:false,blackout:false,queuePaused:false,clearVersion:0};
const directionButton=document.createElement('button'),directionResults=document.createElement('pre');directionButton.textContent='验证单向位移';directionResults.id='direction-results';
document.querySelector('#audio')!.after(directionButton);document.body.append(directionResults);
directionButton.textContent='验证流动面积与 30 分钟稳定性';
directionButton.onclick=async()=>{directionButton.disabled=true;try{directionResults.textContent=JSON.stringify(await checkFlow(),null,2);}catch(e){directionResults.textContent=String(e);}finally{directionButton.disabled=false;}};
run.onclick=async()=>{
  run.disabled=true;canvas.hidden=false;document.querySelector('#proof')!.replaceChildren();const results=[];let baseline:Uint8ClampedArray|undefined;
  for(const kind of ['自然演化','底鼓推动','低频涡流','高频边缘','蓄力','释放']){
    const config=structuredClone(defaultConfig);applyScenePreset(config,scenePresets[0]);config.look.atmosphere='classic';config.look.chaotic=.75;
    config.colorMood.enabled=true;config.colorLook='storm';config.colorMotion.enabled=false;config.renderer.grain=0;config.renderer.adaptive=false;config.palette.transitionSeconds=0;
    const engine=new VisualEngine(canvas);engine.resize(1280,720,1,1);const start=performance.now();let peakImpact=0,peakDetail=0;
    document.querySelector('#status')!.textContent=kind;
    for(let frame=0;frame<240;frame++){
      if(frame%8===0)await new Promise<void>(r=>requestAnimationFrame(()=>r()));
      const t=frame/60,features:AudioFeatures=silentFeatures();
      if(t>1){
        if(kind==='底鼓推动'){features.rms=.4;features.kick=Math.exp(-(t% .5)/.12);}
        if(kind==='低频涡流'){features.rms=.4;features.bass=.8;}
        if(kind==='高频边缘'){features.rms=.3;features.high=.8;features.hat=Math.exp(-(t%.25)/.07);}
        if(kind==='蓄力'||kind==='释放')config.music.section='build';
        if(kind==='释放'&&t>3.4){config.music.section='steady';config.music.releaseId=1;}
      }
      engine.render(1/60,config,features,transport,t*2);peakImpact=Math.max(peakImpact,engine.musicResponse.impact);peakDetail=Math.max(peakDetail,engine.musicResponse.detail);
    }
    const current=pixels();baseline??=current;
    const figure=document.createElement('figure'),copy=document.createElement('canvas'),caption=document.createElement('figcaption');copy.width=640;copy.height=360;copy.getContext('2d')!.drawImage(canvas,0,0,640,360);caption.textContent=kind;figure.append(copy,caption);document.querySelector('#proof')!.append(figure);
    results.push({kind,error:engine.error,meanDelta:+difference(baseline,current).toFixed(3),elapsedMs:Math.round(performance.now()-start),gpuMs:engine.gpuMs,peakImpact,peakDetail,forces:engine.musicResponse});
    engine.dispose();
  }
  document.querySelector('#results')!.textContent=JSON.stringify(results,null,2);document.querySelector('#status')!.textContent='画面验证完成';canvas.hidden=true;run.disabled=false;
};
document.querySelector<HTMLButtonElement>('#audio')!.onclick=async()=>{
  const audio=new AudioContext();await audio.resume();const results=[];
  for(const [name,hz]of [['低频',80],['中频',1400],['高频',7600]] as const){
    const analyser=audio.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=0;
    const oscillator=audio.createOscillator(),gain=audio.createGain(),mute=audio.createGain();oscillator.frequency.value=hz;gain.gain.value=.35;mute.gain.value=0;
    oscillator.connect(gain).connect(analyser).connect(mute).connect(audio.destination);oscillator.start();
    const extractor=new FeatureExtractor(),time=new Float32Array(2048),db=new Float32Array(1024);let peak=silentFeatures(),last=performance.now();
    for(let i=0;i<24;i++){await new Promise<void>(r=>requestAnimationFrame(()=>r()));const now=performance.now();analyser.getFloatTimeDomainData(time);analyser.getFloatFrequencyData(db);const f=extractor.analyze(time,db,audio.sampleRate,(now-last)/1000);last=now;for(const key of Object.keys(peak)as (keyof AudioFeatures)[])peak[key]=Math.max(peak[key],f[key]);}
    oscillator.stop();oscillator.disconnect();gain.disconnect();analyser.disconnect();mute.disconnect();results.push({name,hz,peak});
  }
  await audio.close();document.querySelector('#audio-results')!.textContent=JSON.stringify(results,null,2);
};
