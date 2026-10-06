export const vertex = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }
`;
const noise = /* glsl */`
uniform sampler2D uNoise;
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float noise2(vec2 p) { vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return texture2D(uNoise,(i+f+.5)/256.).r; }
mat2 rot(float a) { return mat2(cos(a),-sin(a),sin(a),cos(a)); }
float softNoise(vec2 p) { return noise2(p)*.57+noise2(p*2.03+4.7)*.28+noise2(p*4.07)*.15; }
vec2 flow(vec2 p,float t){ return vec2(softNoise(p+vec2(t*.11,0.)),softNoise(p+vec2(4.7,-t*.09)))-.5; }
`;
export const photoFragment = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uPhoto,uPhotoHistory,uBackground;
uniform vec2 uResolution,uPhotoSize;
uniform float uTime,uDt,uSeed,uPhotoAspect,uCoverage,uFragments,uPhotoWarp,uClarity,uEdgeThreshold,uFragmentation,uOnset;
${noise}
float photoLuma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
void main(){
  float aspect=uResolution.x/uResolution.y;
  vec2 p=(vUv-.5)*vec2(aspect,1.);
  vec2 wind=flow(p*3.+uSeed*.01,uTime*.25);
  float grid=sqrt(uFragments)*1.5;
  vec2 cell=floor((p+wind*.13)*grid);
  float identity=hash(cell+uSeed);
  vec2 uv=vUv-.5;
  // Cover preserves original aspect ratio. All four outer bounds dissolve into the field.
  if(aspect>uPhotoAspect) uv.y*=uPhotoAspect/aspect; else uv.x*=aspect/uPhotoAspect;
  uv+=wind*uPhotoWarp*.16;
  uv+=vec2(identity-.5,hash(cell+7.3)-.5)*uFragmentation*.045;
  uv=rot((identity-.5)*uFragmentation*.12)*uv+.5;
  vec3 color=texture2D(uPhoto,clamp(uv,0.,1.)).rgb;
  vec2 texel=1./uPhotoSize;
  float tl=photoLuma(texture2D(uPhoto,uv+vec2(-texel.x,texel.y)).rgb);
  float tc=photoLuma(texture2D(uPhoto,uv+vec2(0.,texel.y)).rgb);
  float tr=photoLuma(texture2D(uPhoto,uv+texel).rgb);
  float ml=photoLuma(texture2D(uPhoto,uv+vec2(-texel.x,0.)).rgb);
  float mr=photoLuma(texture2D(uPhoto,uv+vec2(texel.x,0.)).rgb);
  float bl=photoLuma(texture2D(uPhoto,uv-texel).rgb);
  float bc=photoLuma(texture2D(uPhoto,uv-vec2(0.,texel.y)).rgb);
  float br=photoLuma(texture2D(uPhoto,uv+vec2(texel.x,-texel.y)).rgb);
  float edge=length(vec2(tr+2.*mr+br-tl-2.*ml-bl,tl+2.*tc+tr-bl-2.*bc-br));
  edge=smoothstep(uEdgeThreshold*.7,uEdgeThreshold*.7+.35,edge);
  float islands=softNoise(p*4.+wind*1.8+uSeed*.1);
  float mask=smoothstep(1.-uCoverage-.22,1.-uCoverage+.03,islands);
  mask*=smoothstep(.03,.17,uv.x)*smoothstep(.03,.17,uv.y)*(1.-smoothstep(.83,.97,uv.x))*(1.-smoothstep(.83,.97,uv.y));
  float fractured=mix(1.,smoothstep(.14,.4,identity),uFragmentation*.7);
  float light=photoLuma(color);
  float contribution=mask*fractured*mix(.3+edge*.7,.55+light*.45,uClarity);
  vec3 ink=mix(vec3(light*.8+edge*.55),color,uClarity*.7);
  vec4 fresh=vec4(ink*contribution,contribution);
  vec4 history=texture2D(uPhotoHistory,clamp(vUv-wind*uDt*.018,0.,1.));
  float decay=exp2(-uDt/.22);
  gl_FragColor=mix(fresh,max(fresh,history*decay),.48);
}
`;
export const compositeFragment = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uBackground,uPhotoHistory,uGlyphs,uPalette,uSoftLight;
uniform sampler2D uGlowNear,uGlowFar;
uniform vec2 uResolution;
uniform vec3 uColors[5],uBackgroundColor;
uniform float uColorCount,uEnvelope,uPhotoPresence,uPhotoColorMix,uBrightness,uContrast,uSaturation,uGrain,uAberration,uBloom,uDrift,uTime,uBlackout;
uniform vec4 uMusic;
uniform float uSurface[6],uCellSize,uComplexity,uParticleMix,uGraphicMix,uGasMix;
uniform vec2 uFieldSize;
uniform float uDepth,uShadow,uLight;
uniform vec2 uWander;
${noise}
vec3 palette(float value){
  return texture2D(uPalette,vec2((clamp(value,0.,1.)*255.+.5)/256.,.5)).rgb;
}
float glyphMask(float id,vec2 uv){
  vec2 tile=vec2(mod(id,16.),floor(id/16.));
  return texture2D(uGlyphs,vec2((tile.x+uv.x)/16.,1.-(tile.y+uv.y)/8.)).a;
}
float surfaceValue(float value,vec2 sampleUV){
  if(uSurface[0]>.999||uParticleMix>.999)return value;
  float size=max(3.,uCellSize*uResolution.y/1080.);
  vec2 aspect=vec2(uResolution.x/uResolution.y,1.);
  vec2 materialUV=(vUv-.5)*aspect;
  vec2 current=flow(materialUV*1.35,uTime*.24);
  materialUV=rot(sin(uTime*.035)*.15)*materialUV;
  materialUV+=current*(.08+uComplexity*.16)+vec2(uTime*.018,sin(uTime*.09)*.11);
  vec2 grid=(materialUV/aspect+.5)*uResolution/size,cell=floor(grid),local=fract(grid);
  vec2 center=vUv+(.5-local)*size/uResolution;
  float sampleValue=texture2D(uBackground,clamp(center+sampleUV-vUv,.001,.999)).r;
  float radius=mix(.08,.49,smoothstep(.02,.82,sampleValue));
  float dotMask=1.-smoothstep(radius-.055,radius+.055,length(local-.5));
  float dotValue=dotMask*(.3+sampleValue*.68)*smoothstep(.01,.065,sampleValue)+value*.055;
  float pixelValue=sampleValue*(1.-smoothstep(.455,.5,max(abs(local.x-.5),abs(local.y-.5)))*.1);
  float bands=value*(7.+uComplexity*21.);
  float aa=clamp(fwidth(bands),.025,.35);
  float line=1.-smoothstep(.055,.055+aa,abs(fract(bands)-.5));
  float contourValue=line*(.32+value*.65)*smoothstep(.018,.1,value);
  float asciiValue=0.,hanziValue=0.;
  vec2 symbolUV=vec2(local.x,1.-local.y);
  if(uSurface[4]>.001)asciiValue=glyphMask(8.+floor(clamp(sampleValue,0.,.99)*55.),symbolUV)*(.38+sampleValue*.6)*smoothstep(.015,.11,sampleValue);
  if(uSurface[5]>.001)hanziValue=glyphMask(64.+floor(hash(cell+13.)*64.),symbolUV)*(.38+sampleValue*.6)*smoothstep(.025,.15,sampleValue);
  float expression=value*uSurface[0]+dotValue*uSurface[1]+pixelValue*uSurface[2]+contourValue*uSurface[3]+asciiValue*uSurface[4]+hanziValue*uSurface[5];
  return mix(expression,value,uParticleMix);
}
void main(){
  if(uBlackout>.5){ gl_FragColor=vec4(0.,0.,0.,1.);return; }
  float base=texture2D(uBackground,vUv).r;
  vec2 aspect=vec2(uResolution.x/uResolution.y,1.);
  vec2 offset=vec2(0.);
  float material=smoothstep(.06,.3,base)*(1.-smoothstep(.8,.97,base));
  vec2 gradient=vec2(dFdx(base)*uResolution.x,dFdy(base)*uResolution.y);
  float edge=smoothstep(.4,3.8,length(gradient))*material;
  float filament=.5+.5*sin(dot(vUv*aspect,vec2(31.,19.))-uTime*1.8+base*13.);
  vec2 surfaceUV=clamp(vUv+offset,.001,.999);
  float f=texture2D(uBackground,surfaceUV).r;
  f+=sin(uTime*.055+f*4.)*uDrift*.035*(1.-uGraphicMix);
  f=surfaceValue(f,clamp(vUv+offset,.001,.999));
  vec3 bg=palette(pow(max(f,0.),.93));
  bg=mix(uBackgroundColor,bg,smoothstep(.006,.09,f));
  // Reflections belong to existing edges; the palette and negative space remain stable.
  bg=mix(bg,vec3(1.),uMusic.y*edge*filament*.10*uSurface[0]*uGasMix);
  // Light grounds keep their exposure. Relief belongs to coloured masses, not the white negative space.
  float paleGround=smoothstep(.50,.86,dot(uBackgroundColor,vec3(.2126,.7152,.0722)));
  float relief=uDepth*uSurface[0]*(1.-uParticleMix*.85)*(1.-uGraphicMix*.7);
  if(relief>.001){
    vec2 illumination=texture2D(uSoftLight,surfaceUV).rg;
    float body=relief*smoothstep(.02,.23,f)*(1.-uGasMix*.62);
    bg*=mix(1.,.45+illumination.r*1.1,body);
    bg=mix(bg,vec3(1.),illumination.g*body*(1.-uGasMix*.65));
  }
  float shift=uAberration*.005;
  float chromatic=uAberration*.45*uSurface[0]*(1.-uGraphicMix);
  if(chromatic>.01){bg.r=mix(bg.r,palette(texture2D(uBackground,vUv+vec2(shift,0.)).r).r,chromatic);
    bg.b=mix(bg.b,palette(texture2D(uBackground,vUv-vec2(shift,0.)).r).b,chromatic);}
  if(uBloom>.001){
    vec3 nearLight=texture2D(uGlowNear,surfaceUV).rgb,farLight=texture2D(uGlowFar,surfaceUV).rgb;
    float breath=.94+.06*sin(uTime*.11);
    // Keep the halo local and colour it from the actual light; cold scenes never acquire a yellow veil.
    vec3 scattering=nearLight*.42+farLight*.24*breath;
    vec3 linear=mix(bg/12.92,pow(max(vec3(0.),(bg+.055)/1.055),vec3(2.4)),step(vec3(.04045),bg));
    linear+=scattering*uBloom*(1.-uGraphicMix*.55)*(1.-paleGround*.92);
    bg=mix(linear*12.92,1.055*pow(max(vec3(0.),linear),vec3(1./2.4))-.055,step(vec3(.0031308),linear));
  }
  vec3 color=bg;
  if(uEnvelope*uPhotoPresence>.001){vec4 photo=texture2D(uPhotoHistory,vUv);
    float alpha=clamp(photo.a*uEnvelope*uPhotoPresence*1.6,0.,.85);
    vec3 raw=photo.rgb/max(photo.a,.001);float l=dot(raw,vec3(.2126,.7152,.0722));
    color=mix(bg,mix(palette(clamp(l*.85+.16,0.,1.)),raw,uPhotoColorMix),alpha);}
  color=(color-.5)*uContrast+.5;
  color=mix(vec3(dot(color,vec3(.2126,.7152,.0722))),color,uSaturation);
  float grain=(hash(gl_FragCoord.xy+fract(uTime)*101.)-.5)*uGrain*.06;
  float vignette=1.-.12*pow(length((vUv-.5)*1.3),2.)*(1.-uGraphicMix)*(1.-paleGround);
  color=max(vec3(0.),color*uBrightness*vignette+grain);
  // A luminance-preserving shoulder rolls highlights toward white without per-channel clipping.
  float peak=max(color.r,max(color.g,color.b));
  float shoulder=.82+.18*(1.-exp(-max(0.,peak-.82)/.18));
  if(peak>.82)color*=shoulder/peak;
  gl_FragColor=vec4(clamp(color,0.,1.),1.);
}
`;
