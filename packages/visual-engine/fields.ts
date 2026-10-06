import { atmosphereFields } from './atmospheres.ts';
import { classicField } from './classic.ts';
import { volumeField } from './volume.ts';
import { secondaryStudies } from './studies.ts';
import { revealMaskGLSL } from './morph.ts';
import { gasCompositeGLSL } from './gas-motion.ts';
/** Original distance-field studies, inspired by The Book of Shaders chapters 11–13. */
export const fieldFragment = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uHistory,uNoise,uParticles;
uniform vec2 uResolution;
uniform vec2 uWander;
uniform float uTime,uDt,uSeed,uEnergy,uChaotic,uChaos,uDensity,uMemory,uFragmentation,uMorph,uBass,uMid,uHigh,uOnset,uFlux,uBeat;
uniform float uStyleA,uStyleB,uStyleMix,uGesture,uAmplitude,uScale,uImpact,uPhrase,uSpring;
uniform float uHistoryValid;
uniform float uRevealMix,uRevealSide,uRevealStrength;
uniform float uComplexity,uAngle;
uniform vec4 uComposition,uAtmosphere;
uniform vec4 uMusic;
uniform float uMusicRelease;
uniform float uStructuralWarp,uVolumeSteps;
uniform vec4 uGasLayers[3];
uniform vec4 uNebulaDrift;
uniform float uGasEvolution;
uniform float uSkyTime;
uniform vec4 uMeteor,uMeteorPath;
${gasCompositeGLSL}
float hash(vec2 p){p+=mod(uSeed,997.)*vec2(.013,.027);vec3 a=fract(vec3(p.xyx)*.1031);a+=dot(a,a.yzx+33.33);return fract((a.x+a.y)*a.z);}
vec2 hash2(vec2 p){return vec2(hash(p),hash(p+17.73));}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return texture2D(uNoise,(i+f+.5)/256.).r;}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float f3(vec2 p){float v=noise2(p)*.57;p=rot(.6)*p*2.03+4.1;v+=noise2(p)*.28;return v+noise2(p*2.03+7.7)*.15;}
${classicField}
${atmosphereFields}
${volumeField}
// F1/F2 and cell identity are found in a bounded 3x3 neighborhood, not across every site.
vec3 cells(vec2 p,float t){vec2 base=floor(p),f=fract(p);float first=9.,second=9.,identity=0.;
for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 grid=vec2(float(x),float(y));vec2 h=hash2(base+grid);vec2 site=.5+.36*sin(t*.58+6.2831*h);vec2 diff=grid+site-f;float d=dot(diff,diff);if(d<first){second=first;first=d;identity=h.x;}else second=min(second,d);}
return vec3(sqrt(first),sqrt(second),identity);}
${secondaryStudies}
${revealMaskGLSL}
vec2 choreography(vec2 p,float t){
 float a=uAmplitude;float spring=0.;
 if(uGesture<.5){p+=vec2(sin(t*.25),cos(t*.21))*.25*a;}
 else if(uGesture<1.5){p=rot(.16*sin(t*.4)+spring*.23*a)*p;p+=vec2(t*.62+spring,sin(t*.52)*.78)*a;p.x+=sin(p.y*.85+t*.6)*a*.42;}
 else if(uGesture<2.5){float side=tanh(p.x*1.5);p.x+=side*(sin(t*.72)*(.55+uBass*.7)-spring*.8)*a;p.y+=side*(cos(t*.6)*.75+spring)*a;p=rot(sin(t*.2)*.13)*p;}
 else if(uGesture<3.5){p=rot(t*.08)*p;p+=vec2(sin(t*.15),cos(t*.12))*.3*a;}
 else if(uGesture<4.5){float direction=tanh(sin(p.y*1.3+sin(t*.3)*.4)*2.);p.x+=direction*(sin(t*.56)*.6+spring)*a;p.y+=sin(p.x*.7+t*.5)*.3*a;}
 else{p=rot(t*.3+a*spring*.25)*p;p+=vec2(sin(t*.37),cos(t*.29))*.7*a;}
 return p;
}
float sceneValue(vec2 p,float style,float t){
 float value=studyMaterial(p,style,t);
 return style>5.5?value:clamp((value-.3)*(1.15+uEnergy*.35)+.35+(uDensity-.5)*.28,0.,.98);
}
void main(){
 // The two scenes remain live, but the invisible side does not raymarch or evaluate nested noise.
 if(abs(uRevealSide)>.5){
   float coverage=revealMask(vUv,uResolution,uRevealMix,uRevealStrength);
   if((uRevealSide>0.&&coverage<.000001)||(uRevealSide<0.&&coverage>.999999))discard;
 }
 vec2 aspect=vec2(uResolution.x/uResolution.y,1.);
 // Geometry, particles and every other scene keep their own undeformed coordinates.
 vec2 skyPoint=(vUv-.5)*aspect;
 vec2 origin=skyPoint*3.2/max(.5,uScale);
 origin=rot(uComposition.z)*origin/uComposition.w+uComposition.xy;
 #if FIELD_STYLE != 2
 origin+=uStructuralWarp*.28*vec2(sin(origin.y*1.15+uTime*.06),sin(origin.x*.9-uTime*.045));
 #endif
 #if FIELD_STYLE < 6 || FIELD_STYLE > 8
 origin=rot(uAngle)*origin;
 #endif
 float t=uTime;
 vec2 p=choreography(origin,t)+uWander*1.6;
 #if FIELD_STYLE == 2
 p=rot(sin(t*.12)*.18+uSpring*uAmplitude*.1)*origin+vec2(sin(t*.08)*.3,cos(t*.11)*.15)+uWander*.5;
 #endif
 float fresh=0.;
 #if FIELD_STYLE >= 11
 float sourceAngle=uAngle+uComposition.z;
 float cover=max(abs(cos(sourceAngle))+abs(sin(sourceAngle))/aspect.x,abs(cos(sourceAngle))+abs(sin(sourceAngle))*aspect.x);
 vec2 sourcePoint=rot(sourceAngle)*((vUv-.5)*aspect)/uComposition.w;
 sourcePoint+=uComposition.xy*.15+uStructuralWarp*.055*vec2(sin(sourcePoint.y*5.+uTime*.04),sin(sourcePoint.x*4.-uTime*.035));
 vec2 sourceUV=sourcePoint/aspect/max(.5,uScale)/cover+.5;
 // Rotated feedback fills the viewport; mirror its edges instead of stretching a border pixel.
 vec3 sourceColor=texture2D(uParticles,1.-abs(mod(sourceUV,2.)-1.)).rgb;
 fresh=pow(clamp(dot(sourceColor,vec3(.2126,.7152,.0722)),0.,1.),.95);
 #elif FIELD_STYLE == 9 || FIELD_STYLE == 10
 fresh=texture2D(uParticles,vUv).r;
 #elif FIELD_STYLE == 6
 fresh=atmosphereMaterial(p,t+uGasEvolution,skyPoint);
 #elif FIELD_STYLE > 6
 fresh=volumeMaterial(p,float(FIELD_STYLE),t);
 #else
 fresh=sceneValue(p,float(FIELD_STYLE),t);
 #endif
 vec2 drift=vec2(sin(origin.y*1.3+t*.4),cos(origin.x*.9-t*.3));
 vec2 historyUV=vUv-drift*uDt*(.013+uAmplitude*.014);
 #if FIELD_STYLE >= 9
 historyUV=vUv;
 #endif
 float previous=texture2D(uHistory,clamp(historyUV,.001,.999)).r*uHistoryValid;
 float decay=exp2(-uDt/mix(.045,1.1,uMemory));
 float persistence=mix(fresh,max(fresh,previous*decay),uMemory*.55);
 #if FIELD_STYLE == 6
 // Density layers already provide depth; feedback would glue overlapping wisps together.
 persistence=mix(fresh,max(fresh,previous*decay),uMemory*.025);
 #endif
 #if FIELD_STYLE >= 9
 persistence=fresh;
 #endif
 gl_FragColor=vec4(vec3(clamp(persistence,0.,.98)),1.);
}
`;
