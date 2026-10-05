import * as THREE from 'three';
import { vertex } from './shaders.ts';

type Draw=(material:THREE.ShaderMaterial,target:THREE.WebGLRenderTarget)=>void;
const target=()=>new THREE.WebGLRenderTarget(2,2,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false,stencilBuffer:false});
const extract=/* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uSource,uPalette;
uniform vec2 uStep;
vec3 light(vec2 uv){
 float f=texture2D(uSource,uv).r;
 vec3 c=texture2D(uPalette,vec2((pow(clamp(f,0.,1.),.93)*255.+.5)/256.,.5)).rgb;
 c=mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));
 float l=dot(c,vec3(.2126,.7152,.0722));
 return c*smoothstep(.36,.82,l);
}
void main(){
 // Four taps keep tiny light particles stable when downsampling.
 vec3 c=(light(vUv+uStep)+light(vUv-uStep)+light(vUv+uStep*vec2(1.,-1.))+light(vUv+uStep*vec2(-1.,1.)))*.25;
 gl_FragColor=vec4(c,1.);
}`;
const blur=/* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uDirection;
void main(){
 vec3 c=texture2D(uSource,vUv).rgb*.227027;
 c+=(texture2D(uSource,vUv+uDirection*1.384615).rgb+texture2D(uSource,vUv-uDirection*1.384615).rgb)*.316216;
 c+=(texture2D(uSource,vUv+uDirection*3.230769).rgb+texture2D(uSource,vUv-uDirection*3.230769).rgb)*.070270;
 gl_FragColor=vec4(c,1.);
}`;
/** Light-only scattering, capped at 320×180. The original image is never blurred. */
export class FilmicGlow {
  private bright=target();private scratch=target();private close=target();private broad=target();
  private extract=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:extract,depthTest:false,depthWrite:false,uniforms:{uSource:{value:null},uPalette:{value:null},uStep:{value:new THREE.Vector2()}}});
  private blur=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:blur,depthTest:false,depthWrite:false,uniforms:{uSource:{value:null},uDirection:{value:new THREE.Vector2()}}});
  get near(){return this.close.texture;}
  get far(){return this.broad.texture;}
  render(source:THREE.Texture,palette:THREE.Texture,width:number,height:number,draw:Draw){
    const scale=Math.min(.25,320/width,180/height),w=Math.max(2,Math.round(width*scale)),h=Math.max(2,Math.round(height*scale));
    if(this.bright.width!==w||this.bright.height!==h)for(const t of [this.bright,this.scratch,this.close,this.broad])t.setSize(w,h);
    const u=this.extract.uniforms;u.uSource.value=source;u.uPalette.value=palette;u.uStep.value.set(.28/w,.28/h);draw(this.extract,this.bright);
    const pass=(source:THREE.Texture,dest:THREE.WebGLRenderTarget,x:number,y:number)=>{this.blur.uniforms.uSource.value=source;this.blur.uniforms.uDirection.value.set(x,y);draw(this.blur,dest);};
    const aspect=width/height;
    pass(this.bright.texture,this.scratch,.005/aspect,0);pass(this.scratch.texture,this.close,0,.005);
    pass(this.close.texture,this.scratch,.023/aspect,0);pass(this.scratch.texture,this.broad,.009/aspect,.020);
  }
  dispose(){for(const t of [this.bright,this.scratch,this.close,this.broad])t.dispose();this.extract.dispose();this.blur.dispose();}
}
