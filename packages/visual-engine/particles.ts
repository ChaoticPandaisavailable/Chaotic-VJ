import * as THREE from 'three';
import type { VariationState } from './variations.ts';
import { particlePetalCount, sampleParticleCycle, sampleParticleKick } from './particle-motion.ts';

const silentMusic=[0,0,0,0] as const;
const restingDrift=[0,0,99,0] as const;

const particleVertex=/* glsl */`
precision highp float;
uniform float uTime,uComplexity,uForm,uSpread,uAngle,uScale,uCellSize,uSeed;
uniform float uSurface[6];
uniform float uPetalKick[15];
uniform vec2 uResolution;
uniform vec4 uCycle,uSceneMusic,uSceneDrift;
varying float vIdentity,vLight,vVisibility,vRim,vFiberAccent,vLayer;
varying vec2 vParam;
mat2 turn(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
vec3 petalSheet(float a,float area,float layer){
  // A filled radial sheet has no fixed central hole. Uniform area parameters
  // keep the particles from piling up at the centre of the blossom.
  float r=sqrt(max(0.,area)),phase=uCycle.w,c=uComplexity;
  float bloom=uCycle.x,unfold=uCycle.y,gather=uCycle.z;
  float span=(.63+bloom*.36+unfold*.53)*(1.-layer*.105);
  float wave=sin(a*3.+phase+layer*.75)*r*r*(.025+c*.045);
  float petal=.78+.22*cos(a*5.+layer*.63);
  float angle=a+layer*.14+r*.10*sin(phase);
  float z=(1.-r*r)*(.12+gather*.34)+(layer-1.)*.095;
  z+=sin(a*5.+layer*.63)*r*(.065+gather*.19);
  z+=sin(r*3.1415927)*sin(a*2.-phase)*(.12+c*.07);
  z+=r*r*sin(a*8.+phase*2.)*c*.028;
  vec2 direction=vec2(cos(angle),sin(angle));
  vec3 blossom=vec3(direction*(r*span*petal+wave),z);
  blossom.xy*=vec2(1.+unfold*.18,1.-unfold*.24);
  // The form slider keeps the same connected sheet while moving between a
  // broad veil, a blossom, winged ribbons and an open fan; no ring topology.
  float wing=.74+.26*cos(a*2.+layer*.3);
  vec3 veil=vec3(direction*r*span*vec2(1.2,.67),z*.65+sin(a*2.-phase)*r*.15);
  vec3 ribbon=vec3(direction*r*span*wing*vec2(1.35,.72),z*.7+sin(a*2.+phase)*r*.24);
  float fanAngle=(a/6.2831853-.5)*2.65+layer*.09;
  vec3 fan=vec3(sin(fanAngle)*r*span*1.25,(cos(fanAngle)*r-.42)*span*1.35,z*.75+sin(a*3.+phase)*r*.14);
  float form=uForm*3.;
  vec3 sheet=form<1.?mix(veil,blossom,smoothstep(0.,1.,form)):form<2.?mix(blossom,ribbon,smoothstep(1.,2.,form)):mix(ribbon,fan,smoothstep(2.,3.,form));
  // A measured attack folds petals around their own roots, in a travelling order.
  // Alternating hinges keep the connected flower from becoming a single zoom pulse.
  // Sample one local petal per vertex; its mask reaches zero with zero slope
  // at either seam, so neighbouring delayed petals stay connected and smooth.
  float sector=(a+layer*.126)/1.25663706,nearest=floor(sector+.5);
  int petalIndex=int(mod(nearest,5.));
  float lobe=1.-smoothstep(.16,.5,abs(sector-nearest));
  float hinge=cos(float(petalIndex)*2.399963+layer*.72);
  float fold=lobe*hinge*uPetalKick[int(layer)*5+petalIndex];
  float anchor=smoothstep(.12,.82,r);
  vec2 radial=vec2(cos(a),sin(a)),tangent=vec2(-radial.y,radial.x);
  float projection=dot(sheet.xy,radial),bend=fold*anchor*.72;
  vec2 hinged=turn(bend)*vec2(projection,sheet.z-(layer-1.)*.095);
  sheet.xy+=radial*(hinged.x-projection);
  sheet.z=hinged.y+(layer-1.)*.095;
  sheet.xy+=tangent*fold*anchor*.065;
  // Bass advects a wave along the fabric. It has a direction and stays anchored
  // at the centre; different depth sheets carry offset crests rather than scaling.
  float flow=clamp(uSceneMusic.x,0.,1.5);
  float flowPhase=uSceneDrift.x*2.1;
  float current=r*7.4-a*2.-flowPhase+layer*1.1;
  float waveMotion=sin(current)*flow*anchor;
  sheet.z+=waveMotion*.072;
  sheet.xy+=tangent*cos(current+layer)*flow*anchor*.025;
  sheet.z+=sin(a*3.+phase+layer)*uSceneMusic.w*anchor*.025;
  return sheet;
}
vec3 orient(vec3 p,float phase){
  // Only the explicit rotation control can accumulate rotation. The fabric
  // itself makes a small, repeating bow as each movement phrase completes.
  p.xy=turn(uAngle+sin(phase)*.045)*p.xy;
  p.xz=turn(.12*sin(phase))*p.xz;
  p.yz=turn(.22+sin(phase)*.09)*p.yz;
  return p;
}
void main(){
  float r=position.z;
  float c=uComplexity;
  float a=position.x*6.2831853;
  float v=position.y;
  float layer=floor(r*3.);
  vec3 p=petalSheet(a,v,layer);
  vec3 tangentA=petalSheet(a+.004,v,layer)-p;
  vec3 tangentV=petalSheet(a,v+.004,layer)-p;
  vec3 crossNormal=cross(tangentA,tangentV);
  float normalLength=dot(crossNormal,crossNormal);
  vec3 normal=normalLength>.000000000001?crossNormal*inversesqrt(normalLength):vec3(0.,0.,1.);
  normal=orient(normal,uCycle.w);
  float rim=pow(1.-abs(normal.z),2.);
  vRim=rim;vParam=vec2(a,v);vLayer=layer;
  float fibre=pow(.5+.5*sin(a*11.+uCycle.w*.7+layer*2.4),14.);
  float outer=smoothstep(.12,.52,sqrt(v))*(.5+.5*sin(v*17.-a*2.+layer));
  vFiberAccent=clamp(uSceneMusic.y,0.,1.5)*fibre*outer;
  vec3 randomDirection=vec3(sin(r*371.3),cos(r*219.8),sin(r*571.1));
  p+=randomDirection*(.001+uSpread*.014)*(.25+c*.75);
  p=orient(p,uCycle.w);
  float perspective=3.7/(3.7+p.z);
  vec2 screen=p.xy*perspective*.79*clamp(uScale,.6,1.7);
  gl_Position=vec4(screen.x*uResolution.y/uResolution.x,screen.y,0.,1.);
  float glyph=uSurface[4]+uSurface[5];
  // Keep projected density stable: a small preview must not merge into white ink.
  float resolutionDensity=min(1.,pow(uResolution.y/900.,1.45));
  float amount=mix((.35+c*.65)*resolutionDensity,(.002+c*.004)*sqrt(resolutionDensity),glyph);
  float identity=fract(r*173.37);
  vVisibility=1.-smoothstep(amount-.002,amount+.002,identity);
  float tiny=mix(.85,1.35,position.y)*uResolution.y/900.;
  float symbol=(uCellSize*1.8+6.)*uResolution.y/1080.;
  gl_PointSize=max(1.,mix(tiny,symbol,glyph)*perspective);
  if(vVisibility<.001){gl_Position=vec4(2.,2.,0.,1.);gl_PointSize=1.;}
  vIdentity=fract(position.x*137.37+position.y*257.71+r*99.3);
  vLight=(.15+rim*.34+pow(v,6.)*.06)*(.74+.26*perspective);
  vLight=mix(vLight,.78,glyph);
  vLight+=vFiberAccent*.24;
}
`;
const silkFragment=/* glsl */`
precision highp float;
uniform float uSurface[6];
uniform vec4 uCycle,uSceneMusic,uSceneDrift;
varying float vRim,vFiberAccent,vLayer;
varying vec2 vParam;
void main(){
  // Transparent fabric supplies continuous shading beneath the advected fibres.
  float edge=1.-smoothstep(.94,1.,vParam.y);
  float folds=.5+.5*sin(vParam.x*5.+vParam.y*3.-uCycle.w);
  float threadPhase=sqrt(max(0.,vParam.y))*180.+sin(vParam.x*3.+uCycle.w)*4.;
  threadPhase+=sin(sqrt(max(0.,vParam.y))*7.4-vParam.x*2.-uSceneDrift.x*2.1+vLayer*1.1)*uSceneMusic.x*3.;
  float fine=pow(.5+.5*sin(threadPhase),8.);
  fine*=1.-smoothstep(.9,2.,fwidth(threadPhase));
  float light=.055+vRim*.19+pow(folds,4.)*.045+fine*.016;
  light+=fine*vFiberAccent*.22;
  gl_FragColor=vec4(vec3(light),edge*(uSurface[0]+uSurface[3])*.55);
}
`;
const particleFragment=/* glsl */`
precision highp float;
uniform sampler2D uGlyphs;
uniform float uSurface[6];
varying float vIdentity,vLight,vVisibility;
float glyph(float id,vec2 uv){vec2 tile=vec2(mod(id,16.),floor(id/16.));return texture2D(uGlyphs,vec2((tile.x+uv.x)/16.,1.-(tile.y+uv.y)/8.)).a;}
void main(){
  if(vVisibility<.001)discard;
  vec2 q=gl_PointCoord-.5;float d=length(q);
  float dotShape=1.-smoothstep(.3,.5,d);
  // Continuous mode uses the fabric as its body, with only a trace of fibres.
  // The retired contour slot keeps its index and behaves as continuous silk.
  float a=dotShape*((uSurface[0]+uSurface[3])*.20+uSurface[1])+uSurface[2];
  if(uSurface[4]>.001)a+=glyph(16.+floor(vIdentity*48.),gl_PointCoord)*uSurface[4];
  if(uSurface[5]>.001)a+=glyph(64.+floor(vIdentity*64.),gl_PointCoord)*uSurface[5];
  if(a<.015)discard;
  gl_FragColor=vec4(vec3(vLight),a*vVisibility);
}
`;
/** Static sheet and particle buffers, two draw calls; all motion stays on the GPU. */
export class ParticleCloud {
  private scene=new THREE.Scene();
  private camera=new THREE.Camera();
  private geometry=new THREE.BufferGeometry();
  private silkGeometry=new THREE.BufferGeometry();
  private cycle=new Float32Array(4);
  private petalKick=new Float32Array(particlePetalCount);
  private material:THREE.ShaderMaterial;
  private silkMaterial:THREE.ShaderMaterial;
  constructor(glyphs:THREE.Texture){
    let seed=81791;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296;};
    const columns=768,rows=256,parameters=new Float32Array(columns*rows*3);
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const i=(y*columns+x)*3;parameters[i]=(x+random()*.65)/columns;parameters[i+1]=(y+random()*.65)/rows;parameters[i+2]=random();}
    this.geometry.setAttribute('position',new THREE.BufferAttribute(parameters,3));
    const u=(value:unknown)=>({value});
    this.material=new THREE.ShaderMaterial({vertexShader:particleVertex,fragmentShader:particleFragment,depthTest:false,depthWrite:false,transparent:true,blending:THREE.AdditiveBlending,uniforms:{uTime:u(0),uComplexity:u(.72),uForm:u(.33),uSpread:u(.25),uAngle:u(0),uScale:u(1),uCellSize:u(12),uSeed:u(1337),uResolution:u(new THREE.Vector2()),uCycle:u(this.cycle),uPetalKick:u(this.petalKick),uSceneMusic:u(new THREE.Vector4()),uSceneDrift:u(new THREE.Vector4(0,0,99,0)),uSurface:u(new Float32Array([1,0,0,0,0,0])),uGlyphs:u(glyphs)}});
    this.silkMaterial=new THREE.ShaderMaterial({vertexShader:particleVertex.replace('if(vVisibility<.001){gl_Position=vec4(2.,2.,0.,1.);gl_PointSize=1.;}',''),fragmentShader:silkFragment,depthTest:false,depthWrite:false,transparent:true,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,uniforms:this.material.uniforms});
    const around=192,across=48,sheetParameters:number[]=[],indices:number[]=[];
    for(let layer=0;layer<3;layer++){
      const offset=sheetParameters.length/3;
      for(let y=0;y<=across;y++)for(let x=0;x<=around;x++)sheetParameters.push(x/around,y/across,(layer+.5)/3);
      for(let y=0;y<across;y++)for(let x=0;x<around;x++){const a=offset+y*(around+1)+x,b=a+around+1;indices.push(a,b,a+1,b,b+1,a+1);}
    }
    this.silkGeometry.setAttribute('position',new THREE.Float32BufferAttribute(sheetParameters,3));this.silkGeometry.setIndex(indices);
    const sheet=new THREE.Mesh(this.silkGeometry,this.silkMaterial);sheet.frustumCulled=false;this.scene.add(sheet);
    const points=new THREE.Points(this.geometry,this.material);points.frustumCulled=false;this.scene.add(points);
  }
  async prepare(renderer:THREE.WebGLRenderer){await renderer.compileAsync(this.scene,this.camera);}
  /** music=(flow,detail,impact,shear); drift=(integrated flow,kick envelope,kick age,kick peak).
   * petalWeights is the shared per-frame ParticleMusicMotion output; warmup may omit it.
   */
  render(renderer:THREE.WebGLRenderer,target:THREE.WebGLRenderTarget,state:VariationState,time:number,_bass:number,_impact:number,scale:number,seed:number,music:ArrayLike<number>=silentMusic,drift:ArrayLike<number>=restingDrift,petalWeights?:ArrayLike<number>){
    sampleParticleCycle(time,seed,this.cycle);
    if(petalWeights){for(let i=0;i<particlePetalCount;i++)this.petalKick[i]=petalWeights[i];}
    else sampleParticleKick(drift,this.petalKick);
    const u=this.material.uniforms;u.uTime.value=time;u.uComplexity.value=state.complexity;u.uForm.value=state.particleForm;u.uSpread.value=state.spread;u.uAngle.value=state.angle;
    u.uSceneMusic.value.fromArray(music);u.uSceneDrift.value.fromArray(drift);
    u.uScale.value=scale;u.uCellSize.value=state.cellSize;u.uSeed.value=seed;u.uSurface.value=state.weights;u.uResolution.value.set(target.width,target.height);
    renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.render(this.scene,this.camera);
  }
  dispose(){this.geometry.dispose();this.silkGeometry.dispose();this.material.dispose();this.silkMaterial.dispose();}
}
