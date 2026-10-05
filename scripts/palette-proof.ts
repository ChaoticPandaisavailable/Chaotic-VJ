import { writeFile,mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { moodPins,moodLabs,sampleMood,labToHex } from '../packages/shared/palette.ts';

// A diagnostic colour chart, rendered from the same colour model as the GPU lookup texture.
const parts=['<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="760"><rect width="1600" height="760" fill="#101112"/>'];
parts.push('<text x="32" y="42" fill="#ece9df" font-family="sans-serif" font-size="20">16 families / brighter colour, distinct lightness, clean white</text>');
for(let i=0;i<moodPins.length;i++){
  const pin=moodPins[i],labs=moodLabs(pin.x,pin.y),x=32+(i%4)*390,y=80+Math.floor(i/4)*164;
  parts.push(`<text x="${x}" y="${y+18}" fill="#d2d3ca" font-family="Microsoft YaHei,sans-serif" font-size="15">${pin.name}</text>`);
  for(let n=0;n<350;n++){
    const color=labToHex(sampleMood(labs,n/349));
    parts.push(`<rect x="${x+n}" y="${y+35}" width="1.1" height="66" fill="${color}"/>`);
  }
  for(let j=0;j<5;j++)parts.push(`<rect x="${x+j*70}" y="${y+109}" width="69" height="20" fill="${labToHex(labs[j])}"/>`);
}
parts.push('</svg>');await mkdir('test-results/screenshots',{recursive:true});
await writeFile('test-results/screenshots/palette-proof.svg',parts.join(''));
await sharp(Buffer.from(parts.join(''))).png().toFile('test-results/screenshots/palette-proof.png');
