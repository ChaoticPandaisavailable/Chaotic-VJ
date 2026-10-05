import * as THREE from 'three';

/** Two adjacent z slices share one filtered texture lookup, including the wrap boundary. */
export function createNoiseTexture(){
  const size=256,plane=new Uint8Array(size*size),data=new Uint8Array(size*size*2);
  let state=0x51f15e;
  for(let i=0;i<plane.length;i++){state^=state<<13;state^=state>>>17;state^=state<<5;plane[i]=(state>>>24)&255;}
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=y*size+x;data[i*2]=plane[i];data[i*2+1]=plane[((y+17)%size)*size+(x+37)%size];
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGFormat,THREE.UnsignedByteType);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.minFilter=texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=false;texture.needsUpdate=true;
  return texture;
}
