/** Stable IDs append to the original eleven scenes; upstream authors remain visible in credits. */
export const milkdropScenes=[
  {style:11,name:'光速隧道',label:'MD / TUNNEL',note:'纵深隧道 · 扭转穿行',preset:'martin - tunnel race'},
  {style:12,name:'液态银幕',label:'MD / SILVER',note:'金属浮雕 · 反馈折射',preset:'martin - silversmith'},
  {style:13,name:'曼陀罗',label:'MD / MANDALA',note:'对称纹样 · 环形叠映',preset:'shifter - mandala'},
  {style:14,name:'折纸分形',label:'MD / ORIGAMI',note:'镜面折叠 · 递归空间',preset:'Flexi - 100% shader fractal [origami edit]'},
  {style:15,name:'幻象徽章',label:'MD / AMULET',note:'镜像光环 · 反馈生长',preset:'martin - unholy amulet'},
  {style:16,name:'水银熔体',label:'MD / MINDBLOB',note:'液态金属 · 有机曲面',preset:'Flexi - mindblob [shiny mix]'},
  {style:17,name:'共振扭带',label:'MD / RESONANCE',note:'弦线回环 · 共振叠影',preset:'martin - resonant twister'},
  {style:18,name:'朱利亚分形',label:'MD / JULIA',note:'数学分形 · 无限层叠',preset:'Flexi - Julia fractal'},
] as const;
export const originalSceneCount=11;
export const sceneCount=originalSceneCount+milkdropScenes.length;
export const maxSceneId=sceneCount-1;
export const isMilkdropStyle=(style:number)=>style>=originalSceneCount&&style<=maxSceneId;
