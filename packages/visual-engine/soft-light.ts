import * as THREE from 'three';
import { vertex } from './shaders.ts';

type Draw=(material:THREE.ShaderMaterial,target:THREE.WebGLRenderTarget)=>void;
const target=(rgba=false)=>new THREE.WebGLRenderTarget(2,2,{format:rgba?THREE.RGBAFormat:THREE.RedFormat,type:THREE.UnsignedByteType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false,stencilBuffer:false});
const blur=/* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uDirection;
void main(){
 float v=texture2D(uSource,vUv).r*.227027;
 v+=(texture2D(uSource,vUv+uDirection*1.384615).r+texture2D(uSource,vUv-uDirection*1.384615).r)*.316216;
 v+=(texture2D(uSource,vUv+uDirection*3.230769).r+texture2D(uSource,vUv-uDirection*3.230769).r)*.070270;
 gl_FragColor=vec4(vec3(v),1.);
}`;
const lighting=/* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uStep;
uniform float uShadow,uLight,uAngle;
void main(){
 float h=texture2D(uSource,vUv).r;
 float l=texture2D(uSource,vUv-vec2(uStep.x,0.)).r,r=texture2D(uSource,vUv+vec2(uStep.x,0.)).r;
 float d=texture2D(uSource,vUv-vec2(0.,uStep.y)).r,u=texture2D(uSource,vUv+vec2(0.,uStep.y)).r;
 vec2 direction=vec2(cos(uAngle*6.2831853),sin(uAngle*6.2831853));
 vec3 normal=normalize(vec3(-vec2(r-l,u-d)*7.5,1.));
 vec3 key=normalize(vec3(direction,.9));
 float diffuse=max(0.,dot(normal,key));
 float ahead=texture2D(uSource,vUv+uStep*direction*2.5).r;
 float valley=max(0.,ahead-h)+max(0.,(l+r+d+u)*.25-h)*.65;
 float shade=1.+(diffuse-key.z)*uLight*.74-valley*uShadow*1.45;
 // A broad sheen on facing volumes; a flat ground has no specular wash.
 vec3 halfway=normalize(key+vec3(0.,0.,1.));
 float sheen=max(0.,pow(max(0.,dot(normal,halfway)),8.)-pow(halfway.z,8.))*uLight*.09;
 gl_FragColor=vec4(clamp((shade-.45)/1.1,0.,1.),sheen,0.,1.);
}`;

/** Broad, matte lighting computed on a small GPU field; no per-edge highlights. */
export class SoftLight {
  private horizontal=target();
  private vertical=target();
  private shaded=target(true);
  private blur=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:blur,depthTest:false,depthWrite:false,uniforms:{uSource:{value:null},uDirection:{value:new THREE.Vector2()}}});
  private lighting=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:lighting,depthTest:false,depthWrite:false,uniforms:{uSource:{value:null},uStep:{value:new THREE.Vector2()},uShadow:{value:.55},uLight:{value:.6},uAngle:{value:.35}}});
  get texture(){return this.shaded.texture;}
  render(source:THREE.Texture,width:number,height:number,shadow:number,light:number,angle:number,draw:Draw){
    const scale=Math.min(.5,768/width,432/height),w=Math.max(2,Math.round(width*scale)),h=Math.max(2,Math.round(height*scale));
    if(this.shaded.width!==w||this.shaded.height!==h)for(const target of [this.horizontal,this.vertical,this.shaded])target.setSize(w,h);
    const aspect=width/height;
    this.blur.uniforms.uSource.value=source;this.blur.uniforms.uDirection.value.set(.009/aspect,0);draw(this.blur,this.horizontal);
    this.blur.uniforms.uSource.value=this.horizontal.texture;this.blur.uniforms.uDirection.value.set(0,.009);draw(this.blur,this.vertical);
    const u=this.lighting.uniforms;u.uSource.value=this.vertical.texture;u.uStep.value.set(.012/aspect,.012);u.uShadow.value=shadow;u.uLight.value=light;u.uAngle.value=angle;
    draw(this.lighting,this.shaded);
  }
  dispose(){this.horizontal.dispose();this.vertical.dispose();this.shaded.dispose();this.blur.dispose();this.lighting.dispose();}
}
