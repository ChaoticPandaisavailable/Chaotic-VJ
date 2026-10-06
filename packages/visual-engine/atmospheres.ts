/** Large coherent masses, long ink sheets and spiral energy share the same colour field. */
export const atmosphereFields=/* glsl */`
float atmosphereNoise(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.-15.)+10.);
 return texture2D(uNoise,(i+f+.5)/256.).r;
}
float atmosphereFbm(vec2 p){
 float v=0.,a=.55;
 for(int i=0;i<6;i++){
   float footprint=max(length(dFdx(p)),length(dFdy(p)));
   float detail=i<3?1.:mix(.24,1.,uChaotic);
   v+=a*detail*mix(.5,atmosphereNoise(p),1.-smoothstep(.22,.7,footprint));
   p=mat2(.86,-.51,.51,.86)*p*2.06+vec2(5.4,8.1);a*=.46;
 }
 return v;
}
vec2 atmosphereFlow(vec2 p){return vec2(atmosphereFbm(p),atmosphereFbm(p+vec2(8.3,3.7)))-.45;}
vec2 atmosphereSwirl(vec2 p,vec2 center,float radius,float angle){
 vec2 d=p-center;return center+rot(angle*exp(-dot(d,d)/radius))*d;
}
float cloudAtmosphere(vec2 p,float time){
 // The engine clock already applies Motion. Keep the nested
 // flows evolving at their own rates instead of slowing that clock a second time.
 float t=time;
 p=p*.55+vec2(mod(uSeed,113.)*.037,mod(uSeed,83.)*.029);
 p=atmosphereSwirl(p,vec2(.7,-.3),3.6,.8+sin(t*.09)*.24);
 vec2 drift=vec2(t*.045,-t*.025);
 vec2 q=atmosphereFlow(p*.83+drift);
 vec2 r=atmosphereFlow(p+q*(1.8+uChaos*.8)+vec2(-t*.033,t*.027));
 vec2 advected=p+r*(2.1+uChaotic*.85)+q*.65;
 float broad=atmosphereFbm(advected);
 float folds=atmosphereFbm(advected*vec2(1.7,1.2)+q*.9);
 float weather=atmosphereFbm(p*.48+vec2(7.2,-3.6)+drift*.3);
 float body=broad*.78+folds*.22;
 float rim=smoothstep(.28,.48,body)*(1.-smoothstep(.52,.73,body));
 body+=(folds-.45)*rim*(.10+uChaotic*.15);
 float base=.31-uDensity*.08;
 float mass=smoothstep(base,.69-uEnergy*.045,body+weather*.10);
 float opening=smoothstep(.21,.46,weather+broad*.19);
 return clamp(pow(mass,1.18)*opening*(.88+uEnergy*.22)+uBass*.025*rim,0.,.96);
}
float inkAtmosphere(vec2 p,float time){
 float t=time*.85;p=rot(-.21)*p*.66;
 p+=vec2(mod(uSeed,71.)*.018,0.);
 vec2 q=atmosphereFlow(p*vec2(.65,1.1)+vec2(-t*.065,4.8));
 vec2 r=atmosphereFlow(p*vec2(.9,1.5)+q*1.65+vec2(t*.025,8.4));
 float sweep=sin(p.x*.73+t*.09)*.48+sin(p.x*.31-1.)*.35;
 float bank=atmosphereFbm(p*vec2(.9,3.4)+q*2.+r*1.4);
 float across=p.y-sweep-q.y*.74-r.x*(.28+uChaotic*.3)+(bank-.45)*(.55+uChaotic*.45);
 float widths=.17+.32*atmosphereFbm(p*.72+vec2(1.2,3.8));
 float mainSheet=exp(-pow((across+.23)/widths,2.)*.8);
 float distantSheet=exp(-pow((across-.63)/(widths*.72),2.));
 vec2 fibers=vec2(p.x*1.45-t*.06,across*(5.+uChaotic*7.))+r*(1.4+uChaotic*1.8);
 float pigment=atmosphereFbm(fibers);
 float fibersFine=atmosphereFbm(fibers*2.1+q*2.7);
 float paper=atmosphereFbm(p*.45+vec2(6.1,-4.3));
 float sheet=mainSheet*.9+distantSheet*.38;
 float erosion=smoothstep(.24,.62,pigment+sheet*.13);
 float mass=sheet*(.25+.86*erosion)*smoothstep(.19,.44,paper+pigment*.2);
 mass+=(fibersFine-.43)*smoothstep(.12,.65,sheet)*(.22+uChaotic*.20);
 return clamp(mass*(.76+uDensity*.42)+uBass*.016*mainSheet,0.,.94);
}
float nebulaAtmosphere(vec2 p,float time){
 float t=time*.8;
 p=p*.64-vec2(.3,-.15);p=rot(t*.045)*p;
 float radius=length(p),angle=atan(p.y,p.x);
 vec2 flow=atmosphereFlow(p*1.1+vec2(t*.045,mod(uSeed,79.)*.047));
 float spiral=angle-radius*1.35+flow.x*(1.2+uChaotic*.9);
 float arms=pow(.5+.5*cos(spiral*2.),2.4);
 vec2 smoke=p+flow*(1.5+uChaotic)+vec2(t*.035,-t*.025);
 float filaments=atmosphereFbm(smoke*3.7+flow*3.8);
 float gas=atmosphereFbm(smoke*1.6)+(filaments-.45)*.32;
 float core=exp(-radius*radius*3.8)*(.56+gas*.48);
 // Polar angle is undefined at the centre: dissolve arms into a continuous core there.
 float sweep=arms*exp(-radius*.35)*smoothstep(.12,.62,gas+.15)*smoothstep(.16,.72,radius);
 float halo=exp(-radius*radius*.65)*gas*.19;
 float mass=(sweep*.90+core*.9+halo)*(.85+uEnergy*.25);
 mass+=(filaments-.45)*smoothstep(.08,.5,mass)*.13;
 return clamp(mass+uBass*.025*core,0.,.97);
}
// Six extra noise samples for the near/far veils, rather than rendering the full field three times.
float gasVeil(vec2 p){
 float broad=atmosphereNoise(p*.71);
 float curl=atmosphereNoise(p*1.63+vec2(5.4,9.1));
 float detail=atmosphereNoise(p*3.67+vec2(curl,broad)*.55);
 return broad*.57+curl*.29+detail*.14;
}
float starLayer(vec2 p,float grid,float threshold,float salt){
 vec2 cell=floor(p*grid),local=fract(p*grid);
 float identity=hash(cell+salt);
 vec2 center=.22+.56*hash2(cell+salt+19.);
 float pixel=grid/uResolution.y;
 float radius=mix(.65,1.2,hash(cell+salt+41.))*pixel*max(1.,uResolution.y/1080.);
 float spark=1.-smoothstep(max(0.,radius-pixel*.65),radius+pixel*.65,length(local-center));
 return step(threshold,identity)*spark*mix(.22,.65,hash(cell+salt+57.));
}
float gasStars(vec2 sky){
 // The sky is separate from the material coordinates: clouds can cover it without stretching it.
 return starLayer(sky,52.,.986,71.)+starLayer(sky+vec2(3.7,8.2),83.,.997,127.)*.6;
}
float atmosphereMaterial(vec2 screen,float t,vec2 sky){
 vec2 p=screen-uGasLayers[0].xy+uGasLayers[0].zw;
 float field=0.;
 if(uAtmosphere.x>.0001)field+=cloudAtmosphere(p,t)*uAtmosphere.x;
 if(uAtmosphere.y>.0001)field+=inkAtmosphere(p,t)*uAtmosphere.y;
 if(uAtmosphere.z>.0001)field+=nebulaAtmosphere(p,t)*uAtmosphere.z;
 if(uAtmosphere.w>.0001)field+=classicMaterial(p,t)*uAtmosphere.w;
 float farDensity=gasVeil((screen-uGasLayers[1].xy+uGasLayers[1].zw)*.67+vec2(13.8,7.2));
 float nearDensity=gasVeil((screen-uGasLayers[2].xy+uGasLayers[2].zw)*1.13+vec2(3.7,19.1));
 float farAlpha=smoothstep(.49,.79,farDensity)*.26;
 float nearAlpha=smoothstep(.43,.77,nearDensity)*.38*smoothstep(.012,.22,field+farAlpha*.2);
 float bodyAlpha=clamp(field,0.,.97);
 vec3 alpha=vec3(nearAlpha,bodyAlpha,farAlpha);
 vec3 light=vec3(.32+nearDensity*.55,.70+bodyAlpha*.30,.25+farDensity*.32);
 float stars=gasStars(sky)*uAtmosphere.z;
 return clamp(compositeGas(alpha,light,stars)*1.06,0.,.97);
}
`;
