import { moodStops } from '../shared/palette.ts';
/** Oklab conversion is done for 256 GPU texels, not repeated at every output pixel. */
export const paletteLutFragment=/* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec3 uColors[5];
uniform float uColorCount,uHarmonic;
uniform float uPrism;
uniform vec2 uSpectrum;
vec3 toLinear(vec3 lab){
 vec3 lms=vec3(lab.x+.3963377774*lab.y+.2158037573*lab.z,lab.x-.1055613458*lab.y-.0638541728*lab.z,lab.x-.0894841775*lab.y-1.291485548*lab.z);
 lms=lms*lms*lms;
 return vec3(dot(lms,vec3(4.0767416621,-3.3077115913,.2309699292)),dot(lms,vec3(-1.2684380046,2.6097574011,-.3413193965)),dot(lms,vec3(-.0041960863,-.7034186147,1.707614701)));
}
bool inGamut(vec3 rgb){return all(greaterThanEqual(rgb,vec3(0.)))&&all(lessThanEqual(rgb,vec3(1.)));}
void main(){
 float t=clamp((vUv.x*256.-.5)/255.,0.,.999999);
 float role=t/${moodStops[1]};
 if(t>=${moodStops[1]})role=1.+(t-${moodStops[1]})/${moodStops[2]-moodStops[1]};
 if(t>=${moodStops[2]})role=2.+(t-${moodStops[2]})/${moodStops[3]-moodStops[2]};
 if(t>=${moodStops[3]})role=3.+(t-${moodStops[3]})/${1-moodStops[3]};
 float x=mix(t*(uColorCount-1.),role,uHarmonic);
 vec3 a=uColors[0],b=uColors[1];
 if(x>=1.){a=uColors[1];b=uColors[2];}
 if(x>=2.){a=uColors[2];b=uColors[3];}
 if(x>=3.){a=uColors[3];b=uColors[4];}
 vec3 lab=mix(a,b,fract(x));
 // Match prismLab: ordered lightness and a restrained, continuous spectral arc.
 float spectralHue=radians(85.+255.*smoothstep(.035,.96,t)+(uSpectrum.x-.5)*44.);
 float spectralChroma=pow(max(0.,sin(3.14159265*t)),.85)*(.075+.045*uSpectrum.y);
 vec3 spectrum=vec3(lab.x,spectralChroma*cos(spectralHue),spectralChroma*sin(spectralHue));
 lab=mix(lab,spectrum,uPrism);
 vec3 linear=toLinear(lab);
 if(!inGamut(linear)){
   float low=0.,high=1.;
   for(int i=0;i<10;i++){float mid=(low+high)*.5;if(inGamut(toLinear(vec3(lab.x,lab.yz*mid))))low=mid;else high=mid;}
   linear=toLinear(vec3(lab.x,lab.yz*low));
 }
 linear=max(vec3(0.),linear);
 vec3 encoded=mix(12.92*linear,1.055*pow(linear,vec3(1./2.4))-.055,step(vec3(.0031308),linear));
 gl_FragColor=vec4(clamp(encoded,0.,1.),1.);
}`;
