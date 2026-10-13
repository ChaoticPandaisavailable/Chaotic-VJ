/** Original monochrome studies. Colour is applied once, after scene mixing. */
export const secondaryStudies=/* glsl */`
uniform float uVortexForm;
float thinLine(float distance,float width){float aa=max(fwidth(distance),.0005);return 1.-smoothstep(width,width+aa*1.5,abs(distance));}
float vortexDustLight(float dust,float cloud){
 // Only bright, spatially sparse dust grains answer the treble envelope.
 return smoothstep(.43,.76,dust)*clamp(uSceneMusic.y*5.,0.,1.)*cloud*.25;
}
float originalVortex(vec2 p,vec2 q,float t,float detail){
 // The original spiral, fog, open eye and dust are retained. Integrated music
 // only transports the material tangentially, so a released kick cannot recoil.
 float travel=uSceneDrift.x*.14+uSceneImpulseTravel*.40;
 p=rot(travel*exp(-dot(p,p)*.28))*p;
 // Original 2026-10-11 pre-edit field, unchanged when music travel is zero.
 vec2 v=p+q*.18;float r=length(v),a=atan(v.y,v.x);
 vec2 whirl=rot(r*1.6-t*.13)*v;
 float fog=f3(whirl*1.7+q*.7),arms=.5+.5*sin(a*3.+r*5.5-t*.35+fog*2.);
 float halo=exp(-pow((r-.95)/.65,2.))*smoothstep(.17,.4,r);
 float streak=pow(arms,7.)*(.3+fog*.7);
 float dust=noise2(whirl*95.)*noise2(whirl*63.+4.);
 return .012+halo*(pow(fog,2.)*.7+streak*.53+dust*.16*detail)+vortexDustLight(dust,halo*(.3+streak*.7));
}
float stellarWind(vec2 p,float t,float detail){
 // A broad diagonal stream carries dusty sheets through the view. Its banks
 // open and lean slowly, while measured bass transports material along them.
 vec2 v=rot(-.32+sin(t*.11)*.13)*p;
 float travel=t*.14+uSceneDrift.x*.60+uSceneImpulseTravel*.95;
 float bend=sin(v.x*.78-t*.065)*.32+sin(v.x*1.4+t*.08)*.10;
 vec2 current=vec2(v.x-travel,v.y-bend);
 float fog=f3(current*vec2(.85,2.4)+vec2(5.7,1.3));
 float across=current.y+(fog-.5)*(.38+uChaos*.24);
 float width=.30+.09*sin(v.x*.75+t*.12);
 float bank=exp(-pow(across/width,2.));
 float farBank=exp(-pow((across-.46-.09*sin(v.x+t*.1))/.24,2.));
 float envelope=exp(-v.x*v.x*.065)*(bank+farBank*.46);
 float weave=f3(vec2(current.x*1.7,across*5.1)+vec2(8.2,3.7));
 float strands=pow(.5+.5*sin(across*(17.+uMorph*8.)+weave*5.+current.x*.7),7.);
 float dust=noise2(vec2(current.x*94.,across*89.))*noise2(vec2(current.x*57.,across*121.)+4.);
 // A real kick launches a wide pressure front along the wind, never a zoom.
 float kickPosition=-2.+uSceneDrift.z*2.1;
 float pressure=exp(-pow((v.x-kickPosition)/.62,2.))*uSceneDrift.w*exp(-uSceneDrift.z*.72);
 float body=pow(fog,1.7)*.52+strands*(.17+weave*.29)+dust*.15*detail;
 return .012+envelope*(body+pressure*(.055+strands*.065))+vortexDustLight(dust,envelope*(.3+strands*.7));
}
float binaryStarWind(vec2 p,float t,float detail){
 // Two unequal stellar currents exchange dusty spiral wakes. Density fills
 // broad arms instead of tracing the outline of a pair of neon ellipses.
 float mass=0.,travel=uSceneDrift.x*.21+uSceneImpulseTravel*.48;
 for(int i=0;i<2;i++){
   float side=float(i)*2.-1.;
   vec2 center=vec2(side*(.59+.11*sin(t*.17)),side*.15*cos(t*.13));
   vec2 v=rot(side*.32+sin(t*.12+float(i))*.18)*(p-center);
   v/=vec2(i==0?1.02:.86,.78+.08*sin(t*.15+float(i)*2.));
   float r=length(v),a=atan(v.y,v.x);
   vec2 whirl=rot(side*(r*1.9-t*.095-travel))*v;
   float fog=f3(whirl*2.1+vec2(float(i)*7.2,t*.024));
   float arms=.5+.5*sin(side*a*2.+r*6.1-t*.22-travel*1.7+fog*2.7);
   float halo=exp(-pow((r-.61)/.48,2.))*smoothstep(.09,.24,r);
   float opening=.32+.68*smoothstep(-.35,.65,cos(a-side*.55+sin(t*.12)*.3));
   float streak=pow(arms,5.)*(.26+fog*.58);
   float dust=noise2(whirl*103.)*noise2(whirl*71.+4.);
   float wave=exp(-pow((r-(.15+uSceneDrift.z*1.35))/.29,2.))*uSceneDrift.w*exp(-uSceneDrift.z*.85);
   float body=pow(fog,2.)*.48+streak*.48+dust*.15*detail+wave*streak*.11;
   mass+=halo*opening*(body+vortexDustLight(dust,.25+streak*.75))*(i==0?1.:.76);
 }
 return .012+mass;
}
float studyMaterial(vec2 p,float style,float t){
 float detail=mix(.32,1.,uComplexity);
 vec2 q=vec2(f3(p*.65+vec2(t*.075,0.)),f3(p*.65+vec2(5.2,-t*.06)))-.5;
 vec2 warped=p+q*(.9+uChaos*1.5);
 if(style<.5){
   // Broad silk folds with a thin grazing highlight and deep troughs.
   float flow=f3(warped*.85+q*.8);
   float phase=flow*(17.+uMorph*12.)+p.y*.65-t*.16;
   float fold=.5+.5*sin(phase),crest=pow(fold,7.);
   float contour=thinLine(sin(phase+.17),.018)*detail;
   float pool=smoothstep(.2,.67,flow);
   return .015+pool*.22+pow(fold,2.4)*pool*.47+crest*.22+contour*.11;
 }
 if(style<1.5){
   // Translucent membranes surround quiet, dark cavities.
   vec3 c=cells((p+q*.5)*mix(1.45,2.45,uComplexity),t*.4);
   float edge=c.y-c.x,membrane=exp(-edge*38.);
   float shell=pow(smoothstep(.09,.65,c.x),2.);
   float rim=thinLine(edge-.045,.012)*(.35+c.z*.4);
   float nucleus=exp(-c.x*c.x*180.)*step(.72,c.z)*detail;
   return .02+shell*.27+membrane*.3+rim*.25+nucleus*.35;
 }
 if(style<2.5){
   // Sparse prismatic planes: straight boundaries, fine seams, restrained facets.
   vec2 v=rot(.28)*p*mix(1.2,2.5,uComplexity);
   vec3 c=cells(v,t*.17);float edge=c.y-c.x;
   float lit=step(.47,c.z),gradient=clamp(.4+dot(v,vec2(.1,.14)),.05,.9);
   float facet=fract(c.z*7.1);
   float seam=thinLine(edge-.013,.007);
   float etching=thinLine(fract((v.x+v.y*.8)*28.)-.5,.03)*step(.83,c.z)*detail;
   return .018+lit*(.1+c.z*.23+gradient*.12+facet*.27)+seam*.28+etching*.12;
 }
 if(style<3.5){
   // Parallel sheets curve together; spacing remains legible while the field bends.
   vec2 v=rot(-.38)*p;
   float sweep=v.y+sin(v.x*.85+t*.2)*.7+sin(v.x*1.6-t*.16)*.23+q.x*uChaos*.65;
   float phase=sweep*mix(5.,12.,uComplexity)+sin(v.x*.5+t*.12)*uMorph*2.;
   float wave=.5+.5*sin(phase),sheet=pow(wave,6.);
   float strand=thinLine(sin(phase+.28),.017)*detail;
   float shade=.5+.5*cos(v.x*.6+phase*.04);
   return .015+sheet*(.35+shade*.45)+strand*.15;
 }
 if(style<4.5){
   // Form 0 is the user's original vortex. Extra forms are opt-in and crossfade
   // in the same field; steady selections evaluate only their own material.
   float form=clamp(uVortexForm,0.,2.);
   if(form<.0001)return originalVortex(p,q,t,detail);
   vec2 space=p;
   if(uGesture>=2.5&&uGesture<3.5)space=rot(-t*.08)*space;
   if(form>1.9999)return binaryStarWind(space,t,detail);
   float wind=stellarWind(space,t,detail);
   if(form<1.)return mix(originalVortex(p,q,t,detail),wind,smoothstep(0.,1.,form));
   return mix(wind,binaryStarWind(space,t,detail),smoothstep(1.,2.,form));
 }
 // Tectonic strata: broad broken planes, layered cuts and fine sediment lines.
 vec2 v=rot(-.2)*p;
 float bend=sin(v.x*.63+t*.11)*.42+q.x*.55;
 float height=(v.y+bend)*mix(2.,4.5,uComplexity);
 float layer=floor(height),local=fract(height),id=hash(vec2(layer,3.));
 float fault=smoothstep(-.03,.03,v.x+sin(layer*2.4)*.9+sin(t*.15)*.3);
 float plane=(.13+id*.46)*smoothstep(.02,.17,local)*(1.-local*.5);
 float cut=thinLine(local-.05,.009);
 float sediment=thinLine(fract(local*6.+q.y*.4)-.5,.025)*detail;
 return .018+plane*mix(.4,1.,fault)+cut*.34+sediment*.045*step(.62,id);
}
`;
