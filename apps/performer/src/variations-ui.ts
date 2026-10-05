import { capturePalette,lookTexture,rememberPalette } from '../../../packages/shared/palette-editing.ts';
import type { Config } from '../../../packages/shared/config.ts';
import { moodPalette, moodPins, moodLabs, mixLab, labToHex, cinematicLooks } from '../../../packages/shared/palette.ts';
import { moodBounds, setColorMood } from '../../../packages/shared/performance.ts';

const surfaces=[['fluid','≈','连续'],['dots','⠿','点阵'],['pixels','▦','像素'],['contours','◎','等高线'],['ascii','Aa','ASCII'],['hanzi','字','汉字']] as const;
const range=(key:string,label:string,min:number,max:number,step:number)=>`<label class="setting"><span>${label}<output data-variation-value="${key}"></output></span><input type="range" data-variation="${key}" aria-label="${label}" min="${min}" max="${max}" step="${step}"/></label>`;

export function mountVariations(app:HTMLElement,getConfig:()=>Config,changed:()=>void){
  app.querySelector('.scenes')!.insertAdjacentHTML('afterend',`<details class="explorations variation-exploration"><summary>表面与细节</summary><section class="variation-panel" aria-label="视觉变体"><div class="surface-options">${surfaces.map(([key,icon,label])=>`<button data-surface="${key}" aria-pressed="false">${label}</button>`).join('')}</div><div class="variation-controls">${range('complexity','复杂度',0,1,.01)}${range('rotation','旋转',-1,1,.01)}${range('cellSize','颗粒大小',4,32,1)}</div><div class="evolution-row"><label class="toggle"><span>自动呼吸<small>形体缓慢疏密，不自动换色</small></span><input type="checkbox" id="auto-evolve"/></label>${range('transitionSeconds','过渡 / 秒',.3,12,.1)}${range('evolution','演化速度',0,1,.01)}</div><div class="particle-controls" hidden><span class="eyebrow">粒子构形</span>${range('particleForm','构形 · 球 / 花环 / 结 / 云幕',0,1,.01)}${range('spread','聚拢 / 弥散',0,1,.01)}</div></section></details>`);
  app.querySelector('.controls-heading')!.insertAdjacentHTML('afterend',`<section class="mood-panel" aria-label="色彩二维宏"><div class="panel-title"><span>颜色 <small>XY</small></span><select id="mood-preset" aria-label="颜色方案"><option value="xy">自由 XY</option><option value="custom">自定义 HEX</option><option value="mono">黑白</option>${moodPins.map((p,i)=>`<option value="${i}">${p.name}</option>`).join('')}</select></div><div class="mood-controller"><div class="mood-pad" id="mood-pad" tabindex="0" role="group" aria-label="二维色彩控制，左右遍历色相，下方同色，上方双色点缀"><canvas class="mood-map" width="96" height="64" aria-hidden="true"></canvas><span class="mood-live" aria-hidden="true"></span><span class="mood-crosshair-x" aria-hidden="true"></span><span class="mood-crosshair-y" aria-hidden="true"></span><span class="mood-cursor" aria-hidden="true"></span><span class="mood-axis-x" aria-hidden="true">全色相</span><span class="mood-axis-y" aria-hidden="true">点缀</span></div><div class="mood-axis-controls"><label class="setting"><span><b>X</b> 色相<output data-mood-value="warmth"></output></span><input aria-label="色彩色相" data-mood-axis="warmth" type="range" min="0" max="1" step=".01"/></label><label class="setting"><span><b>Y</b> 点缀<output data-mood-value="richness"></output></span><input aria-label="双色点缀" data-mood-axis="richness" type="range" min="0" max="1" step=".01"/></label><div class="mood-swatches" aria-label="当前统一色板"></div></div></div><div class="color-motion-row"><label><input type="checkbox" id="color-motion"/>缓慢变色</label><select id="color-motion-speed" aria-label="变色周期"><option value="90">90 秒 / 圈</option><option value="180">180 秒 / 圈</option><option value="360">360 秒 / 圈</option></select></div></section>`);
  const pad=app.querySelector<HTMLDivElement>('#mood-pad')!,cursor=pad.querySelector<HTMLElement>('.mood-cursor')!;
  const looks=app.querySelector<HTMLSelectElement>('#mood-preset')!;
  const group=document.createElement('optgroup');group.label='电影意境';
  for(const look of cinematicLooks)group.append(new Option(look.name,`look:${look.id}`));
  looks.insertBefore(group,looks.options[1]);
  const live=pad.querySelector<HTMLElement>('.mood-live')!;
  const motion=app.querySelector<HTMLInputElement>('#color-motion')!,speed=app.querySelector<HTMLSelectElement>('#color-motion-speed')!;
  speed.onchange=()=>{getConfig().colorMotion.seconds=Number(speed.value);changed();};
  let lastMap='',lastColors='';let livePosition:{x:number;y:number}|undefined;
  function drawMap(config:Config){
    const b=moodBounds(config),key=JSON.stringify([b,config.colorLook]);if(key===lastMap)return;lastMap=key;
    const canvas=pad.querySelector<HTMLCanvasElement>('.mood-map')!,ctx=canvas.getContext('2d')!;
    for(let y=0;y<16;y++)for(let x=0;x<32;x++){
      const yy=b.y0+(1-y/15)*(b.y1-b.y0),labs=moodLabs(b.x0+x/31*(b.x1-b.x0),yy,config.colorLook);
      ctx.fillStyle=labToHex(mixLab(labs[2],labs[3],.1+yy*.35));ctx.fillRect(x*3,y*4,3,4);
    }
  }
  function updateLive(position?:{x:number;y:number}){
    if(position)livePosition=position;
    const config=getConfig(),b=moodBounds(config),p=position??{x:config.colorMood.warmth,y:config.colorMood.richness};
    const selected=config.colorMood.enabled?moodPalette(p.x,p.y,config.colorLook):config.palette;
    const key=selected.colors.join('');if(key!==lastColors){lastColors=key;app.querySelector('.mood-swatches')!.innerHTML=selected.colors.map(hex=>`<span style="background:${hex}" title="${hex}"></span>`).join('');}
    live.hidden=!config.colorMood.enabled||!config.colorMotion.enabled;
    const x=b.x1===b.x0?.5:(p.x-b.x0)/(b.x1-b.x0),y=b.y1===b.y0?.5:(p.y-b.y0)/(b.y1-b.y0);
    live.style.left=`${Math.max(0,Math.min(1,x))*100}%`;live.style.top=`${(1-Math.max(0,Math.min(1,y)))*100}%`;
  }
  app.querySelector('.variation-controls')!.insertAdjacentHTML('afterend',`<div class="composition-controls"><label class="toggle"><span>构图漫游<small id="composition-hint">缓慢重组，保留色彩</small></span><input type="checkbox" id="composition-roam"/></label><button id="next-composition">下一构形 ↗</button></div>`);
  app.querySelector('[data-panel="color"]')!.insertAdjacentHTML('afterbegin',`<details class="color-range"><summary>XY 演奏区间</summary><label class="toggle"><span>限定色相与点缀范围</span><input type="checkbox" id="color-range-enabled"/></label><div class="range-pair"><span>色相</span><label>起<input type="number" data-color-range="warmMin" aria-label="色相区间起点" min="0" max="100"/></label><label>止<input type="number" data-color-range="warmMax" aria-label="色相区间终点" min="0" max="100"/></label></div><div class="range-pair"><span>点缀</span><label>起<input type="number" data-color-range="richMin" aria-label="点缀区间起点" min="0" max="100"/></label><label>止<input type="number" data-color-range="richMax" aria-label="点缀区间终点" min="0" max="100"/></label></div><p class="fine">XY 面板和 MIDI 会在这个区间内演奏。下方 HEX 色槽仍可自由编辑。</p></details>`);
  function setMood(x:number,y:number){
    setColorMood(getConfig(),x,y);rememberPalette(getConfig());changed();
  }
  function pointer(e:PointerEvent){const r=pad.getBoundingClientRect(),b=moodBounds(getConfig());setMood(b.x0+(e.clientX-r.left)/r.width*(b.x1-b.x0),b.y0+(1-(e.clientY-r.top)/r.height)*(b.y1-b.y0));}
  pad.addEventListener('pointerdown',e=>{if(e.button!==0)return;pad.setPointerCapture(e.pointerId);pad.focus({preventScroll:true});pointer(e);});
  pad.addEventListener('pointermove',e=>{if(pad.hasPointerCapture(e.pointerId))pointer(e);});
  pad.addEventListener('pointerup',e=>{if(pad.hasPointerCapture(e.pointerId)){pointer(e);pad.releasePointerCapture(e.pointerId);}});
  pad.addEventListener('keydown',e=>{const deltas:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]};const d=deltas[e.key];if(d){e.preventDefault();const c=getConfig().colorMood,step=e.shiftKey?.1:.02;setMood(c.warmth+d[0]*step,c.richness+d[1]*step);}});
  pad.addEventListener('dblclick',()=>{const b=moodBounds(getConfig());setMood((b.x0+b.x1)/2,(b.y0+b.y1)/2);});
  function changeRange(e:Event){
    const input=e.target as HTMLInputElement,config=getConfig();
    if(input.id!=='color-range-enabled'&&!input.dataset.colorRange)return;
    if(input.id==='color-range-enabled')config.colorRange.enabled=input.checked;
    else if(Number.isFinite(input.valueAsNumber)){
      const key=input.dataset.colorRange as 'warmMin'|'warmMax'|'richMin'|'richMax',r=config.colorRange,value=Math.max(0,Math.min(1,input.valueAsNumber/100));
      r[key]=key==='warmMin'?Math.min(value,r.warmMax):key==='warmMax'?Math.max(value,r.warmMin):key==='richMin'?Math.min(value,r.richMax):Math.max(value,r.richMin);
    }
    if(config.colorMood.enabled)setColorMood(config,config.colorMood.warmth,config.colorMood.richness);changed();
  }
  app.addEventListener('input',changeRange);app.addEventListener('change',changeRange);
  app.querySelector<HTMLSelectElement>('#mood-preset')!.addEventListener('change',e=>{
    const value=(e.target as HTMLSelectElement).value;
    if(value.startsWith('look:')){const config=getConfig();config.colorLook=value.slice(5) as Config['colorLook'];config.look.chaotic=lookTexture[config.colorLook];setMood(.5,.55);}
    else if(value==='xy'){getConfig().colorLook='free';const c=getConfig().colorMood;setMood(c.warmth,c.richness);}
    else if(value==='custom'){capturePalette(getConfig(),livePosition);changed();}
    else if(value==='mono'){const config=getConfig();config.colorMood.enabled=false;Object.assign(config.palette,{mapping:'even',colors:['#050505','#383838','#898989','#cccccc','#fafafa'],background:'#050505'});rememberPalette(config);changed();}
    else if(value!=='custom'){getConfig().colorLook='free';const p=moodPins[Number(value)];setMood(p.x,p.y);}
  });
  app.addEventListener('click',e=>{
    const target=e.target as HTMLElement,surface=target.closest<HTMLElement>('[data-surface]');
    if(surface){getConfig().variation.surface=surface.dataset.surface as Config['variation']['surface'];changed();}
    if(target.closest('#next-composition')){getConfig().variation.compositionSeed=(getConfig().variation.compositionSeed+1)%1000000;changed();}
  });
  app.addEventListener('input',e=>{
    const input=e.target as HTMLInputElement;
    if(input.dataset.variation){(getConfig().variation as unknown as Record<string,unknown>)[input.dataset.variation]=Number(input.value);changed();}
    if(input.id==='color-motion'){const config=getConfig();config.colorMotion.enabled=input.checked;if(input.checked&&!config.colorMood.enabled)setColorMood(config,config.colorMood.warmth,config.colorMood.richness);changed();}
    if(input.id==='auto-evolve'){getConfig().variation.autoEvolve=input.checked;changed();}
    if(input.id==='composition-roam'){getConfig().variation.roam=input.checked;changed();}
    if(input.dataset.moodAxis){const c=getConfig().colorMood;setMood(input.dataset.moodAxis==='warmth'?Number(input.value):c.warmth,input.dataset.moodAxis==='richness'?Number(input.value):c.richness);}
  });
  return {updateLive,update(config:Config){
    const bounds=moodBounds(config);
    drawMap(config);motion.checked=config.colorMood.enabled&&config.colorMotion.enabled;
    if(!Array.from(speed.options).some(o=>Number(o.value)===config.colorMotion.seconds))speed.add(new Option(`${config.colorMotion.seconds} 秒 / 圈`,String(config.colorMotion.seconds)));
    speed.value=String(config.colorMotion.seconds);
    (app.querySelector('#color-range-enabled') as HTMLInputElement).checked=config.colorRange.enabled;
    for(const input of app.querySelectorAll<HTMLInputElement>('[data-color-range]'))if(document.activeElement!==input)input.value=String(Math.round((config.colorRange[input.dataset.colorRange as 'warmMin'|'warmMax'|'richMin'|'richMax'])*100));
    for(const button of app.querySelectorAll<HTMLElement>('[data-surface]'))button.setAttribute('aria-pressed',String(button.dataset.surface===config.variation.surface));
    for(const input of app.querySelectorAll<HTMLInputElement>('[data-variation]')){const key=input.dataset.variation as keyof Config['variation'],value=config.variation[key];if(document.activeElement!==input)input.value=String(value);app.querySelector(`[data-variation-value="${key}"]`)!.textContent=String(value);}
    (app.querySelector('#auto-evolve') as HTMLInputElement).checked=config.variation.autoEvolve;
    const original=config.field.style>=6&&config.field.style<=8;
    const roam=app.querySelector<HTMLInputElement>('#composition-roam')!;roam.checked=config.variation.roam;roam.disabled=original;
    (app.querySelector('#next-composition') as HTMLButtonElement).disabled=original;
    app.querySelector('#composition-hint')!.textContent=original?'前三套保留原本运动':'缓慢重组，保留色彩';
    (app.querySelector('.particle-controls') as HTMLElement).hidden=config.field.style!==9;
    const nx=bounds.x1===bounds.x0?.5:(config.colorMood.warmth-bounds.x0)/(bounds.x1-bounds.x0),ny=bounds.y1===bounds.y0?.5:(config.colorMood.richness-bounds.y0)/(bounds.y1-bounds.y0);
    pad.style.setProperty('--mood-x',`${Math.max(0,Math.min(1,nx))*100}%`);pad.style.setProperty('--mood-y',`${(1-Math.max(0,Math.min(1,ny)))*100}%`);cursor.classList.toggle('inactive',!config.colorMood.enabled);
    const preset=app.querySelector<HTMLSelectElement>('#mood-preset')!;
    const pin=config.colorMood.enabled?moodPins.findIndex(p=>Math.abs(p.x-config.colorMood.warmth)<.005&&Math.abs(p.y-config.colorMood.richness)<.005):-1;
    const cinematic=config.colorMood.enabled&&config.colorLook&&config.colorLook!=='free';
    preset.value=cinematic?`look:${config.colorLook}`:pin>=0?String(pin):!config.colorMood.enabled&&config.palette.colors.every(c=>c.slice(1,3)===c.slice(3,5)&&c.slice(3,5)===c.slice(5,7))?'mono':config.colorMood.enabled?'xy':'custom';
    pad.querySelector('.mood-axis-x')!.textContent=cinematic?'色调':'全色相';
    pad.querySelector('.mood-axis-y')!.textContent=cinematic?'染色':'点缀';
    pad.setAttribute('aria-label',cinematic?'二维色彩控制，在当前意境内调整色调与染色':'二维色彩控制，左右遍历色相，下方同色，上方双色点缀');
    for(const output of app.querySelectorAll<HTMLOutputElement>('[data-mood-value]'))output.value=`${Math.round(config.colorMood[output.dataset.moodValue as 'warmth'|'richness']*100)}`;
    pad.setAttribute('aria-description',cinematic?`当前意境内变化，色调 ${Math.round(config.colorMood.warmth*100)}%，染色 ${Math.round(config.colorMood.richness*100)}%。缓慢变色在此意境内往返。方向键调整，Shift 加速。`:`色相 ${Math.round(config.colorMood.warmth*360)} 度，双色点缀 ${Math.round(config.colorMood.richness*100)}%。下方同色到白，上方加入辅色点缀。方向键调整，Shift 加速。`);
    for(const input of app.querySelectorAll<HTMLInputElement>('[data-mood-axis]')){const x=input.dataset.moodAxis==='warmth';input.min=String(x?bounds.x0:bounds.y0);input.max=String(x?bounds.x1:bounds.y1);if(document.activeElement!==input)input.value=String(config.colorMood[input.dataset.moodAxis as 'warmth'|'richness']);}
    updateLive();
  }};
}
