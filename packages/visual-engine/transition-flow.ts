/** Small, one-shot optical-flow estimate. Encoded UV/second works on byte and float targets. */
export const transitionFlowFragment=/* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uCurrent,uPrevious;
uniform vec2 uStep;
uniform float uDt;
float sampleField(sampler2D field,vec2 p){return texture2D(field,clamp(p,.001,.999)).r;}
void main(){
 float xx=0.,xy=0.,yy=0.,xt=0.,yt=0.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
   vec2 p=vUv+vec2(float(x),float(y))*uStep;
   vec2 g=.5*vec2(sampleField(uCurrent,p+vec2(uStep.x,0.))-sampleField(uCurrent,p-vec2(uStep.x,0.)),sampleField(uCurrent,p+vec2(0.,uStep.y))-sampleField(uCurrent,p-vec2(0.,uStep.y)));
   float delta=sampleField(uCurrent,p)-sampleField(uPrevious,p);
   xx+=g.x*g.x;xy+=g.x*g.y;yy+=g.y*g.y;xt+=g.x*delta;yt+=g.y*delta;
 }
 float regularizer=.00015;xx+=regularizer;yy+=regularizer;
 float determinant=max(xx*yy-xy*xy,.00000001);
 vec2 velocity=vec2(xy*yt-yy*xt,xy*xt-xx*yt)/determinant*uStep/max(uDt,.004);
 velocity*=min(1.,.065/max(length(velocity),.0001));
 gl_FragColor=vec4(.5+velocity/.16,0.,1.);
}`;
