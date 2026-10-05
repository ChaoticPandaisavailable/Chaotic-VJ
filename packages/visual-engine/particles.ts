import * as THREE from 'three';
import type { VariationState } from './variations.ts';

const particleVertex=/* glsl */`
precision highp float;
uniform float uTime,uComplexity,uForm,uSpread,uAngle,uBass,uImpact,uScale,uCellSize,uSeed;
uniform float uSurface[6];
uniform vec2 uResolution;
varying float vIdentity,vLight,vVisibility,vRim;
varying vec2 vParam;
mat2 turn(float a){return mat2(cos(a),-sin(a),sin(a),cos(a));}
vec3 veil(float a,float v,float layer,float time,float complexity){
  // A continuous pleated sheet; nearby points share one surface and flow direction.
  float phase=layer*.86+time*.72;
  float pleat=sin(a*4.+v*1.6-phase);
  float curl=pow(abs(v),4.);
  float radius=.68+v*.30+pleat*(.025+complexity*.12);
  radius+=sin(a*2.+phase*.65)*.045+curl*sin(a*6.-phase)*complexity*.06;
  float angle=a+v*.20*sin(a*2.+phase)+layer*.055;
  float z=sin(a*3.+v*2.8-phase)*(.08+complexity*.24);
  z+=sin(a*7.-v*3.+phase*.7)*complexity*.045+(layer-1.)*.08;
  z+=curl*sin(a*2.+phase+v*1.8)*(.04+complexity*.09);
  return vec3(radius*cos(angle),radius*sin(angle),z);
}
vec3 orient(vec3 p,float time){
  p.xy=turn(uAngle+sin(time*.17)*.13)*p.xy;
  p.xz=turn(.22*sin(time*.23))*p.xz;
  p.yz=turn(.38+sin(time*.17)*.13)*p.yz;
  return p;
}
void main(){
  float r=position.z;
  float t=uTime*.22+mod(uSeed,97.)*.13;
  float c=uComplexity;
  float a=position.x*6.2831853+t*.38;
  float b=position.y*6.2831853+t*.24;
  // Keep a one-to-one cross-section for any run length; only the folds travel.
  float v=position.y*2.-1.;
  float layer=floor(r*3.);
  vec3 torus=veil(a,v,layer,t,c);
  vec3 tangentA=veil(a+.004,v,layer,t,c)-torus;
  vec3 tangentV=veil(a,v+.004,layer,t,c)-torus;
  vec3 normal=normalize(cross(tangentA,tangentV));
  normal=orient(normal,t);
  float rim=pow(1.-abs(normal.z),2.);
  vRim=rim;vParam=vec2(a,v);
  float sy=sin(b),sr=cos(b);
  vec3 sphere=vec3(sr*cos(a),sy,sr*sin(a))*(.81+.06*c*sin(a*4.+b+t));
  vec3 ribbon=vec3((.7+.27*cos(3.*a+b))*cos(2.*a),(.7+.27*cos(3.*a+b))*sin(2.*a),.38*sin(3.*a+b));
  ribbon+=vec3(sin(b),cos(b),sin(b*.5))*.12*c;
  vec3 shell=vec3(cos(a)*( .3+position.y*.85),sin(a)*(.3+position.y*.85),(position.y-.5)*1.7);
  shell.xy=turn(position.y*5.+t*.15)*shell.xy;
  float form=uForm*3.;
  vec3 p=form<1.?mix(sphere,torus,smoothstep(0.,1.,form)):form<2.?mix(torus,ribbon,smoothstep(1.,2.,form)):mix(ribbon,shell,smoothstep(2.,3.,form));
  vec3 randomDirection=vec3(sin(r*371.3),cos(r*219.8),sin(r*571.1));
  p+=randomDirection*(.001+uSpread*.035)*(.25+c*.75);
  p+=normalize(p+vec3(.001))*sin(a*2.-uTime*.8+r*.4)*uBass*.035;
  p=orient(p,t);
  p.xy+=vec2(sin(t*.16),cos(t*.19))*.035;
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
  vLight=(.17+rim*.36+pow(abs(v),12.)*.08)*(.74+.26*perspective)+uImpact*.03;
  vLight=mix(vLight,.78,glyph);
}
`;
const silkFragment=/* glsl */`
precision highp float;
uniform float uSurface[6],uTime;
varying float vRim;
varying vec2 vParam;
void main(){
  // Transparent fabric supplies continuous shading beneath the advected fibres.
  float edge=1.-smoothstep(.93,1.,abs(vParam.y));
  float folds=.5+.5*sin(vParam.x*3.+vParam.y*2.8+uTime*.028);
  float threadPhase=vParam.y*180.+sin(vParam.x*3.+uTime*.05)*4.;
  float fine=pow(.5+.5*sin(threadPhase),8.);
  fine*=1.-smoothstep(.9,2.,fwidth(threadPhase));
  float light=.045+vRim*.19+pow(folds,4.)*.065+fine*.02;
  gl_FragColor=vec4(vec3(light),edge*uSurface[0]*.55);
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
  float line=(1.-smoothstep(.39,.49,d))*smoothstep(.23,.33,d);
  // Continuous mode uses the fabric as its body, with only a trace of fibres.
  float a=dotShape*(uSurface[0]*.65+uSurface[1])+uSurface[2]+line*uSurface[3];
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
  private material:THREE.ShaderMaterial;
  private silkMaterial:THREE.ShaderMaterial;
  constructor(glyphs:THREE.Texture){
    let seed=81791;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return (seed>>>0)/4294967296;};
    const columns=768,rows=256,parameters=new Float32Array(columns*rows*3);
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const i=(y*columns+x)*3;parameters[i]=(x+random()*.65)/columns;parameters[i+1]=(y+random()*.65)/rows;parameters[i+2]=random();}
    this.geometry.setAttribute('position',new THREE.BufferAttribute(parameters,3));
    const u=(value:unknown)=>({value});
    this.material=new THREE.ShaderMaterial({vertexShader:particleVertex,fragmentShader:particleFragment,depthTest:false,depthWrite:false,transparent:true,blending:THREE.AdditiveBlending,uniforms:{uTime:u(0),uComplexity:u(.72),uForm:u(.33),uSpread:u(.25),uAngle:u(0),uBass:u(0),uImpact:u(0),uScale:u(1),uCellSize:u(12),uSeed:u(1337),uResolution:u(new THREE.Vector2()),uSurface:u(new Float32Array([1,0,0,0,0,0])),uGlyphs:u(glyphs)}});
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
  render(renderer:THREE.WebGLRenderer,target:THREE.WebGLRenderTarget,state:VariationState,time:number,bass:number,impact:number,scale:number,seed:number){
    const u=this.material.uniforms;u.uTime.value=time;u.uComplexity.value=state.complexity;u.uForm.value=state.particleForm;u.uSpread.value=state.spread;u.uAngle.value=state.angle;
    u.uBass.value=bass;u.uImpact.value=impact;u.uScale.value=scale;u.uCellSize.value=state.cellSize;u.uSeed.value=seed;u.uSurface.value=state.weights;u.uResolution.value.set(target.width,target.height);
    renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.render(this.scene,this.camera);
  }
  dispose(){this.geometry.dispose();this.silkGeometry.dispose();this.material.dispose();this.silkMaterial.dispose();}
}
