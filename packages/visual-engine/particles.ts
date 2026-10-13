import * as THREE from 'three';
import type { VariationState } from './variations.ts';
import type { Macros } from '../shared/config.ts';
import { particleRegionCount, sampleParticleCycle, sampleParticleKick } from './particle-motion.ts';
const silentMusic=[0,0,0,0] as const,restingDrift=[0,0,99,0] as const;
const particleVertex=/* glsl */`
precision highp float;
uniform float uTime,uComplexity,uForm,uSpread,uAngle,uScale,uCellSize,uSeed,uDensity,uEnergy,uChaos;
uniform float uSurface[6],uStreamImpulse[15];
uniform vec2 uResolution;
uniform vec4 uCycle,uSceneMusic,uSceneDrift;
varying float vIdentity,vLight,vVisibility,vGlow;
mat2 turn(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
float hash1(float n){return fract(sin(n*127.1+uSeed*.17)*43758.5453);}
void main(){
 float identity=position.z,layer=min(2.,floor(identity*3.)),depthLayer=layer-1.;
 float h1=hash1(identity*179.+4.),h2=hash1(identity*347.+8.);
 // Long streams cross the frame, wrap beyond the camera, and fade at their ends.
 float along=fract(position.x+uTime*(.007+layer*.0017)+uSceneDrift.x*(.004+layer*.0012));
 float x=(along-.5)*8.8,phase=uCycle.w;
 float band=position.y*2.-1.;
 float gaussian=sqrt(-2.*log(max(.0001,position.y)))*cos(h2*6.2831853)*.48;
 float width=.45+uSpread*.7;
 float river=sin(x*.70+depthLayer*.9+sin(phase)*.18)*.43+sin(x*1.3+layer)*.13;
 float arc=.65-x*x*.085+depthLayer*.36+sin(x*.8+phase)*.12;
 float sail=sin(x*.46+depthLayer*.8)*.82+depthLayer*.23;
 float form=uForm*2.;
 float spine=form<1.?mix(river,arc,smoothstep(0.,1.,form)):mix(arc,sail,smoothstep(1.,2.,form));
 spine+=x*.14;
 float spread=width*(.72+.28*sin(x*.74+layer*1.3+phase));
 float y=spine+gaussian*spread+depthLayer*.20;
 float z=depthLayer*.78+(h1-.5)*(.55+uSpread*.6);
 float flow=uSceneDrift.x*.95;
 float filament=sin(x*2.2+band*2.-flow+layer*1.4);
 y+=filament*(.025+uChaos*.08+uSceneMusic.x*.07)*(.35+abs(band));
 z+=sin(x*1.1-band*2.4-flow*.7)*(.16+uComplexity*.12);
 // Fifteen overlapping regions lift and shear their own current on measured kicks.
 float region=clamp(along*4.,0.,3.999),blend=smoothstep(0.,1.,fract(region));
 int index=int(layer)*5+int(floor(region));
 float impulse=mix(uStreamImpulse[index],uStreamImpulse[index+1],blend);
 y+=sin(x*1.75+layer*1.8)*impulse*.18;
 z+=cos(x*1.3+layer)*impulse*.24;
 vec3 p=vec3(x,y,z);
 p.xy=turn(uAngle+sin(phase)*.025)*p.xy;p.yz=turn(.12)*p.yz;
 float perspective=4.8/(4.8+p.z);
 vec2 screen=p.xy*perspective*.60*clamp(uScale,.6,1.7);
 gl_Position=vec4(screen.x*uResolution.y/uResolution.x,screen.y,0.,1.);
 float glyph=uSurface[4]+uSurface[5];
 float resolutionDensity=min(1.,pow(uResolution.y/1080.,1.6));
 float amount=mix((.3+uComplexity*.4+uDensity*.3)*resolutionDensity,(.003+uComplexity*.003)*sqrt(resolutionDensity),glyph);
 float selection=hash1(identity*769.+2.);
 vVisibility=(1.-smoothstep(amount-.002,amount+.002,selection))*smoothstep(0.,.045,along)*(1.-smoothstep(.955,1.,along));
 float hero=pow(h2,24.);
 float point=(1.45+hero*6.2)*(.55+uCellSize*.0375)*uResolution.y/1080.;
 float symbol=(uCellSize*1.5+4.)*uResolution.y/1080.;
 float sparkle=pow(.5+.5*sin(x*3.9+identity*271.+uTime*.7),18.)*uSceneMusic.y;
 gl_PointSize=clamp(mix(point,symbol,glyph)*perspective*(1.+sparkle*.18),1.,48.);
 if(vVisibility<.001){gl_Position=vec4(2.,2.,0.,1.);gl_PointSize=1.;}
 float core=exp(-abs(gaussian)*3.);
 vLight=(.26+core*.30+hero*.70)*(.8+.2*perspective)*(.7+uEnergy*.6)+sparkle*(.12+hero*.2);
 vLight=mix(vLight,.78,glyph);vGlow=hero;vIdentity=identity;
}
`;
const particleFragment=/* glsl */`
precision highp float;
uniform sampler2D uGlyphs;
uniform float uSurface[6];
varying float vIdentity,vLight,vVisibility,vGlow;
float glyph(float id,vec2 uv){vec2 tile=vec2(mod(id,16.),floor(id/16.));return texture2D(uGlyphs,vec2((tile.x+uv.x)/16.,1.-(tile.y+uv.y)/8.)).a;}
void main(){
 if(vVisibility<.001)discard;
 float d=length(gl_PointCoord-.5);
 float core=1.-smoothstep(.16,.46,d),halo=exp(-d*d*16.)*vGlow*.18;
 float a=(core+halo)*((uSurface[0]+uSurface[3])*.92+uSurface[1])+uSurface[2];
 if(uSurface[4]>.001)a+=glyph(16.+floor(vIdentity*48.),gl_PointCoord)*uSurface[4];
 if(uSurface[5]>.001)a+=glyph(64.+floor(vIdentity*64.),gl_PointCoord)*uSurface[5];
 if(a<.01)discard;
 gl_FragColor=vec4(vec3(vLight),a*vVisibility);
}
`;
/** 262,144 static seeds, one point draw, and all spatial motion on the GPU. */
export class ParticleCloud {
 private scene=new THREE.Scene();
 private camera=new THREE.Camera();
 private geometry=new THREE.BufferGeometry();
 private cycle=new Float32Array(4);
 private impulse=new Float32Array(particleRegionCount);
 private material:THREE.ShaderMaterial;
 constructor(glyphs:THREE.Texture){
  let seed=81791;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296;};
  const count=262144,parameters=new Float32Array(count*3);
  for(let i=0;i<count;i++){parameters[i*3]=random();parameters[i*3+1]=random();parameters[i*3+2]=random();}
  this.geometry.setAttribute('position',new THREE.BufferAttribute(parameters,3));
  const u=(value:unknown)=>({value});
  this.material=new THREE.ShaderMaterial({vertexShader:particleVertex,fragmentShader:particleFragment,depthTest:false,depthWrite:false,transparent:true,blending:THREE.AdditiveBlending,uniforms:{uTime:u(0),uComplexity:u(.72),uForm:u(.33),uSpread:u(.25),uAngle:u(0),uScale:u(1),uCellSize:u(12),uSeed:u(1337),uResolution:u(new THREE.Vector2()),uCycle:u(this.cycle),uStreamImpulse:u(this.impulse),uSceneMusic:u(new THREE.Vector4()),uSceneDrift:u(new THREE.Vector4(0,0,99,0)),uSurface:u(new Float32Array([1,0,0,0,0,0])),uGlyphs:u(glyphs)}});
  const points=new THREE.Points(this.geometry,this.material);points.frustumCulled=false;this.scene.add(points);
  this.material.uniforms.uDensity=u(.64);this.material.uniforms.uEnergy=u(.62);this.material.uniforms.uChaos=u(.5);
 }
 async prepare(renderer:THREE.WebGLRenderer){await renderer.compileAsync(this.scene,this.camera);}
 /** Shared music clocks are sampled identically by A/B and retiring decks. */
 render(renderer:THREE.WebGLRenderer,target:THREE.WebGLRenderTarget,state:VariationState,time:number,_bass:number,_impact:number,scale:number,seed:number,music:ArrayLike<number>=silentMusic,drift:ArrayLike<number>=restingDrift,weights?:ArrayLike<number>,macros?:Pick<Macros,'density'|'energy'|'chaos'>){
  sampleParticleCycle(time,seed,this.cycle);
  if(weights){for(let i=0;i<particleRegionCount;i++)this.impulse[i]=weights[i];}else sampleParticleKick(drift,this.impulse);
  const u=this.material.uniforms;u.uTime.value=time;u.uComplexity.value=state.complexity;u.uForm.value=state.particleForm;u.uSpread.value=state.spread;u.uAngle.value=state.angle;
  u.uSceneMusic.value.fromArray(music);u.uSceneDrift.value.fromArray(drift);
  u.uScale.value=scale;u.uCellSize.value=state.cellSize;u.uSeed.value=seed;u.uSurface.value=state.weights;u.uResolution.value.set(target.width,target.height);
  u.uDensity.value=macros?.density??.64;u.uEnergy.value=macros?.energy??.62;u.uChaos.value=macros?.chaos??.5;
  renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.render(this.scene,this.camera);
 }
 dispose(){this.geometry.dispose();this.material.dispose();}
}
