import * as THREE from 'three';
import { vertex } from './shaders.ts';
import { TransitionEnvelope } from './transition.ts';
import { morphFragment } from './morph.ts';

type Draw=(material:THREE.ShaderMaterial,target:THREE.WebGLRenderTarget)=>void;
const target=(type:THREE.TextureDataType)=>new THREE.WebGLRenderTarget(2,2,{format:THREE.RedFormat,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,type,depthBuffer:false,stencilBuffer:false});
/** Independent incoming/retiring histories. A new scene never inherits the old scene's trails. */
export class SceneBuffer {
  history:THREE.WebGLRenderTarget[];
  private outgoing:THREE.WebGLRenderTarget;
  private retiring:THREE.WebGLRenderTarget;
  private displayed:THREE.WebGLRenderTarget;
  private index=0;
  historyValid=false;
  private transition=new TransitionEnvelope();
  private blend=new THREE.ShaderMaterial({vertexShader:vertex,depthTest:false,depthWrite:false,
    uniforms:{uFrom:{value:null},uTo:{value:null},uMix:{value:1},uSize:{value:new THREE.Vector2(2,2)},uPhase:{value:0},uStrength:{value:.85}},fragmentShader:morphFragment});
  constructor(type:THREE.TextureDataType=THREE.UnsignedByteType){this.history=[target(type),target(type)];this.outgoing=target(type);this.retiring=target(type);this.displayed=target(type);}
  setMorph(strength:number){this.blend.uniforms.uStrength.value=strength;}
  get texture(){return this.transitioning?this.displayed.texture:this.previous;}
  get previous(){return this.history[this.index].texture;}
  get transitioning(){return this.transition.progress<1;}
  nextMix(dt:number){const t=Math.min(1,this.transition.progress+Math.max(0,dt)/this.transition.seconds);return t*t*(3-2*t);}
  get destination(){return this.history[1-this.index];}
  get retiringPrevious(){return this.outgoing.texture;}
  get retiringDestination(){return this.retiring;}
  finishRetiring(){[this.outgoing,this.retiring]=[this.retiring,this.outgoing];}
  get width(){return this.history[0].width;}
  get height(){return this.history[0].height;}
  get warmupMaterials(){return [this.blend];}
  private copy(source:THREE.Texture,to:THREE.WebGLRenderTarget,copy:THREE.ShaderMaterial,draw:Draw){copy.uniforms.uSource.value=source;draw(copy,to);}
  begin(seconds:number,copy:THREE.ShaderMaterial,draw:Draw){
    this.copy(this.texture,this.outgoing,copy,draw);
    // Interruption starts from the visible blend, never from an unrelated hidden history.
    this.copy(this.outgoing.texture,this.displayed,copy,draw);
    this.historyValid=false;
    this.transition.begin(seconds);this.blend.uniforms.uPhase.value=0;
  }
  finish(dt:number,draw:Draw){
    this.index=1-this.index;this.historyValid=true;
    if(!this.transitioning)return;
    const u=this.blend.uniforms;u.uFrom.value=this.outgoing.texture;u.uTo.value=this.previous;u.uMix.value=this.transition.update(dt);u.uPhase.value+=dt;
    draw(this.blend,this.displayed);
  }
  resize(w:number,h:number,copy:THREE.ShaderMaterial,draw:Draw){
    if(this.width===w&&this.height===h)return;
    const resize=(old:THREE.WebGLRenderTarget)=>{const next=old.clone();next.setSize(w,h);this.copy(old.texture,next,copy,draw);old.dispose();return next;};
    this.history=this.history.map(resize);this.outgoing=resize(this.outgoing);this.retiring=resize(this.retiring);this.displayed=resize(this.displayed);
    this.blend.uniforms.uSize.value.set(w,h);
  }
  clear(clear:(targets:THREE.WebGLRenderTarget[])=>void){clear([...this.history,this.outgoing,this.retiring,this.displayed]);this.transition.progress=1;this.historyValid=false;}
  dispose(){for(const t of [...this.history,this.outgoing,this.retiring,this.displayed])t.dispose();this.blend.dispose();}
}
