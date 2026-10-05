/** Original monochrome studies. Colour is applied once, after scene mixing. */
export const secondaryStudies=/* glsl */`
float thinLine(float distance,float width){float aa=max(fwidth(distance),.0005);return 1.-smoothstep(width,width+aa*1.5,abs(distance));}
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
   // A nebula winds around an open eye, with fine dust along its spiral arms.
   vec2 v=p+q*.18;float r=length(v),a=atan(v.y,v.x);
   vec2 whirl=rot(r*1.6-t*.13)*v;
   float fog=f3(whirl*1.7+q*.7),arms=.5+.5*sin(a*3.+r*5.5-t*.35+fog*2.);
   float halo=exp(-pow((r-.95)/.65,2.))*smoothstep(.17,.4,r);
   float streak=pow(arms,7.)*(.3+fog*.7);
   float dust=noise2(whirl*95.)*noise2(whirl*63.+4.);
   return .012+halo*(pow(fog,2.)*.7+streak*.53+dust*.16*detail);
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
