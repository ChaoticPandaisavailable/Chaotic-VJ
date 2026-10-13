/** Original analytic light fields. Audio travels inside the material, never scales the frame. */
export const lightFields=/* glsl */`
uniform vec4 uLightWaves[6];
float auroraField(vec2 p,vec2 sky,float t){
 float light=0.;
 float travel=uSceneDrift.x*.13+uSceneImpulseTravel*.08;
 float wave=0.;
 for(int j=0;j<6;j++){
  vec4 pulse=uLightWaves[j];
  if(pulse.x<3.)wave+=exp(-pow((p.x+3.2-pulse.x*3.5)/.7,2.))*pulse.y*exp(-pulse.x*.65)*smoothstep(0.,.07,pulse.x);
 }
 wave=min(wave,1.4);
 for(int i=0;i<3;i++){
  float layer=float(i),x=p.x*(.86+layer*.11)+layer*2.3;
  float phase=t*(.065+layer*.021)+travel*(.7+layer*.25);
  float bend=sin(x*1.12+phase)*.33+sin(x*2.46-phase*.7)*(.1+uChaos*.12);
  float h=p.y-(-.72+layer*.40+bend)-wave*.11;
  float height=.65+uDensity*.65+sin(x*.62+phase)*.16;
  float veil=smoothstep(-.1,.07,h)*(1.-smoothstep(.12,height,h));
  float foot=exp(-pow(h/.105,2.));
  // Fibres bend with altitude and wind, so the curtain never becomes a row of bars.
  float wind=x+sin(h*2.8+x*.8-phase)*h*(.18+uChaos*.22)+h*h*.12*sin(x*1.6+phase);
  float filamentPhase=wind*(175.+layer*63.)+sin(wind*23.7+phase)*2.8+sin(wind*41.-phase)*1.3;
  float aa=1.-smoothstep(.7,2.8,fwidth(filamentPhase));
  float filaments=mix(.45,pow(.5+.5*sin(filamentPhase),2.),aa);
  float fold=.35+.65*pow(.5+.5*sin(x*3.4+sin(x*1.7+phase)*2.-phase),2.);
  float mist=.55+.45*f3(vec2(wind*3.7,h*2.2-phase*.5));
  float glints=pow(.5+.5*sin(x*17.3-phase*2.7+layer*13.),12.)*uSceneMusic.y;
  float fabric=veil*(.44+filaments*.40)*fold*mist+foot*(.11+filaments*.09);
  light+=fabric*(.82+layer*.14)*(1.+wave*.8)+glints*veil*fold*.32;
 }
 float field=(1.-exp(-light*(1.15+uEnergy*.55)))*.94;
 float stars=gasStars(sky)*(1.-smoothstep(.05,.6,field))*.75;
 return max(field,stars);
}
float tideHeight(vec2 p,float t){
 vec2 q=p+vec2(uSceneDrift.x*.09+uSceneImpulseTravel*.03,-uSceneDrift.x*.045);
 float height=sin(q.x*2.15+sin(q.y*1.36+t*.07)*.7+t*.12)*.24;
 height+=sin(dot(q,vec2(2.4,3.1))-t*.16)*(.11+uChaos*.06);
 height+=sin(dot(q,vec2(-4.3,2.2))+t*.13)*.057;
 height+=sin(q.y*6.4+q.x*1.7-t*.19)*.028;
 for(int j=0;j<6;j++){
  vec4 pulse=uLightWaves[j];float age=pulse.x;
  if(age<3.){
   float radius=length(p-pulse.zw),front=radius-age*1.6;
   float envelope=exp(-pow(front/.36,2.))*exp(-age*.85)*smoothstep(0.,.07,age);
   height+=sin(front*13.)*envelope*pulse.y*.09;
  }
 }
 return height;
}
float tidalField(vec2 p,float t){
 p=rot(-.28)*p*1.15;
 float height=tideHeight(p,t),stepSize=.018;
 vec2 gradient=vec2(tideHeight(p+vec2(stepSize,0.),t)-height,tideHeight(p+vec2(0.,stepSize),t)-height)/stepSize;
 vec3 normal=normalize(vec3(-gradient,1.));
 float spec=pow(max(0.,dot(normal,normalize(vec3(-.36,.48,1.)))),18.);
 vec2 refracted=p+gradient*(.56+uMorph*.5);
 float phase=dot(refracted,vec2(3.2,1.9))+sin(refracted.y*3.1-t*.07)+t*.08;
 float aa=max(.028,fwidth(phase)*1.1);
 float caustic=1.-smoothstep(.055,.15+aa,abs(sin(phase)));
 float crossing=.5+.5*sin(dot(refracted,vec2(-2.5,3.6))-t*.11);
 float bright=pow(crossing,3.)*caustic;
 float pool=.5+.5*sin(height*5.+refracted.x*.7-refracted.y*.4);
 float glint=pow(max(0.,dot(normal,normalize(vec3(.4,-.3,1.)))),55.);
 float field=.025+pool*(.10+uDensity*.12)+spec*.22+caustic*.20+bright*.20;
 field+=glint*uSceneMusic.y*.28;
 return clamp(field*(.85+uEnergy*.35),0.,.94);
}
`;
