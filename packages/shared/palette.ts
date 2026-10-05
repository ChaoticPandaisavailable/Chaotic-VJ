/** Oklab matrices: Björn Ottosson, public-domain implementation.
 * https://bottosson.github.io/posts/oklab/ */
export type Triple = [number,number,number];
const clamp=(x:number)=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
const linear=(x:number)=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
const encoded=(x:number)=>x<=.0031308?12.92*x:1.055*Math.max(0,x)**(1/2.4)-.055;
export function hexToLab(hex:string):Triple {
  const [r,g,b]=[1,3,5].map(i=>linear(parseInt(hex.slice(i,i+2),16)/255));
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b);
  const m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b);
  const s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
}
function labToLinear([L,a,b]:Triple):Triple {
  const l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.291485548*b)**3;
  return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s];
}
export function labToHex(lab:Triple):string {
  // Reduce chroma when needed, retaining perceived lightness and hue.
  let rgb=labToLinear(lab);
  if(rgb.some(x=>x<0||x>1)){
    let lo=0,hi=1;
    for(let i=0;i<14;i++){const c=(lo+hi)/2;const candidate=labToLinear([lab[0],lab[1]*c,lab[2]*c]);if(candidate.every(x=>x>=0&&x<=1))lo=c;else hi=c;}
    rgb=labToLinear([lab[0],lab[1]*lo,lab[2]*lo]);
  }
  return '#'+rgb.map(x=>Math.round(clamp(encoded(x))*255).toString(16).padStart(2,'0')).join('');
}
const tau=Math.PI*2;
export const lchToLab=(l:number,c:number,h:number):Triple=>[l,c*Math.cos(h*Math.PI/180),c*Math.sin(h*Math.PI/180)];
/** Chroma-preserving interpolation. Neutral endpoints inherit the other endpoint's hue. */
export function mixLabHue(a:Triple,b:Triple,t:number):Triple {
  t=clamp(t);const ca=Math.hypot(a[1],a[2]),cb=Math.hypot(b[1],b[2]);
  let ha=Math.atan2(a[2],a[1]),hb=Math.atan2(b[2],b[1]);
  if(ca<.004)ha=hb;if(cb<.004)hb=ha;
  const h=ha+(((hb-ha+Math.PI)%tau+tau)%tau-Math.PI)*t,c=ca+(cb-ca)*t;
  return [a[0]+(b[0]-a[0])*t,c*Math.cos(h),c*Math.sin(h)];
}
export function mixLab(a:Triple,b:Triple,t:number):Triple {
  t=clamp(t);return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
}
const smooth=(t:number)=>t*t*(3-2*t);
// Authored hue-dependent pairings. A fixed complement rotation gives poor results
// for ochres/greens; these pairings separate a colourful body from a lighter companion.
const companions=[
  [20,78],[42,184],[65,216],[88,252],[115,68],[145,84],
  [170,42],[195,72],[218,28],[242,76],[263,80],[282,48],
  [303,86],[326,162],[347,206],[380,78],
] as const;
function companionHue(hue:number){
  const h=((hue-20)%360+360)%360+20;
  let i=0;while(i<companions.length-2&&h>companions[i+1][0])i++;
  const [x,a]=companions[i],[xx,b]=companions[i+1],t=smooth((h-x)/(xx-x));
  return a+(((b-a+540)%360)-180)*t;
}
// These positions allocate most of the scalar field to the principal hue.
// This is not a promise of screen-area percentages: each scene has its own histogram.
export const moodStops=[0,.14,.43,.76,1] as const;
/** X traverses the full hue circle. Y introduces a quieter companion into the
 * light tones, without rotating the gradient through unrelated rainbow colours.
 * Lift the coloured body, rather than just the white peak. The black endpoint
 * preserves negative space; ordered lightness also carries shape without hue cues. */
export function moodLabs(warmth:number,richness:number,look:ColorLook='free'):Triple[]{
  if(look!=='free')return cinematicLabs(warmth,richness,look);
  const h=25+clamp(warmth)*360,y=smooth(clamp(richness)),accent=companionHue(h);
  const ochre=Math.max(0,Math.cos((h-90)*Math.PI/180))**6;
  const light=mixLab(lchToLab(.865,.056,h),lchToLab(.865,.080,accent),y);
  return [
    lchToLab(.115,.005,h),
    lchToLab(.43,.055,h),
    lchToLab(.705+ochre*.025,.128+ochre*.010,h),
    light,
    [1,0,0],
  ];
}
/** Spatial interpolation crosses a light neutral bridge, not every hue in between.
 * Keep this in sync with the tiny GPU lookup pass; also used for the XY map/proof. */
export function sampleMood(labs:Triple[],value:number):Triple {
  const t=clamp(value);let i=0;while(i<3&&t>moodStops[i+1])i++;
  return mixLab(labs[i],labs[i+1],(t-moodStops[i])/(moodStops[i+1]-moodStops[i]));
}
export function moodPalette(warmth:number,richness:number,look:ColorLook='free'){
  const colors=moodLabs(warmth,richness,look).map(labToHex);
  return {colors,background:colors[0]};
}
export const moodPins=[
  {name:'朱砂 · 素白',x:.025,y:.12},{name:'赤铜 · 冷瓷',x:.05,y:.82},
  {name:'琥珀 · 冰蓝',x:.11,y:.85},{name:'金叶 · 青瓷',x:.18,y:.72},
  {name:'橄榄 · 亚麻',x:.25,y:.62},{name:'苔绿 · 象牙',x:.33,y:.74},
  {name:'翡翠 · 杏白',x:.40,y:.80},{name:'孔雀 · 香槟',x:.47,y:.80},
  {name:'冰川 · 珍珠',x:.535,y:.58},{name:'蓝夜 · 素白',x:.64,y:.08},
  {name:'晴蓝 · 金黄',x:.61,y:.84},{name:'靛蓝 · 赤铜',x:.715,y:.78},
  {name:'紫晶 · 亚麻',x:.77,y:.78},{name:'梅紫 · 青玉',x:.84,y:.82},
  {name:'胭脂 · 冷瓷',x:.90,y:.80},{name:'石榴 · 香槟',x:.98,y:.64},
];

export const colorLookIds=['free','dusk','meadow','gold','storm','prism','cedar','magma'] as const;
export type ColorLook=typeof colorLookIds[number];
export const cinematicLooks=[
  {id:'dusk',name:'暮色与余晖'}, {id:'meadow',name:'生机草甸'},
  {id:'gold',name:'沉金极夜'}, {id:'storm',name:'霆霓风暴'},
  {id:'prism',name:'棱镜全谱'}, {id:'cedar',name:'雪域苍松'},
  {id:'magma',name:'地心熔流'},
] as const;
// Authored L/C/h roles. X moves within a family; Y opens the lighter companion.
const looks={
  // Each setting has its own exposure structure, including luminous negative space.
  dusk:  {roles:[[.965,.012,65],[.85,.053,46],[.68,.108,12],[.46,.092,329]],shift:26,companion:304},
  meadow:{roles:[[.23,.030,176],[.46,.079,163],[.72,.119,140],[.90,.069,101]],shift:23,companion:60},
  gold:  {roles:[[.17,.012,63],[.41,.072,60],[.72,.133,82],[.90,.080,93]],shift:15,companion:76},
  storm: {roles:[[.20,.038,267],[.43,.105,263],[.70,.115,231],[.89,.046,207]],shift:20,companion:194},
  cedar: {roles:[[.985,.004,170],[.88,.027,171],[.65,.080,163],[.41,.056,172]],shift:15,companion:193},
  magma: {roles:[[.16,.010,289],[.40,.105,20],[.67,.185,27],[.88,.106,76]],shift:16,companion:90},
} satisfies Record<Exclude<ColorLook,'free'|'prism'>,{roles:number[][];shift:number;companion:number}>;
/** Continuous spectrum only for the explicit prism look; never injected into a two-colour ramp. */
export function prismLab(value:number,x:number,y:number):Triple{
  const t=clamp(value),light=sampleMood([[.975,0,0],[.87,0,0],[.70,0,0],[.49,0,0],[.27,0,0]],t)[0];
  const s=smooth(clamp((t-.035)/.925));
  const chroma=Math.pow(Math.max(0,Math.sin(Math.PI*t)),.85)*(.075+.045*clamp(y));
  // Yellow stays in luminous areas; deeper colours move through blue and violet, avoiding muddy ochres.
  return lchToLab(light,chroma,85+255*s+(clamp(x)-.5)*44);
}
function cinematicLabs(x:number,y:number,look:Exclude<ColorLook,'free'>):Triple[]{
  x=clamp(x);y=clamp(y);
  if(look==='prism')return moodStops.map(t=>prismLab(t,x,y));
  const design=looks[look],shift=(x-.5)*2*design.shift,amount=.82+.18*smooth(y);
  const labs=design.roles.map(([l,c,h],i)=>lchToLab(l,c*(i===0?1:amount),h+shift*(i===0?.2:1)));
  // A small flower/secondary tint stays in the light role; it cannot muddy the main body.
  const companion=lchToLab(design.roles[3][0],design.roles[3][1]*.85,design.companion+shift*.4);
  labs[3]=mixLab(labs[3],companion,smooth(y)*(look==='meadow'?.48:.30));
  const end:Triple=look==='cedar'?lchToLab(.235,.035,174+shift*.5):look==='dusk'?lchToLab(.25,.036,310+shift*.5):[1,0,0];
  return [...labs,end];
}
