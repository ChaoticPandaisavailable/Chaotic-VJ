/** Artistic volume / 4D rotated field studies, not a physical string-theory simulation. */
export const volumeField = /* glsl */`
float noise3(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 vec2 uv=i.xy+vec2(37.,17.)*i.z+f.xy+mod(uSeed,97.);
 vec2 slices=texture2D(uNoise,(uv+.5)/256.).rg;
 return mix(slices.x,slices.y,f.z);
}
float cloud3(vec3 p){
 float n=noise3(p)*.57;p=p*2.03+vec3(7.1,1.7,9.2);
 n+=noise3(p)*.28;return n+noise3(p*2.02+4.7)*.15;
}
float volumeMaterial(vec2 screen,float style,float time){
 float t=time*.18;
 float bassTravel=uSceneDrift.x;
 float pressure=clamp(uSceneDrift.y,0.,1.5);
 float treble=clamp(uSceneMusic.y,0.,1.5);
 float kickAge=max(0.,uSceneDrift.z);
 float kickStrength=clamp(uSceneDrift.w,0.,1.5);
 vec3 ro=vec3(sin(t*.17)*.35,.1,-3.8);
 vec3 rd=normalize(vec3(screen*.58,1.9));
 rd.xz=rot(sin(t*.12)*.15)*rd.xz;
 float transmittance=1.,light=0.;
 // True 3D samples along the camera ray; fixed cost and early exit when opaque.
 for(int i=0;i<36;i++){
   if(float(i)>=uVolumeSteps)break;
   float distance=1.1+(float(i)+.5)*4.9/uVolumeSteps;
   vec3 local=ro+rd*distance;
   vec3 p=local;
   vec3 stormTravel=vec3(0.);
   if(style<7.5){
     // Transport internal weather at depth-dependent rates. The cumulative
     // kick travel keeps its position as pressure releases, without recoil.
     float depthWeight=.7+.3*sin(local.z*.9+.7);
     stormTravel=vec3(.105,.035,-.085)*bassTravel;
     stormTravel.xy+=vec2(.34,-.13)*uSceneImpulseTravel*depthWeight;
     stormTravel.z+=sin(local.x*.72+local.z*.46)*uSceneImpulseTravel*.18;
   }else{
     // One measured attack launches a wave in both directions along the
     // ribbons. Its moving window dies away; time alone cannot launch it.
     float along=abs(local.x+local.z*.38);
     float front=kickAge*2.2;
     float waveDistance=(along-front)/.65;
     float wave=exp(-waveDistance*waveDistance)*sin(along*6.2-kickAge*11.);
     wave*=kickStrength*exp(-kickAge/.85);
     p.y+=wave*.22;
     p.x+=wave*.075*sin(local.y*1.3+local.z*.6);
     p+=vec3(.024,-.018,.055)*bassTravel;
   }
   float radius=length(p.xy);
   p.xy=rot(t*.32+radius*(.45+uChaos*.3)+p.z*.18)*p.xy;
   p.z+=t*.24;
   vec3 drift=vec3(sin(p.y*.9+t),cos(p.z*.7-t*.63),sin(p.x*.8+t*.37));
   vec3 q=p+drift*(.28+uChaos*.4);
   float density=0.,shade=0.;
   if(style<7.5){
     q+=stormTravel;
     float clouds=cloud3(q*1.18+vec3(t*.16,0.,-t*.12));
     float whorls=noise3(q*.62+4.2);
     density=smoothstep(.56-uDensity*.07,.72,clouds+whorls*.12);
     // The viewing envelope belongs to the fixed volume, never to the
     // travelling noise coordinates: long performances cannot drift empty.
     density*=exp(-dot(local.xy,local.xy)*.045);
     float layer=local.z-.55*sin(local.x*1.2+t*.2)-.45*cos(local.y*1.3-t*.15);
     density*=exp(-layer*layer*.45);
     float illumination=noise3(q*1.18+vec3(.6,.9,-.7));
     shade=.15+.65*smoothstep(.18,.84,illumination);
     // Light leaks through dense banks on the long kick release; treble
     // catches only the thin bright edges, never the entire sky at once.
     shade+=pressure*(.07+.12*illumination)*smoothstep(.06,.42,density);
     float silver=smoothstep(.57,.86,illumination)*smoothstep(.57,.74,clouds);
     shade+=treble*silver*.22;
   }else{
     // Rotate a continuous four-dimensional field through x/w and y/w planes.
     vec4 v=vec4(q,cos(t*.31)*.9);
     v.xw=rot(t*.37+bassTravel*.075)*v.xw;
     v.yw=rot(t*.23+.7-bassTravel*.045)*v.yw;
     v.zw=rot(t*.17)*v.zw;
     v*=2.1+uMorph*.8;
     float manifold=sin(v.x)*cos(v.y)+sin(v.y)*cos(v.z)+sin(v.z)*cos(v.w);
     float filaments=exp(-abs(manifold)*mix(5.5,11.,uFragmentation));
     float fine=.5+.5*sin(v.x*.7+v.w+v.z*.3);
     density=filaments*(.5+fine*.55)*exp(-dot(local,local)*.055);
     // A single folded depth band reads as sweeping sheets instead of opaque stacks.
     float layer=local.z+.42*sin(local.x*.75+t*.12)-.48*cos(local.y*.8-t*.1);
     density*=exp(-layer*layer*.8);
     density+=smoothstep(.6,.85,cloud3(q*.8))*.025;
     shade=.42+.58*noise3(q*.7+vec3(0.,1.,-1.));
     // Cymbals pick out particular silk threads instead of changing width
     // or turning the whole folded surface into a flash.
     float threadGlint=filaments*pow(fine,3.);
     shade+=treble*threadGlint*.32;
   }
   float alpha=1.-exp(-density*(.22+uEnergy*.13)*20./uVolumeSteps);
   light+=transmittance*alpha*shade;
   transmittance*=1.-alpha;
   if(transmittance<.035)break;
 }
 if(style<7.5)return clamp(.018+light*1.55+(1.-transmittance)*.04,0.,.97);
 return clamp(light*1.75+(1.-transmittance)*.015,0.,.97);
}
`;
