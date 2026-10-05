import * as THREE from 'three';
import type { Config, Macros } from '../shared/config.ts';
import type { VariationState } from './variations.ts';

// Barycentric wireframe technique: https://github.com/mattdesl/webgl-wireframes
// Composition, motion and print textures authored for this instrument.
const vertex = /* glsl */`
precision highp float;
attribute vec3 barycentric;
attribute vec2 center;
attribute vec4 motion,ink;
uniform vec2 uResolution;
uniform float uTime,uComplexity,uAngle,uScale,uAmplitude,uImpact,uMorph,uGesture;
uniform vec3 uLayout;
varying vec3 vBary;
varying vec2 vLocal;
varying vec4 vInk;
varying float vReveal;
mat2 turn(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
void main(){
  float t=uTime*.19,phase=motion.x;
  vec2 p=position.xy;
  p*=exp(uLayout.x*sin(phase*1.7)*.36);
  // Move vertices, not sampled pixels: straight edges survive unfolding.
  p+=vec2(sin(t*.8+phase+position.y*1.7),cos(t*.67+phase+position.x*1.5))*(.025+uMorph*.065);
  p=turn(motion.z+sin(t*.37+phase)*.16+t*motion.y*.12+uLayout.z*cos(phase)*.6)*p;
  vec2 anchor=center+vec2(sin(t*.61+phase),cos(t*.47+phase))*uAmplitude*.25;
  anchor+=vec2(sin(phase*2.3)*uLayout.x,cos(phase*1.9)*uLayout.y)*.8;
  p+=anchor;
  if(uGesture>.5&&uGesture<1.5)p.x+=sin(t*.8)*.42*uAmplitude;
  else if(uGesture<2.5&&uGesture>1.5)p.x+=sign(anchor.x)*sin(t*.63)*.2*uAmplitude;
  else if(uGesture<3.5&&uGesture>2.5)p*=1.+sin(t*.5)*.13*uAmplitude;
  else if(uGesture<4.5&&uGesture>3.5)p.x+=sign(anchor.y)*sin(t*.6)*.27*uAmplitude;
  float orbit=step(4.5,uGesture)*t*.17;
  p=turn(uAngle+orbit+sin(t*.23)*.025)*p;
  p*=clamp(uScale,.5,2.5)*(1.+uImpact*.045);
  gl_Position=vec4(p.x*uResolution.y/uResolution.x,p.y,0.,1.);
  vLocal=position.xy;vBary=barycentric;vInk=ink;
  vReveal=1.-smoothstep(uComplexity+.025,uComplexity+.12,motion.w);
}
`;
const fragment = /* glsl */`
precision highp float;
varying vec3 vBary;
varying vec2 vLocal;
varying vec4 vInk;
varying float vReveal;
uniform vec2 uResolution;
uniform float uFragmentation;
void main(){
  vec3 pixelDistance=vBary/max(fwidth(vBary),vec3(.00001));
  float distanceToEdge=min(min(pixelDistance.x,pixelDistance.y),pixelDistance.z);
  float edge=1.-smoothstep(.55,1.6,distanceToEdge);
  float tone=vInk.x,alpha=vInk.y;
  if(vInk.z>2.5){alpha*=edge;tone=vInk.x;}
  else {
    // Screened ink stays on the plane; bound frequency before Nyquist.
    float pitch=max(.019,3.8/uResolution.y);
    vec2 grid=vLocal/pitch;
    float aa=max(fwidth(grid.x),fwidth(grid.y));
    float dots=1.-smoothstep(.24,.24+aa*.65,length(fract(grid)-.5));
    float stripes=1.-smoothstep(.3,.3+aa*.65,abs(fract((vLocal.x+vLocal.y)*.707/pitch)-.5));
    float texture=vInk.z<1.5?dots:stripes;
    float printAmount=step(.5,vInk.z)*(.55+uFragmentation*.4);
    tone=mix(tone,mix(.015,.91,texture),printAmount);
    tone=mix(tone,vInk.w,edge*.88);
  }
  gl_FragColor=vec4(vec3(tone),alpha*vReveal);
}
`;

/** One ordered mesh: broad planes, translucent overlays, then fine wirework. */
export class FacetComposition {
  private scene=new THREE.Scene();
  private camera=new THREE.Camera();
  private geometry=new THREE.BufferGeometry();
  private material:THREE.ShaderMaterial;
  private seed=-1;
  private clearColor=new THREE.Color().setRGB(.025,.025,.025);
  constructor(){
    const u=(value:unknown)=>({value});
    this.material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,side:THREE.DoubleSide,transparent:true,depthTest:false,depthWrite:false,uniforms:{uResolution:u(new THREE.Vector2()),uTime:u(0),uComplexity:u(.72),uAngle:u(0),uScale:u(1),uAmplitude:u(.3),uImpact:u(0),uMorph:u(.4),uFragmentation:u(.28),uGesture:u(0)}});
    const mesh=new THREE.Mesh(this.geometry,this.material);mesh.frustumCulled=false;this.scene.add(mesh);
    this.material.uniforms.uLayout=u(new THREE.Vector3());
  }
  private compose(seed:number){
    this.seed=seed;let state=seed^0x4d731b;
    const random=()=>{state=(Math.imul(state,1664525)+1013904223)|0;return (state>>>0)/4294967296;};
    const positions:number[]=[],barycentric:number[]=[],centers:number[]=[],motions:number[]=[],inks:number[]=[];
    for(let i=0;i<48;i++){
      const wire=i>=28,large=i<10,rank=wire?i-28:i;
      const x=(random()-.5)*3.7,y=(random()-.5)*1.8;
      const radius=large?.95+random()*.8:.5+random()*.8;
      const slim=!large&&random()<.38;
      const points=slim?[[-1.25,-.14],[1.3,.04],[-.18,.28]]:[[-.95,-.5],[1.1,-.27],[-.22,.95]];
      const orientation=random()*Math.PI*2,phase=random()*6.283,speed=(random()-.5)*.65;
      const threshold=large?-.2:wire?rank/24-.12:(i-10)/22;
      const tones=[.015,.97,.27,.69,.045,.9,.42];
      const tone=tones[i%tones.length];
      const opacity=wire?.48+random()*.35:large?.92:.38+random()*.5;
      const pattern=wire?3:i>9&&i%5===1?1:i>9&&i%7===0?2:0;
      for(let j=0;j<3;j++){
        positions.push(points[j][0]*radius,points[j][1]*radius,0);
        barycentric.push(Number(j===0),Number(j===1),Number(j===2));
        centers.push(x,y);motions.push(phase,speed,orientation,threshold);
        inks.push(wire?(i%6===0?.94:.015):tone,opacity,pattern,tone>.5?.025:.9);
      }
    }
    for(const [name,values,size]of [['position',positions,3],['barycentric',barycentric,3],['center',centers,2],['motion',motions,4],['ink',inks,4]]as const)this.geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,size));
  }
  async prepare(renderer:THREE.WebGLRenderer,seed:number){this.compose(seed);await renderer.compileAsync(this.scene,this.camera);}
  render(renderer:THREE.WebGLRenderer,target:THREE.WebGLRenderTarget,state:VariationState,time:number,impact:number,field:Config['field'],macros:Macros,seed:number,layout:Float32Array,variation:number){
    if(this.seed!==seed)this.compose(seed);
    this.material.uniforms.uLayout.value.set(layout[0]*variation,layout[1]*variation,layout[4]*variation);
    const u=this.material.uniforms;u.uResolution.value.set(target.width,target.height);u.uTime.value=time;u.uComplexity.value=THREE.MathUtils.clamp(state.complexity+(macros.density-.58)*.65,0,1);u.uAngle.value=state.angle;u.uScale.value=field.scale;u.uAmplitude.value=field.amplitude;u.uImpact.value=impact;u.uMorph.value=macros.morph*(.55+macros.chaos);u.uFragmentation.value=macros.fragmentation;u.uGesture.value=['flow','sweep','collision','surge','split','orbit'].indexOf(field.gesture);
    renderer.setRenderTarget(target);renderer.setClearColor(this.clearColor,1);renderer.render(this.scene,this.camera);
  }
  dispose(){this.geometry.dispose();this.material.dispose();}
}
