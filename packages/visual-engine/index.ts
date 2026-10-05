import * as THREE from 'three';
import { compositeFragment, photoFragment, vertex } from './shaders.ts';
import { fieldFragment } from './fields.ts';
import { createNoiseTexture } from './noise.ts';
import { ImpulseField } from './impulses.ts';
import { VariationState } from './variations.ts';
import { createGlyphAtlas } from './glyphs.ts';
import { ParticleCloud } from './particles.ts';
import { FacetComposition } from './facet-composition.ts';
import { SceneBuffer } from './scene-buffer.ts';
import { moodLabs, hexToLab, labToHex } from '../shared/palette.ts';
import { ColorJourney,colorCue } from '../shared/color-motion.ts';
import { qualityProfiles } from '../shared/quality.ts';
import { CompositionDrift } from './composition.ts';
import { morphFragment } from './morph.ts';
import { SoftLight } from './soft-light.ts';
import { FilmicGlow } from './filmic-glow.ts';
import { paletteLutFragment } from './palette-lut.ts';
import { AdaptiveQuality } from '../shared/render-policy.ts';
import { isMilkdropStyle } from '../shared/scene-catalog.ts';
import type { PcmFrame } from '../audio-engine/pcm.ts';
import type { MilkdropDeck } from './milkdrop.ts';
import { defaultConfig, scenePresets, photoEnvelope, type AudioFeatures, type Config, type Macros, type Transport } from '../shared/config.ts';

type IncomingSource={style:number;source:MilkdropDeck|null;ready:boolean};
type RetiringScene={field:Config['field'];macros:Macros;source:MilkdropDeck|null};

export class VisualEngine {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private background: THREE.ShaderMaterial;
  private photo: THREE.ShaderMaterial;
  private composite: THREE.ShaderMaterial;
  private fieldCopy: THREE.ShaderMaterial;
  private deckA:SceneBuffer;
  private deckB:SceneBuffer;
  private fieldType:THREE.TextureDataType;
  private compositionA=new CompositionDrift();
  private compositionB=new CompositionDrift();
  private look={...defaultConfig.look};
  private qualityController=new AdaptiveQuality();
  private softLight=new SoftLight();
  private atmosphere=new THREE.Vector4(1,0,0,0);
  private filmicGlow=new FilmicGlow();
  private softSource:THREE.Texture|null=null;
  private softKey='';
  private colorLookup=new THREE.WebGLRenderTarget(256,1,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false,stencilBuffer:false});
  private colorLookupMaterial:THREE.ShaderMaterial;
  private mixed:THREE.WebGLRenderTarget;
  private mixer:THREE.ShaderMaterial;
  private crossfade=0;
  private activeB=-1;
  private activeField={...defaultConfig.field};
  private readyMaterials=new Set([6]);
  private photos: THREE.WebGLRenderTarget[];
  private photoIndex = 0;
  private photoTexture: THREE.Texture | null = null;
  private simulationTime = 0;
  private values: Macros = { ...defaultConfig.macros };
  private lastSeed = -1;
  private lastClear = -1;
  private photoAge = 0;
  private blank: THREE.DataTexture;
  private noiseTexture=createNoiseTexture();
  private glyphs=createGlyphAtlas();
  private variation=new VariationState();
  private particles:ParticleCloud|null=null;
  private facets:FacetComposition|null=null;
  private graphicMix=0;
  private particleTarget:THREE.WebGLRenderTarget|null=null;
  private activeStyle=6;
  private particleMix=0;
  private impulses=new ImpulseField();
  private impulseUniforms=Array.from({length:3},()=>new THREE.Vector4(.5,.5,99,0));
  private impulseAngles=new Float32Array(3);
  private paletteKey='';
  private colorJourney=new ColorJourney();
  get colorPhase(){return this.colorJourney.phase;}
  get colorPosition(){return this.colorJourney.position;}
  colorCue='';
  private paletteTargets=Array.from({length:6},()=>new THREE.Vector3());
  private materials=new Map<number,THREE.ShaderMaterial>();
  private materialCompiles=new Map<number,Promise<unknown>>();
  private milkdropModule:typeof import('./milkdrop.ts')|null=null;
  private milkdropLoading:Promise<unknown>|null=null;
  private milkdropA:MilkdropDeck|null=null;
  private milkdropB:MilkdropDeck|null=null;
  private failedMilkdrop=new Set<number>();
  private disposed=false;
  private transitionPreparation:Promise<void>|null=null;
  private transitionReady=false;
  private assetPreparation=new Map<number,Promise<void>>();
  private assetsReady=new Set<number>();
  private requestedStyles=[6,-1];
  private incomingSources:Array<IncomingSource|null>=[null,null];
  private retiringScenes:Array<RetiringScene|null>=[null,null];
  preparing=false;
  get currentStyle(){return this.activeStyle;}
  get transitioning(){return this.deckA.transitioning;}
  private impact=0;
  private spring=0;
  private springVelocity=0;
  private onsetArmed=true;
  private detail=0;
  private detailTarget=0;
  private detailWait=0;
  private detailSeed=1949;
  private flux=0;
  private drawCount=0;
  private gpuQuery:WebGLQuery|null=null;
  private gpuExtension: { TIME_ELAPSED_EXT:number; GPU_DISJOINT_EXT:number } | null=null;
  gpuMs:number|null=null;
  fieldResolution='';
  fieldScale=.65;
  private macroKeys=Object.keys(defaultConfig.macros) as (keyof Macros)[];
  error: string | null = null;
  notice:string|null=null;
  readonly gpu: string;
  constructor(readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!context) throw new Error('WebGL2 不可用。请在 Chrome / Edge 开启图形加速。');
    this.renderer = new THREE.WebGLRenderer({ canvas, context, alpha: false, antialias: false });
    this.renderer.autoClear = true;
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.fieldType=context.getExtension('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType;
    this.deckA=new SceneBuffer(this.fieldType);this.deckB=new SceneBuffer(this.fieldType);
    const ext = context.getExtension('WEBGL_debug_renderer_info');
    this.gpu = ext ? String(context.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(context.getParameter(context.RENDERER));
    this.gpuExtension=context.getExtension('EXT_disjoint_timer_query_webgl2');
    this.renderer.debug.onShaderError = (_gl, _program, vs, fs) => { this.error = `Shader 编译失败: ${context.getShaderInfoLog(fs) || context.getShaderInfoLog(vs)}`; console.error(this.error); };
    this.blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); this.blank.needsUpdate = true;
    const u = (value: unknown) => ({ value });
    const common = { uResolution: u(new THREE.Vector2(1920,1080)), uTime: u(0), uDt: u(1/60), uSeed: u(1337),uNoise:u(this.noiseTexture),uWander:u(new THREE.Vector2()) };
    this.background = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fieldFragment, depthTest: false, depthWrite: false, uniforms: { ...common,uResolution:u(new THREE.Vector2()), uHistory:u(this.blank), uEnergy:u(.5),uChaotic:u(0),uAtmosphere:u(this.atmosphere),uChaos:u(.6),uDensity:u(.5),uMemory:u(.65),uFragmentation:u(.5),uMorph:u(.3),uBass:u(0),uMid:u(0),uHigh:u(0),uOnset:u(0),uFlux:u(0),uBeat:u(0),uStyleA:u(0),uStyleB:u(0),uStyleMix:u(0),uGesture:u(1),uAmplitude:u(.7),uScale:u(1.3),uImpact:u(0),uPhrase:u(0) } });
    this.background.uniforms.uSpring=u(0);
    this.background.uniforms.uComplexity=u(.72);this.background.uniforms.uAngle=u(0);this.background.uniforms.uParticles=u(this.blank);
    this.background.uniforms.uComposition=u(new THREE.Vector4(0,0,0,1));this.background.uniforms.uStructuralWarp=u(0);this.background.uniforms.uVolumeSteps=u(28);
    this.background.uniforms.uHistoryValid=u(0);this.background.defines={FIELD_STYLE:6};this.materials.set(6,this.background);
    this.background.uniforms.uRevealMix=u(1);this.background.uniforms.uRevealSide=u(0);this.background.uniforms.uRevealStrength=u(.85);
    this.photo = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: photoFragment, depthTest:false, depthWrite:false, uniforms:{ ...common, uPhoto:u(this.blank), uPhotoHistory:u(this.blank), uBackground:u(this.blank),uPhotoSize:u(new THREE.Vector2(1,1)),uPhotoAspect:u(1),uCoverage:u(.27),uFragments:u(16),uPhotoWarp:u(.4),uClarity:u(.6),uEdgeThreshold:u(.25),uFragmentation:u(.5),uOnset:u(0) } });
    this.composite = new THREE.ShaderMaterial({ vertexShader:vertex, fragmentShader:compositeFragment,depthTest:false,depthWrite:false,uniforms:{ ...common,uBackground:u(this.blank),uPhotoHistory:u(this.blank),uColors:u(Array.from({length:5},(_,i)=>new THREE.Vector3(...this.hex(defaultConfig.palette.colors[Math.min(3,i)])))),uBackgroundColor:u(new THREE.Vector3(...this.hex(defaultConfig.palette.background))),uColorCount:u(4),uEnvelope:u(0),uPhotoPresence:u(.5),uPhotoColorMix:u(0),uBrightness:u(1),uContrast:u(1),uSaturation:u(1),uGrain:u(.1),uAberration:u(0),uBloom:u(0),uDrift:u(.1),uBlackout:u(0)} });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.background); this.mesh.frustumCulled=false; this.scene.add(this.mesh);
    this.composite.uniforms.uImpulses=u(this.impulseUniforms);this.composite.uniforms.uImpulseAngles=u(this.impulseAngles);
    this.composite.uniforms.uStroke=u(.75);this.composite.uniforms.uRipple=u(.6);
    this.composite.uniforms.uColorPhase=u(0);this.composite.uniforms.uRhythmColor=u(.4);
    this.composite.uniforms.uSurface=u(this.variation.weights);this.composite.uniforms.uGlyphs=u(this.glyphs);
    this.composite.uniforms.uCellSize=u(12);this.composite.uniforms.uComplexity=u(.72);this.composite.uniforms.uParticleMix=u(0);
    this.composite.uniforms.uGraphicMix=u(0);
    this.composite.uniforms.uFieldSize=u(new THREE.Vector2(2,2));this.composite.uniforms.uDepth=u(.72);this.composite.uniforms.uShadow=u(.55);this.composite.uniforms.uLight=u(.6);
    this.composite.uniforms.uColors.value=Array.from({length:5},(_,i)=>new THREE.Vector3(...hexToLab(defaultConfig.palette.colors[Math.min(3,i)])));
    this.composite.uniforms.uPalette=u(this.colorLookup.texture);this.composite.uniforms.uSoftLight=u(this.softLight.texture);
    this.composite.uniforms.uGlowNear=u(this.filmicGlow.near);this.composite.uniforms.uGlowFar=u(this.filmicGlow.far);
    this.colorLookupMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:paletteLutFragment,depthTest:false,depthWrite:false,uniforms:{uColors:this.composite.uniforms.uColors,uColorCount:this.composite.uniforms.uColorCount,uHarmonic:u(0),uPrism:u(0),uSpectrum:u(new THREE.Vector2(.5,.5))}});
    this.fieldCopy=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:'varying vec2 vUv; uniform sampler2D uSource; void main(){gl_FragColor=texture2D(uSource,vUv);}',depthTest:false,depthWrite:false,uniforms:{uSource:u(this.blank)}});
    const make=(format:THREE.PixelFormat)=>new THREE.WebGLRenderTarget(2,2,{format,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,type:THREE.UnsignedByteType,depthBuffer:false,stencilBuffer:false});
    this.mixed=make(THREE.RedFormat);this.mixed.texture.type=this.fieldType;this.photos=[make(THREE.RGBAFormat),make(THREE.RGBAFormat)];
    this.mixer=new THREE.ShaderMaterial({vertexShader:vertex,depthTest:false,depthWrite:false,uniforms:{uFrom:u(this.blank),uTo:u(this.blank),uFlow:u(this.blank),uAdvect:u(0),uMix:u(0),uSize:u(new THREE.Vector2(2,2)),uPhase:u(0),uStrength:u(.85)},fragmentShader:morphFragment});
    canvas.addEventListener('webglcontextlost', e=>{e.preventDefault();this.error='图形设备连接中断，请刷新输出页以恢复。';});
  }
  private hex(color:string): [number,number,number] { return [parseInt(color.slice(1,3),16)/255,parseInt(color.slice(3,5),16)/255,parseInt(color.slice(5,7),16)/255]; }
  private async yieldPreparation(){await new Promise<void>(resolve=>setTimeout(resolve,16));}
  private async warmMaterial(material:THREE.ShaderMaterial){
    await this.yieldPreparation();if(this.disposed)return;
    const scratch=new THREE.WebGLRenderTarget(8,8,{depthBuffer:false,stencilBuffer:false});
    const saved=this.renderer.getRenderTarget();
    try{this.draw(material,scratch);}finally{this.renderer.setRenderTarget(saved);scratch.dispose();}
    // First draw can trigger driver work after compileAsync; await it without blocking the render loop.
    const gl=this.renderer.getContext() as WebGL2RenderingContext,sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
    if(!sync)return;gl.flush();
    try{for(let i=0;i<60&&!this.disposed;i++){if(gl.clientWaitSync(sync,0,0)!==gl.TIMEOUT_EXPIRED)break;await this.yieldPreparation();}}
    finally{gl.deleteSync(sync);}
  }
  /** Only invoked by a requested scene change; the current scene keeps rendering while it waits. */
  private prepareTransition(){
    this.transitionPreparation??=(async()=>{
      await this.yieldPreparation();if(this.disposed)return;
      const shared=new THREE.Scene();
      for(const material of [this.fieldCopy,this.mixer,...this.deckA.warmupMaterials,...this.deckB.warmupMaterials]){const mesh=new THREE.Mesh(this.mesh.geometry,material);mesh.frustumCulled=false;shared.add(mesh);}
      await this.renderer.compileAsync(shared,this.camera);
      for(const material of this.deckA.warmupMaterials)await this.warmMaterial(material);
      if(!this.disposed)this.transitionReady=true;
    })().catch(error=>{if(!this.disposed)this.error=String(error);});
    return this.transitionReady;
  }
  private prepareGeometry(style:number,seed:number){
    if(this.assetsReady.has(style))return true;
    if(!this.assetPreparation.has(style)){
      const wanted=()=>!this.disposed&&this.requestedStyles.includes(style);
      const pending=(async()=>{
        await this.yieldPreparation();if(!wanted())return;
        if(style===9){this.particles??=new ParticleCloud(this.glyphs);await this.particles.prepare(this.renderer);}
        else{this.facets??=new FacetComposition();await this.facets.prepare(this.renderer,seed);}
        await this.yieldPreparation();if(!wanted())return;
        this.particleTarget??=new THREE.WebGLRenderTarget(this.deckA.width,this.deckA.height,{format:THREE.RedFormat,type:this.fieldType,depthBuffer:false,stencilBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
        const scratch=this.particleTarget;
        try{
          if(style===9)this.particles!.render(this.renderer,scratch,this.variation,0,0,0,1,seed);
          else this.facets!.render(this.renderer,scratch,this.variation,0,0,defaultConfig.field,defaultConfig.macros,seed,new Float32Array(6),0);
          this.assetsReady.add(style);
        }finally{this.renderer.setRenderTarget(null);}
      })().catch(error=>{if(!this.disposed)this.error=String(error);}).finally(()=>this.assetPreparation.delete(style));
      this.assetPreparation.set(style,pending);
    }
    return false;
  }
  private prepareSource(style:number,side:0|1,config:Config){
    const current=side===0?this.milkdropA:this.milkdropB;
    if(current?.currentStyle===style)return true;
    const previous=this.incomingSources[side];
    if(previous?.style===style)return previous.ready;
    previous?.source?.dispose();
    const incoming:IncomingSource={style,source:null,ready:false};this.incomingSources[side]=incoming;
    const wanted=()=>!this.disposed&&this.incomingSources[side]===incoming&&this.requestedStyles[side]===style;
    void(async()=>{
      await this.yieldPreparation();if(!wanted())return;
      const source=new this.milkdropModule!.MilkdropDeck();incoming.source=source;
      await source.prepare(style,this.deckA.width,this.deckA.height,config.renderer.quality,config.variation.roam?config.variation.roamAmount:0);
      if(wanted())incoming.ready=true;else source.dispose();
    })().catch(error=>{incoming.source?.dispose();if(wanted()){this.failedMilkdrop.add(style);this.notice=`开源视觉准备失败，可切回其他风格：${String(error)}`;}});
    return false;
  }
  private commitSource(side:0|1,style:number){
    const incoming=this.incomingSources[side];if(!incoming?.ready||incoming.style!==style)return;
    const previous=side===0?this.milkdropA:this.milkdropB;
    if(side===0)this.milkdropA=incoming.source;else this.milkdropB=incoming.source;
    this.incomingSources[side]=null;
    // The outgoing image has already been captured; retire its external context off the switch frame.
    if(previous)setTimeout(()=>previous.dispose(),100);
  }
  private prepareStyle(style:number,side:0|1,config:Config){
    if(isMilkdropStyle(style)){
      if(this.failedMilkdrop.has(style))return null;
      if(!this.milkdropModule){
        this.milkdropLoading??=import('./milkdrop.ts').then(module=>{if(!this.disposed){this.milkdropModule=module;this.notice=null;}}).catch(error=>{if(!this.disposed)this.notice=`开源视觉加载失败，请刷新重试：${String(error)}`;});
        return null;
      }
    }
    let material=this.materials.get(style);
    if(!material){
      material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fieldFragment,defines:{FIELD_STYLE:style},depthTest:false,depthWrite:false,uniforms:this.background.uniforms});
      this.materials.set(style,material);
      const compileScene=new THREE.Scene(),mesh=new THREE.Mesh(this.mesh.geometry,material);mesh.frustumCulled=false;compileScene.add(mesh);
      const pending=this.yieldPreparation().then(()=>this.disposed?undefined:this.renderer.compileAsync(compileScene,this.camera)).then(()=>this.warmMaterial(material!)).then(()=>{if(!this.disposed)this.readyMaterials.add(style);}).catch(error=>{if(!this.disposed)this.error=String(error);});
      this.materialCompiles.set(style,pending);
    }
    if(!this.readyMaterials.has(style))return null;
    const changing=style!==(side===0?this.activeStyle:this.activeB);
    if(changing&&!this.prepareTransition())return null;
    if((style===9||style===10)&&!this.prepareGeometry(style,config.renderer.seed))return null;
    if(isMilkdropStyle(style)&&!this.prepareSource(style,side,config))return null;
    return material;
  }
  get maxTextureSize(){return this.renderer.capabilities.maxTextureSize;}
  resize(width:number,height:number,scale:number,fieldScale=.65){
    const w=Math.max(2,Math.round(width*scale)),h=Math.max(2,Math.round(height*scale));
    if(this.canvas.width!==w||this.canvas.height!==h){this.renderer.setSize(w,h,false);this.composite.uniforms.uResolution.value.set(w,h);}
    this.fieldScale=fieldScale;
    const fw=Math.max(2,Math.round(w*fieldScale)),fh=Math.max(2,Math.round(h*fieldScale));
    const draw=(m:THREE.ShaderMaterial,t:THREE.WebGLRenderTarget)=>this.draw(m,t);
    this.deckA.resize(fw,fh,this.fieldCopy,draw);
    if(this.activeB>=0)this.deckB.resize(fw,fh,this.fieldCopy,draw);
    if(this.mixed.width!==fw||this.mixed.height!==fh){
      const previous=this.mixed;this.mixed=previous.clone();this.mixed.setSize(fw,fh);
      this.fieldCopy.uniforms.uSource.value=previous.texture;this.draw(this.fieldCopy,this.mixed);previous.dispose();
    }
    if(this.particleTarget&&(this.particleTarget.width!==fw||this.particleTarget.height!==fh))this.particleTarget.setSize(fw,fh);
    this.background.uniforms.uResolution.value.set(fw,fh);this.fieldResolution=`${fw} × ${fh}`;
    this.composite.uniforms.uFieldSize.value.set(fw,fh);this.mixer.uniforms.uSize.value.set(fw,fh);
    const pw=this.photoTexture?Math.max(2,Math.round(w*Math.min(.65,fieldScale))):2,ph=this.photoTexture?Math.max(2,Math.round(h*Math.min(.65,fieldScale))):2;
    if(this.photos[0].width!==pw||this.photos[0].height!==ph){for(const t of this.photos)t.setSize(pw,ph);this.clearPhotoHistory();}
  }
  quality(dt:number,config:Config,measure:boolean){
    const profile=qualityProfiles[config.renderer.quality],ceiling=config.renderer.fieldScale,floor=Math.min(ceiling,profile.fieldFloor);
    const external=isMilkdropStyle(this.activeStyle)||(config.performance.enabled&&isMilkdropStyle(this.activeB));
    const cost=external&&dt>1/48?Math.max(this.gpuMs??0,dt*1000):this.gpuMs;
    return this.qualityController.update(dt,ceiling,floor,config.renderer.quality,config.renderer.adaptive&&config.renderer.quality!=='ultra',measure,cost);
  }
  private get fieldTexture(){return this.crossfade===0?this.deckA.texture:this.crossfade===1?this.deckB.texture:this.mixed.texture;}
  private releaseRetiring(side:0|1){
    const old=this.retiringScenes[side];this.retiringScenes[side]=null;
    if(old?.source)setTimeout(()=>old.source!.dispose(),100);
  }
  private retire(side:0|1,field:Config['field'],macros:Macros){
    this.releaseRetiring(side);
    const source=side===0?this.milkdropA:this.milkdropB;
    this.retiringScenes[side]={field:{...field},macros:{...macros},source};
    if(side===0)this.milkdropA=null;else this.milkdropB=null;
  }
  private clear(list:THREE.WebGLRenderTarget[]){ const saved=this.renderer.getRenderTarget();this.renderer.setClearColor(0,0);for(const t of list){this.renderer.setRenderTarget(t);this.renderer.clear();}this.renderer.setRenderTarget(saved); }
  clearBackground(){this.releaseRetiring(0);this.releaseRetiring(1);this.deckA.clear(t=>this.clear(t));this.deckB.clear(t=>this.clear(t));this.clear([this.mixed]);this.milkdropA?.dispose();this.milkdropA=null;this.milkdropB?.dispose();this.milkdropB=null;for(const pending of this.incomingSources)pending?.source?.dispose();this.incomingSources=[null,null];}
  private clearPhotoHistory(){this.clear(this.photos);}
  setPhoto(texture:THREE.Texture|null){ if(this.photoTexture===texture)return;this.photoTexture=texture;this.photoAge=0;this.clearPhotoHistory();this.photo.uniforms.uPhoto.value=texture??this.blank;if(texture){const i=texture.image;this.photo.uniforms.uPhotoSize.value.set(i.width,i.height);this.photo.uniforms.uPhotoAspect.value=i.width/i.height;} }
  setPhotoAge(age:number){this.photoAge=age;}
  reset(){this.simulationTime=0;this.spring=0;this.springVelocity=0;this.impact=0;this.onsetArmed=true;this.impulses.reset(this.lastSeed);this.variation.reset();this.clearBackground();this.clearPhotoHistory();}
  render(dt:number,config:Config,audio:AudioFeatures,transport:Transport,beat:number,pcm?:PcmFrame|null,sharedColorPhase?:number){
    dt=Math.min(Math.max(dt,0),.1);
    if(this.lastSeed!==config.renderer.seed){this.lastSeed=config.renderer.seed;this.reset();}
    if(this.lastClear!==transport.clearVersion){this.lastClear=transport.clearVersion;this.clearBackground();}
    const factor=1-Math.exp(-dt/ .5);
    // Keep the outgoing scene's controls stable while an unseen destination is preparing.
    if(config.field.style===this.activeStyle)for(const key of this.macroKeys)this.values[key]+=(config.macros[key]-this.values[key])*factor;
    for(const key of ['depth','shadow','light','morph','chaotic','lightAngle'] as const)this.look[key]+=(config.look[key]-this.look[key])*factor;
    const m=this.values,mod=config.modulation;
    const paused=transport.freeze||transport.blackout;
    const presetB=scenePresets[config.performance.sceneB];
    this.requestedStyles=[config.field.style,config.performance.enabled?presetB.field.style:-1];
    for(let side=0;side<2;side++){const pending=this.incomingSources[side];if(pending&&pending.style!==this.requestedStyles[side]){pending.source?.dispose();this.incomingSources[side]=null;}}
    const nextMaterial=this.prepareStyle(config.field.style,0,config);
    const nextB=config.performance.enabled?this.prepareStyle(presetB.field.style,1,config):null;
    this.preparing=!nextMaterial||(config.performance.enabled&&!nextB)||(this.deckA.transitioning&&this.activeStyle!==config.field.style);
    if(!isMilkdropStyle(config.field.style)&&(!config.performance.enabled||!isMilkdropStyle(presetB.field.style)))this.notice=null;
    const draw=(mat:THREE.ShaderMaterial,target:THREE.WebGLRenderTarget)=>this.draw(mat,target);
    if(!paused&&nextMaterial&&!this.deckA.transitioning&&this.activeStyle!==config.field.style){
      this.retire(0,this.activeField,this.values);
      this.deckA.begin(config.variation.transitionSeconds,this.fieldCopy,draw);
      this.commitSource(0,config.field.style);
      this.background=nextMaterial;this.activeStyle=config.field.style;
    }
    if(!paused&&nextMaterial&&this.activeStyle===config.field.style)this.commitSource(0,config.field.style);
    if(!paused&&this.activeStyle===config.field.style){
      if(this.activeField.style!==config.field.style)this.activeField={...config.field};
      else{
        // Scale and amplitude share the macro easing, including repeated scene cues.
        this.activeField.scale+=(config.field.scale-this.activeField.scale)*factor;
        this.activeField.amplitude+=(config.field.amplitude-this.activeField.amplitude)*factor;
        this.activeField.gesture=config.field.gesture;
      }
    }
    if(!paused&&nextB&&!this.deckB.transitioning&&this.activeB!==presetB.field.style){
      this.deckB.resize(this.deckA.width,this.deckA.height,this.fieldCopy,draw);
      if(this.activeB>=0){const old=scenePresets.find(p=>p.field.style===this.activeB)!;this.retire(1,old.field,old.macros);this.deckB.begin(config.variation.transitionSeconds,this.fieldCopy,draw);}
      this.commitSource(1,presetB.field.style);
      this.activeB=presetB.field.style;
    }
    if(!paused&&nextB&&this.activeB===presetB.field.style)this.commitSource(1,presetB.field.style);
    if(!paused){const target=config.performance.enabled&&this.activeB>=0?config.performance.mix:0;this.crossfade+=(target-this.crossfade)*(1-Math.exp(-dt/.24));if(Math.abs(target-this.crossfade)<.0001)this.crossfade=target;}
    if(!transport.freeze&&!transport.blackout)this.simulationTime+=dt*(.2+m.motion*.9+audio.rms*mod.level*m.energy*.85);
    const b=this.background.uniforms,p=this.photo.uniforms,c=this.composite.uniforms;
    b.uChaotic.value=this.look.chaotic;
    const atmosphereIndex=['clouds','ink','nebula','classic'].indexOf(config.look.atmosphere);
    for(let i=0;i<4;i++){const target=Number(i===atmosphereIndex),value=this.atmosphere.getComponent(i);const next=value+(target-value)*(1-Math.exp(-dt/Math.max(.25,config.variation.transitionSeconds*.22)));this.atmosphere.setComponent(i,Math.abs(next-target)<.001?target:next);}
    this.atmosphere.multiplyScalar(1/(this.atmosphere.x+this.atmosphere.y+this.atmosphere.z+this.atmosphere.w));
    b.uVolumeSteps.value=qualityProfiles[config.renderer.quality].volumeSteps;
    c.uDepth.value=this.look.depth;c.uShadow.value=this.look.shadow;c.uLight.value=this.look.light;
    this.deckA.setMorph(this.look.morph);this.deckB.setMorph(this.look.morph);
    this.variation.update(dt,config.variation,transport.freeze||transport.blackout);
    b.uComplexity.value=this.variation.complexity;b.uAngle.value=this.variation.angle;
    c.uCellSize.value=this.variation.cellSize;c.uComplexity.value=this.variation.complexity;
    if(!paused)this.particleMix+=(((this.activeStyle===9?1:0)*(1-this.crossfade)+(this.activeB===9?1:0)*this.crossfade)-this.particleMix)*(1-Math.exp(-dt*4/config.variation.transitionSeconds));
    c.uParticleMix.value=this.particleMix;
    if(!paused)this.graphicMix+=(((this.activeStyle===10?1:0)*(1-this.crossfade)+(this.activeB===10?1:0)*this.crossfade)-this.graphicMix)*(1-Math.exp(-dt*4/config.variation.transitionSeconds));
    c.uGraphicMix.value=this.graphicMix;
    if(!transport.freeze&&!transport.blackout)this.impulses.update(dt,(audio.kick??0)*mod.onset,config.rhythm.drift);
    b.uWander.value.set(this.impulses.x,this.impulses.y);
    for(let i=0;i<3;i++){const event=this.impulses.events[i];this.impulseUniforms[i].set(event.x,event.y,event.age,event.strength);this.impulseAngles[i]=event.angle;}
    c.uStroke.value=config.rhythm.impact;c.uRipple.value=config.rhythm.ripple;
    c.uColorPhase.value=this.impulses.colorPhase;c.uRhythmColor.value=config.rhythm.color;
    b.uTime.value=this.simulationTime;b.uDt.value=dt;b.uSeed.value=config.renderer.seed;
    b.uEnergy.value=m.energy;b.uChaos.value=m.chaos;b.uDensity.value=m.density;b.uMemory.value=m.memory;b.uFragmentation.value=m.fragmentation;b.uMorph.value=m.morph;
    const field=this.activeField;
    b.uGesture.value=['flow','sweep','collision','surge','split','orbit'].indexOf(field.gesture);b.uAmplitude.value=field.amplitude;b.uScale.value=field.scale;
    if(!transport.freeze&&!transport.blackout){
      const movementHit=(audio.kick??0);
      this.impact=Math.max((movementHit*.85+audio.onset*.15)*mod.onset,this.impact*Math.exp(-dt/.5));
      if(movementHit<.18)this.onsetArmed=true;
      if(movementHit>.3&&this.onsetArmed){this.springVelocity+=movementHit*mod.onset*7;this.onsetArmed=false;}
      this.detailWait-=dt;
      if(this.detailWait<=0){this.detailSeed=(Math.imul(this.detailSeed,1664525)+1013904223)|0;const r=(this.detailSeed>>>0)/4294967296;this.detailTarget=audio.high*(.12+r*.3);this.detailWait=.75+r*.8;}
      this.detail+=(this.detailTarget-this.detail)*(1-Math.exp(-dt/.6));this.flux+=(audio.flux-this.flux)*(1-Math.exp(-dt/.35));
      // Substeps keep the damped mass stable across 20–144 Hz displays and occasional slow frames.
      for(let left=dt;left>0;){const h=Math.min(left,1/120);this.springVelocity+=(-75*this.spring-7*this.springVelocity)*h;this.spring+=this.springVelocity*h;left-=h;}
    }
    b.uImpact.value=this.impact;b.uSpring.value=this.spring;b.uPhrase.value=((beat%16)+16)%16/16;
    b.uEnergy.value=Math.min(1,m.energy+audio.rms*mod.level*.25);b.uBass.value=audio.bass*mod.bass;b.uMid.value=audio.mid*mod.mid;b.uHigh.value=this.detail*mod.high;b.uOnset.value=this.impact*.25;b.uFlux.value=this.flux*mod.flux;b.uBeat.value=Math.pow(1-((beat%1)+1)%1,5)*mod.beat;
    const gl=this.renderer.getContext() as WebGL2RenderingContext;const timer=this.gpuExtension;
    if(timer&&this.gpuQuery&&gl.getQueryParameter(this.gpuQuery,gl.QUERY_RESULT_AVAILABLE)){
      if(!gl.getParameter(timer.GPU_DISJOINT_EXT))this.gpuMs=gl.getQueryParameter(this.gpuQuery,gl.QUERY_RESULT)/1e6;
      gl.deleteQuery(this.gpuQuery);this.gpuQuery=null;
    }
    const timed=!!timer&&!this.gpuQuery&&++this.drawCount%30===0&&!transport.freeze;
    if(timed){this.gpuQuery=gl.createQuery();gl.beginQuery(timer!.TIME_ELAPSED_EXT,this.gpuQuery);}
    if(!transport.freeze&&!transport.blackout){
      const renderDeck=(deck:SceneBuffer,material:THREE.ShaderMaterial,shape:Config['field'],macros:Macros,retiring:RetiringScene|null=null)=>{
        const drift=deck===this.deckA?this.compositionA:this.compositionB,original=shape.style>=6&&shape.style<=8,amount=original?0:config.variation.roamAmount;
        if(!retiring)drift.update(dt,config.renderer.seed+shape.style*7919,config.variation.compositionSeed,!original&&config.variation.roam,config.variation.evolution);
        const v=drift.values;
        b.uComposition.value.set(v[0]*.32*amount,v[1]*.24*amount,v[2]*.42*amount,Math.exp(v[3]*.23*amount));b.uStructuralWarp.value=v[4]*amount;
        const driftState=Object.assign(Object.create(this.variation),{complexity:THREE.MathUtils.clamp(this.variation.complexity+v[5]*.2*amount,0,1),angle:this.variation.angle+v[2]*.42*amount,particleForm:THREE.MathUtils.clamp(this.variation.particleForm+v[4]*.3*amount,0,1),spread:THREE.MathUtils.clamp(this.variation.spread+v[5]*.16*amount,0,1)});
        b.uComplexity.value=driftState.complexity;
        b.uGesture.value=['flow','sweep','collision','surge','split','orbit'].indexOf(shape.gesture);b.uAmplitude.value=shape.amplitude;b.uScale.value=shape.scale;
        b.uEnergy.value=Math.min(1,macros.energy+audio.rms*mod.level*.25);b.uChaos.value=macros.chaos;b.uDensity.value=THREE.MathUtils.clamp(macros.density+v[5]*.12*amount,0,1);b.uMemory.value=macros.memory;b.uFragmentation.value=macros.fragmentation;b.uMorph.value=THREE.MathUtils.clamp(macros.morph+v[4]*.24*amount,0,1);
        if(isMilkdropStyle(shape.style)){
          if(this.failedMilkdrop.has(shape.style))return;
          try{
            const source=retiring?retiring.source:deck===this.deckA?this.milkdropA:this.milkdropB;
            if(!source||source.preparing)return;
            b.uParticles.value=source.render(shape.style,dt,deck.width,deck.height,pcm,macros.motion,config.renderer.quality,drift.revision,config.variation.roam?amount:0);
            if(!this.failedMilkdrop.has(config.field.style)&&(!config.performance.enabled||!this.failedMilkdrop.has(presetB.field.style)))this.notice=null;
          }catch(error){this.failedMilkdrop.add(shape.style);this.notice=`开源视觉无法运行，可切回其他风格：${String(error)}`;return;}
        }
        if(shape.style===9||shape.style===10){
          this.particleTarget??=new THREE.WebGLRenderTarget(deck.width,deck.height,{format:THREE.RedFormat,type:this.fieldType,depthBuffer:false,stencilBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
          if(shape.style===9){this.particles??=new ParticleCloud(this.glyphs);this.particles.render(this.renderer,this.particleTarget,driftState,this.simulationTime,audio.bass*mod.bass,this.impact,shape.scale*b.uComposition.value.w,config.renderer.seed);}
          else{this.facets??=new FacetComposition();this.facets.render(this.renderer,this.particleTarget,driftState,this.simulationTime,this.impact,{...shape,scale:shape.scale*b.uComposition.value.w},{...macros,morph:b.uMorph.value},config.renderer.seed,v,amount);}
          b.uParticles.value=this.particleTarget.texture;
        }
        b.uHistory.value=retiring?deck.retiringPrevious:deck.previous;b.uHistoryValid.value=retiring||deck.historyValid?1:0;
        b.uRevealMix.value=deck.nextMix(dt);b.uRevealSide.value=deck.transitioning?(retiring?-1:1):0;b.uRevealStrength.value=this.look.morph;
        this.draw(material,retiring?deck.retiringDestination:deck.destination);
        if(retiring)deck.finishRetiring();else deck.finish(dt,draw);
      };
      const retiringA=this.retiringScenes[0];
      if(retiringA&&this.deckA.transitioning)renderDeck(this.deckA,this.materials.get(retiringA.field.style)!,retiringA.field,retiringA.macros,retiringA);
      renderDeck(this.deckA,this.background,field,m);
      if(!this.deckA.transitioning)this.releaseRetiring(0);
      if(this.activeB>=0&&(config.performance.enabled||this.crossfade>0)){
        const retiringB=this.retiringScenes[1];
        if(retiringB&&this.deckB.transitioning)renderDeck(this.deckB,this.materials.get(retiringB.field.style)!,retiringB.field,retiringB.macros,retiringB);
        const oldPreset=scenePresets.find(p=>p.field.style===this.activeB)!;
        renderDeck(this.deckB,this.materials.get(this.activeB)!,oldPreset.field,oldPreset.macros);
        if(!this.deckB.transitioning)this.releaseRetiring(1);
      }
      if(this.crossfade>0&&this.crossfade<1){this.mixer.uniforms.uFrom.value=this.deckA.texture;this.mixer.uniforms.uTo.value=this.deckB.texture;this.mixer.uniforms.uMix.value=this.crossfade;this.mixer.uniforms.uPhase.value=this.simulationTime;this.mixer.uniforms.uStrength.value=this.look.morph;this.draw(this.mixer,this.mixed);}
      if(this.photoTexture){
        p.uPhotoHistory.value=this.photos[this.photoIndex].texture;p.uBackground.value=this.fieldTexture;
        p.uCoverage.value=config.photos.coverage;p.uFragments.value=config.photos.fragments;p.uPhotoWarp.value=config.photos.warp;p.uClarity.value=config.photos.clarity;p.uEdgeThreshold.value=config.photos.edgeThreshold;p.uFragmentation.value=m.fragmentation;p.uOnset.value=audio.onset*mod.onset;
        this.draw(this.photo,this.photos[1-this.photoIndex]);this.photoIndex=1-this.photoIndex;
      }
    }
    const palette=config.palette;
    const blend=palette.transitionSeconds===0?1:1-Math.exp(-dt*4/palette.transitionSeconds);
    this.colorCue=colorCue(config);
    const position=this.colorJourney.update(dt,config,paused,sharedColorPhase);
    const paletteKey=palette.colors.join('')+palette.background+String(config.colorMood.enabled);
    if(config.colorMood.enabled){
      const labs=moodLabs(position.x,position.y,config.colorLook);for(let i=0;i<5;i++)this.paletteTargets[i].set(...labs[i]);
      this.paletteTargets[5].set(...this.hex(labToHex(labs[0])));
    }else if(paletteKey!==this.paletteKey){
      for(let i=0;i<5;i++)this.paletteTargets[i].set(...hexToLab(palette.colors[Math.min(i,palette.colors.length-1)]));
      this.paletteTargets[5].set(...this.hex(palette.background));
    }
    this.paletteKey=paletteKey;
    if(!paused){
      for(let i=0;i<5;i++){
        c.uColors.value[i].lerp(this.paletteTargets[i],blend);
      }
      c.uBackgroundColor.value.lerp(this.paletteTargets[5],blend);
      c.uColorCount.value+=((config.colorMood.enabled?5:palette.colors.length)-c.uColorCount.value)*blend;
      const harmony=this.colorLookupMaterial.uniforms.uHarmonic;
      harmony.value+=((config.colorMood.enabled||palette.mapping==='cinematic'&&palette.colors.length===5?1:0)-harmony.value)*blend;
      const prism=this.colorLookupMaterial.uniforms.uPrism;
      prism.value+=((config.colorMood.enabled&&config.colorLook==='prism'?1:0)-prism.value)*blend;
      this.colorLookupMaterial.uniforms.uSpectrum.value.set(position.x,position.y);
    }
    c.uBackground.value=this.fieldTexture;c.uPhotoHistory.value=this.photoTexture?this.photos[this.photoIndex].texture:this.blank;
    this.draw(this.colorLookupMaterial,this.colorLookup);
    if(!transport.blackout&&config.renderer.bloom>.001)this.filmicGlow.render(this.fieldTexture,this.colorLookup.texture,this.deckA.width,this.deckA.height,draw);
    const softKey=`${this.look.shadow.toFixed(3)}:${this.look.light.toFixed(3)}:${this.look.lightAngle.toFixed(3)}:${this.deckA.width}:${this.deckA.height}`;
    if(!transport.blackout&&this.look.depth*this.variation.weights[0]>.001&&(!paused||this.softSource!==this.fieldTexture||this.softKey!==softKey)){
      this.softLight.render(this.fieldTexture,this.deckA.width,this.deckA.height,this.look.shadow,this.look.light,this.look.lightAngle,draw);this.softSource=this.fieldTexture;this.softKey=softKey;
    }
    c.uEnvelope.value=this.photoTexture?photoEnvelope(this.photoAge,config.photos):0;c.uPhotoPresence.value=m.photoPresence;c.uPhotoColorMix.value=palette.locked?0:palette.photoColorMix;
    c.uBrightness.value=palette.brightness;c.uContrast.value=palette.contrast;c.uSaturation.value=palette.saturation;c.uGrain.value=config.renderer.grain;c.uAberration.value=config.renderer.aberration;c.uBloom.value=config.renderer.bloom;c.uDrift.value=palette.drift;c.uBlackout.value=transport.blackout?1:0;
    this.draw(this.composite,null);
    if(timed)gl.endQuery(timer!.TIME_ELAPSED_EXT);
  }
  private draw(material:THREE.ShaderMaterial,target:THREE.WebGLRenderTarget|null){this.mesh.material=material;this.renderer.setRenderTarget(target);this.renderer.render(this.scene,this.camera);}
  dispose(){this.disposed=true;this.releaseRetiring(0);this.releaseRetiring(1);for(const pending of this.incomingSources)pending?.source?.dispose();this.softLight.dispose();this.filmicGlow.dispose();this.colorLookup.dispose();this.colorLookupMaterial.dispose();this.milkdropA?.dispose();this.milkdropB?.dispose();this.deckA.dispose();this.deckB.dispose();this.mixed.dispose();this.mixer.dispose();for(const t of this.photos)t.dispose();for(const material of this.materials.values())material.dispose();this.particles?.dispose();this.facets?.dispose();this.particleTarget?.dispose();this.glyphs.dispose();this.photo.dispose();this.composite.dispose();this.fieldCopy.dispose();this.mesh.geometry.dispose();this.blank.dispose();this.noiseTexture.dispose();this.renderer.dispose();}
}
