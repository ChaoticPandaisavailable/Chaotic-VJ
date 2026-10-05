import * as THREE from 'three';
import butterchurn from 'butterchurn';
import tunnel from 'butterchurn-presets/presets/converted/martin - tunnel race.json';
import silver from 'butterchurn-presets/presets/converted/martin - silversmith.json';
import mandala from 'butterchurn-presets/presets/converted/shifter - mandala.json';
import origami from 'butterchurn-presets/presets/converted/Flexi - 100% shader fractal [origami edit].json';
import amulet from 'butterchurn-presets/presets/converted/martin - unholy amulet.json';
import mindblob from 'butterchurn-presets/presets/converted/Flexi - mindblob [shiny mix].json';
import resonance from 'butterchurn-presets/presets/converted/martin - resonant twister.json';
import julia from 'butterchurn-presets/presets/converted/Flexi - Julia fractal.json';
import { originalSceneCount } from '../shared/scene-catalog.ts';
import { pcmBytes, type PcmFrame } from '../audio-engine/pcm.ts';
import { sourceSize,type QualityMode } from '../shared/quality.ts';

// Whitelisted upstream data only. JSON imports keep the full preset library out of the client bundle.
const presets=[tunnel,silver,mandala,origami,amulet,mindblob,resonance,julia];
export class MilkdropDeck {
  private canvas=document.createElement('canvas');
  private visualizer:ReturnType<typeof butterchurn.createVisualizer>;
  texture:THREE.CanvasTexture;
  private style=-1;
  private variation=-1;
  preparing=false;
  private disposed=false;
  private quality:QualityMode|null=null;
  private pcm=new Uint8Array(1024);
  private audioLevels={timeByteArray:this.pcm,timeByteArrayL:this.pcm,timeByteArrayR:this.pcm};
  constructor(){
    this.canvas.width=640;this.canvas.height=360;
    this.visualizer=butterchurn.createVisualizer(null,this.canvas,{width:640,height:360,pixelRatio:1,textureRatio:1,meshWidth:32,meshHeight:24,outputAA:false});
    this.texture=this.createTexture();
  }
  private createTexture(){const texture=new THREE.CanvasTexture(this.canvas);texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.colorSpace=THREE.NoColorSpace;return texture;}
  get currentStyle(){return this.style;}
  async prepare(style:number,width:number,height:number,quality:QualityMode,variation:number){
    this.preparing=true;
    try{
      await new Promise<void>(resolve=>setTimeout(resolve,16));if(this.disposed)return;
      this.render(style,1/60,width,height,null,.5,quality,0,variation);
      await new Promise<void>(resolve=>setTimeout(resolve,16));if(this.disposed)return;
      this.render(style,1/60,width,height,null,.5,quality,0,variation);
    }finally{this.preparing=false;}
  }
  render(style:number,dt:number,width:number,height:number,frame:PcmFrame|null|undefined,speed:number,quality:QualityMode,_recipe:number,variation:number){
    const {width:w,height:h}=sourceSize(width,height,quality);
    if(this.canvas.width!==w||this.canvas.height!==h||this.quality!==quality){
      const mesh=quality==='ultra'?64:quality==='fine'?48:32;
      this.canvas.width=w;this.canvas.height=h;this.visualizer.setRendererSize(w,h,{pixelRatio:1,textureRatio:1,meshWidth:mesh,meshHeight:Math.round(mesh*.75)});this.quality=quality;
      // Three allocates immutable texture storage. A resized canvas needs a fresh allocation.
      this.texture.dispose();this.texture=this.createTexture();
    }
    if(this.style!==style||this.variation!==variation){
      const preset=presets[style-originalSceneCount];if(!preset)throw new Error('找不到开源视觉预设');
      // Upstream fills in shape defaults during load, so each deck needs its own data copy.
      const data=structuredClone(preset),phase=style*1.73;
      // Evolve inside the equation runner; reloading/recompiling on every roam target caused hitches.
      const a=`Math.sin(a.time*.031+${phase})`,b=`Math.sin(a.time*.023+${phase+2.4})`;
      data.frame_eqs_str+=`\na.rot+=${a}*${variation*.002};a.zoom*=1+${b}*${variation*.0025};a.cx+=${a}*${variation*.022};a.cy+=${b}*${variation*.022};a.warp*=1+${a}*${variation*.2};`;
      this.visualizer.loadPreset(data,this.style===style?4:0);this.style=style;this.variation=variation;
    }
    pcmBytes(frame,this.pcm);
    this.visualizer.render({elapsedTime:Math.max(.001,dt*(.35+speed*1.3)),audioLevels:this.audioLevels});
    this.texture.needsUpdate=true;return this.texture;
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.texture.dispose();this.canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();this.canvas.width=2;this.canvas.height=2;}
}
