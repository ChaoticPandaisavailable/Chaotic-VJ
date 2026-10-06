/** One continuous field: sparse ink at 0, the original nested curls at 1. */
export const classicField = /* glsl */`
float classicFbm(vec2 p){
 float v=0.,a=mix(.52,.5,uChaotic);
 for(int i=0;i<6;i++){
   if(i==5&&uChaotic<.001)break;
   float footprint=max(length(dFdx(p)),length(dFdy(p)));
   v+=a*(i==5?uChaotic:1.)*mix(.5,noise2(p),1.-smoothstep(.20,.65,footprint));
   p=mat2(.8,-.6,.6,.8)*p*2.03+vec2(7.1,3.7);a*=mix(.48,.5,uChaotic);
 }
 return v;
}
vec2 classicFbm2(vec2 p){
 vec2 v=vec2(0.);float a=.5;
 for(int i=0;i<5;i++){
   if(i>=3&&uChaotic<.001)break;
   vec2 f=fract(p);f=f*f*(3.-2.*f);
   float footprint=max(length(dFdx(p)),length(dFdy(p)));
   v+=a*(i>=3?uChaotic:1.)*mix(vec2(.5),texture2D(uNoise,(floor(p)+f+.5)/256.).rg,1.-smoothstep(.20,.65,footprint));
   p=mat2(.8,-.6,.6,.8)*p*2.03+vec2(7.1,3.7);a*=mix(.46,.5,uChaotic);
 }
 return v/mix(.8358,1.,uChaotic);
}
vec2 classicFlow(vec2 p,float t){return vec2(f3(p+vec2(t*.11,0.)),f3(p+vec2(4.7,-t*.09)))-.5;}
float classicMaterial(vec2 p,float time){
  p=p*mix(.78,1.,uChaotic)+vec2(uSeed*.013,uSeed*.027);
  float t=time*.32;
  vec2 q=classicFbm2(p+vec2(t*.13,-t*.09));
  vec2 r=classicFbm2(p+mix(1.15+uChaos*1.1,1.7+uChaos*1.8,uChaotic)*q+vec2(1.7,9.2)+vec2(t*.12,-t*.1));
  vec2 warped=p+mix(1.55+uChaos*1.8+uBass*.65,2.+uChaos*3.+uBass*1.2,uChaotic)*r;
  float activity=uOnset*.85+uFlux*.5;
  if(activity>.001)warped+=classicFlow(p*2.,t)*smoothstep(.48,.78,f3(p*.8+t*.07))*activity;
  float f=classicFbm(warped);
  float clouds=smoothstep(mix(.30,.27,uChaotic),mix(.77,.8,uChaotic),f+r.y*.22);
  float folds=classicFbm(warped*1.7+q);
  float curls=pow(1.-abs(sin(f*(10.+uMorph*20.)+r.x*4.)),2.5);
  float mass=clouds*mix(.86+folds*.28*uMorph,mix(1.,.7+curls*.3,uMorph*.5),uChaotic);
  // Quiet areas retain their ground colour; detail appears in the occupied masses only.
  float breathing=classicFbm(p*.48+q*.65);
  float voids=smoothstep(.25,.59,breathing);
  float threshold=.48-uDensity*.28-uEnergy*.045;
  mass=smoothstep(threshold,1.02,mass)*voids;
  mass*=1.-uFragmentation*.12*(1.-smoothstep(.15,.7,r.y));
  mass=mass*(1.+uEnergy*.12)+uMid*.025*(r.x-.5)*smoothstep(.08,.3,mass)+uBeat*.008*voids;
  // Preserve coloured curl interiors. The old gain plus hard clipping flattened
  // dense banks into white plateaus; this continuous shoulder retains their detail.
  float radiance=pow(max(mass,0.),1.22);
  return radiance/(1.+radiance*.30);
}
`;
