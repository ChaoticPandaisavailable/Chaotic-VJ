import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
await mkdir('test-results/fixtures',{recursive:true});
const building=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#15363d"/><stop offset="1" stop-color="#ddd0b4"/></linearGradient></defs><rect width="1200" height="900" fill="url(#sky)"/><circle cx="915" cy="170" r="90" fill="#f3dfbf"/><path d="M0 810 L1200 660 L1200 900 L0 900" fill="#15252b"/><path d="M180 850 L180 380 L540 130 L890 330 L890 830Z" fill="#d7c9b1"/><path d="M540 130 L890 330 L890 830 L540 730Z" fill="#918473"/>${Array.from({length:6},(_,row)=>Array.from({length:5},(_,col)=>`<rect x="${220+col*56}" y="${400+row*58-col*37}" width="28" height="36" fill="#23383b"/>`).join('')).join('')}<path d="M580 285 L840 426 M580 370 L840 495 M580 455 L840 564 M580 540 L840 633 M580 625 L840 702" stroke="#1d3034" stroke-width="25"/><path d="M15 850 Q230 800 400 845 T780 805 T1210 790" fill="none" stroke="#bbae8f" stroke-width="13"/></svg>`;
await sharp(Buffer.from(building)).png().toFile('test-results/fixtures/architecture.png');
const texture=Buffer.alloc(800*600*3);
for(let y=0;y<600;y++)for(let x=0;x<800;x++){const index=(y*800+x)*3;const v=Math.round(128+100*Math.sin(x*.04+Math.sin(y*.03)*3));texture[index]=v;texture[index+1]=Math.round(v*.75);texture[index+2]=255-v;}
await sharp(texture,{raw:{width:800,height:600,channels:3}}).png().toFile('test-results/fixtures/texture.png');
console.log('Created two original diagnostic image fixtures.');
