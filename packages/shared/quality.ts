export type QualityMode='performance'|'fine'|'ultra';
export type OutputResolution='auto'|'1080p'|'1440p'|'2160p';
export const outputResolutions={
  '1080p':{width:1920,height:1080},'1440p':{width:2560,height:1440},'2160p':{width:3840,height:2160},
} as const;
export function selectedOutputSize(selection:OutputResolution,width:number,height:number,dpr:number,mode:QualityMode,fullscreenUhd:boolean,maxTextureSize=4096){
  const desired=selection==='auto'?(fullscreenUhd?uhdSize(width,height,maxTextureSize):outputSize(width,height,dpr,mode)):outputResolutions[selection];
  const fit=Math.min(1,maxTextureSize/desired.width,maxTextureSize/desired.height);
  return {width:Math.max(2,Math.round(desired.width*fit)),height:Math.max(2,Math.round(desired.height*fit))};
}
export const qualityProfiles={
  performance:{dpr:1,fieldFloor:.5,sourceWidth:960,sourceHeight:540,volumeSteps:20},
  fine:{dpr:1.5,fieldFloor:.75,sourceWidth:1920,sourceHeight:1080,volumeSteps:28},
  ultra:{dpr:2,fieldFloor:1,sourceWidth:3840,sourceHeight:2160,volumeSteps:36},
} as const;
export function outputSize(width:number,height:number,dpr:number,mode:QualityMode){
  const scale=Math.min(Math.max(1,dpr),qualityProfiles[mode].dpr,3840/Math.max(1,width),2160/Math.max(1,height));
  return {width:Math.max(2,Math.round(width*scale)),height:Math.max(2,Math.round(height*scale))};
}
export function sourceSize(width:number,height:number,mode:QualityMode){
  const profile=qualityProfiles[mode],scale=Math.min(1,profile.sourceWidth/width,profile.sourceHeight/height);
  return {width:Math.max(2,Math.round(width*scale)),height:Math.max(2,Math.round(height*scale))};
}

/** Supersample small fullscreen displays; preserve aspect and respect GPU texture limits. */
export function uhdSize(width:number,height:number,maxTextureSize=4096){
  const w=Math.max(2,width),h=Math.max(2,height);
  const scale=Math.min(3840/w,2160/h,maxTextureSize/w,maxTextureSize/h);
  return {width:Math.max(2,Math.round(w*scale)),height:Math.max(2,Math.round(h*scale))};
}
