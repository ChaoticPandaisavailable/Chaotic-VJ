import * as THREE from 'three';
// Fixed per-particle / per-cell identities keep letters from flickering each frame.
const ascii=' .,:;!|/\\-_=+<>[](){}?0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ@#$%&*';
const hanzi='天地玄黄宇宙洪荒日月盈昃辰宿列张云腾致雨露结为霜山川风林水火星河光影万物流转浮生若梦清风明月虚实相生静观流云时空回响';
export function createGlyphAtlas(){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='white';ctx.textAlign='center';ctx.textBaseline='middle';
  for(let i=0;i<128;i++){
    ctx.font=i<64?'500 47px "Cascadia Code", Consolas, monospace':'500 45px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    const char=i<64?ascii[i%ascii.length]:hanzi[(i-64)%hanzi.length];
    ctx.fillText(char,(i%16)*64+32,Math.floor(i/16)*64+32);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=true;
  return texture;
}
