/** Shared by synthesis and composition: fully hidden pixels skip expensive field evaluation. */
export const revealMaskGLSL=/* glsl */`
float revealMask(vec2 uv,vec2 size,float t,float strength){
 if(t<=0.)return 0.;if(t>=1.)return 1.;
 vec2 p=uv*vec2(size.x/size.y,1.);
 float front=.18+uv.x*.43+uv.y*.18+.085*sin(p.y*4.4+p.x*1.6)+.045*sin(p.x*4.1-p.y*3.);
 float width=mix(.30,.075,strength);
 return smoothstep(front-width,front+width,t*1.4-.2);
}
`;
/** A travelling, soft-edged reveal. Detail stays at its native position, never smeared by optical flow. */
export const morphFragment=/* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uFrom,uTo;
uniform vec2 uSize;
uniform float uMix,uPhase,uStrength;
${revealMaskGLSL}
void main(){
 float t=clamp(uMix,0.,1.);
 if(t<=0.){gl_FragColor=texture2D(uFrom,vUv);return;}
 if(t>=1.){gl_FragColor=texture2D(uTo,vUv);return;}
 float a=texture2D(uFrom,vUv).r,b=texture2D(uTo,vUv).r;
 // Only a narrow moving region mixes the scenes; most pixels belong to one live scene.
 float reveal=revealMask(vUv,uSize,t,uStrength);
 gl_FragColor=vec4(vec3(mix(a,b,reveal)),1.);
}
`;
