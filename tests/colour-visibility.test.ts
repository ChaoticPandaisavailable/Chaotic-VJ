import test from 'node:test';
import assert from 'node:assert/strict';
import { moodLabs,moodPalette,sampleMood,labToHex,hexToLab,cinematicLooks } from '../packages/shared/palette.ts';

// Machado, Oliveira & Fernandes (2009), severity 100 supplementary matrices.
// Numeric data cross-checked against Colorspacious cvd.py:
// https://github.com/njsmith/colorspacious/blob/master/colorspacious/cvd.py
// These approximate simulations test luminance separation, not an individual's vision.
const vision={
  normal:[[1,0,0],[0,1,0],[0,0,1]],
  protan:[[.152286,1.052583,-.204868],[.114503,.786281,.099216],[-.003882,-.048116,1.051998]],
  deutan:[[.367322,.860646,-.227968],[.280085,.672501,.047413],[-.011820,.042940,.968881]],
  tritan:[[1.255528,-.076749,-.178779],[-.078411,.930809,.147602],[.004733,.691367,.303900]],
};
const linear=(v:number)=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
function luminance(hex:string,matrix:number[][]){
  const rgb=[1,3,5].map(i=>linear(parseInt(hex.slice(i,i+2),16)/255));
  const simulated=matrix.map(row=>Math.max(0,Math.min(1,row.reduce((sum,v,i)=>sum+v*rgb[i],0))));
  return simulated[0]*.2126+simulated[1]*.7152+simulated[2]*.0722;
}

test('all XY families expose a bright chromatic body while retaining the dark endpoint and pure white',()=>{
  for(let x=0;x<=72;x++)for(let y=0;y<=10;y++){
    const labs=moodLabs(x/72,y/10);
    const body=hexToLab(labToHex(sampleMood(labs,.32)));
    assert.ok(body[0]>.59,'the body became dim');
    assert.ok(Math.hypot(body[1],body[2])>.075,'the body became grey');
    assert.ok(labs[0][0]<.15);
    assert.equal(labToHex(labs[4]),'#ffffff');
  }
});

test('five lightness roles remain ordered under normal and three approximate colour-vision models',()=>{
  for(let x=0;x<=72;x++)for(let y=0;y<=10;y++){
    const colors=moodPalette(x/72,y/10).colors;
    for(const [name,matrix] of Object.entries(vision)){
      const light=colors.map(c=>luminance(c,matrix));
      for(let i=1;i<5;i++){
        assert.ok(light[i]-light[i-1]>.03,`${name} roles merge at ${x},${y},${i}`);
        assert.ok((light[i]+.05)/(light[i-1]+.05)>1.25,`${name} low adjacent contrast at ${x},${y},${i}`);
      }
    }
  }
});

test('light and dark cinematic grounds retain distinct lightness roles under approximate colour-vision models',()=>{
  for(const look of cinematicLooks)for(let x=0;x<=10;x++)for(let y=0;y<=10;y++){
    const colors=moodPalette(x/10,y/10,look.id).colors;
    const lightGround=['cedar','dusk','prism'].includes(look.id),direction=lightGround?-1:1;
    if(lightGround)assert.ok(hexToLab(colors[0])[0]>.94);else assert.equal(colors[4],'#ffffff');
    for(const [name,matrix] of Object.entries(vision)){
      const light=colors.map(c=>luminance(c,matrix));
      for(let i=1;i<5;i++)assert.ok((light[i]-light[i-1])*direction>.03,`${look.id}/${name} merged roles at ${x},${y},${i}`);
    }
  }
});
