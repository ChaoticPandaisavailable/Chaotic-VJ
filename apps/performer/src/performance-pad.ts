import type { Config } from '../../../packages/shared/config.ts';
import { escapeHTML } from './api.ts';
import { selectedVisual, visualEntries, type VisualEntryId } from './visual-library.ts';

const storageKey='chaotic-vj.performance-pad.v1';
export const defaultPad:readonly VisualEntryId[]=['nebula','vortex','particles','facets','aurora','tidal'];
export function readPad(value:unknown):(VisualEntryId|null)[]{
  if(!Array.isArray(value))return [...defaultPad];
  return Array.from({length:6},(_,index)=>visualEntries.find(entry=>entry.id===value[index])?.id??null);
}
export type PadShortcut={type:'play'|'stage';slot:number}|{type:'search'|'take'|'cancel'};
export function padShortcut(event:{code:string;key:string;shiftKey:boolean;ctrlKey:boolean;metaKey:boolean;altKey:boolean;repeat:boolean;isComposing:boolean},editing=false):PadShortcut|null{
  if(editing||event.repeat||event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return null;
  if(/^Digit[1-6]$/.test(event.code))return {type:event.shiftKey?'stage':'play',slot:Number(event.code.slice(-1))-1};
  if(event.key==='/')return {type:'search'};
  if(event.key==='Enter')return {type:'take'};
  if(event.key==='Escape')return {type:'cancel'};
  return null;
}

export function mountPerformancePad(library:HTMLElement,getConfig:()=>Config,play:(id:string)=>void,search:()=>void,reveal:()=>void){
  let slots=readPad(null),pending:VisualEntryId|null=null;
  try{const saved=localStorage.getItem(storageKey);if(saved)slots=readPad(JSON.parse(saved));}catch{/* Private browsing still has a working in-memory pad. */}
  const pad=document.createElement('section');pad.className='performance-pad';pad.setAttribute('aria-label','演出快捷位');
  pad.innerHTML=`<header><h2>演出快捷位 <small>1–6</small></h2><button type="button" data-pad-edit aria-expanded="false" aria-controls="pad-editor">编排</button></header>
    <div class="pad-grid">${slots.map((_,i)=>`<button type="button" data-pad-slot="${i}" aria-pressed="false" aria-keyshortcuts="${i+1}"><kbd>${i+1}</kbd><span></span></button>`).join('')}</div>
    <div id="pad-editor" class="pad-editor" hidden>${slots.map((_,i)=>`<label>快捷位 ${i+1}<select data-pad-assign="${i}" aria-label="快捷位 ${i+1}"><option value="">空位</option>${visualEntries.map(entry=>`<option value="${entry.id}">${escapeHTML(entry.name)}</option>`).join('')}</select></label>`).join('')}<p>保存在本浏览器 · 切换时沿用当前配色</p></div>
    <p class="pad-help">Shift + 数字 / 点击效果，先排入下一幕</p>
    <div class="pending-visual" hidden><div><small>下一幕</small><strong data-pending-name></strong></div><span>Enter 切入 · Esc 取消</span><button type="button" data-pad-take>切入</button><button type="button" data-pad-cancel aria-label="取消下一幕">取消</button></div>
    <span class="pad-announcement" role="status" aria-live="polite"></span>`;
  library.before(pad);
  const find=<T extends HTMLElement=HTMLElement>(selector:string)=>pad.querySelector<T>(selector)!;
  const announce=(text:string)=>{find('.pad-announcement').textContent=text;};
  const entryFor=(id:string|null)=>visualEntries.find(entry=>entry.id===id);
  function update(config:Config){
    const active=selectedVisual(config)?.id;
    for(const button of pad.querySelectorAll<HTMLButtonElement>('[data-pad-slot]')){
      const slot=Number(button.dataset.padSlot),entry=entryFor(slots[slot]);
      button.querySelector('span')!.textContent=entry?.name??'空位';button.disabled=!entry;
      button.setAttribute('aria-pressed',String(!!entry&&entry.id===active));
      button.classList.toggle('is-pending',!!entry&&entry.id===pending);
      button.title=entry?`${entry.name} · ${slot+1} 切换 / Shift+${slot+1} 下一幕`:'点编排选择效果';
    }
    for(const select of pad.querySelectorAll<HTMLSelectElement>('[data-pad-assign]'))select.value=slots[Number(select.dataset.padAssign)]??'';
    find('.pending-visual').hidden=!pending;
    find('[data-pending-name]').textContent=entryFor(pending)?.name??'';
  }
  function clear(){pending=null;update(getConfig());}
  function stage(id:string){const entry=entryFor(id);if(!entry)return;reveal();pending=entry.id;update(getConfig());announce(`下一幕：${entry.name}。当前画面继续播放。`);}
  function launch(id:string){clear();play(id);}
  function take(){if(!pending)return;const id=pending;launch(id);announce(`已切入：${entryFor(id)!.name}`);}
  find('[data-pad-edit]').onclick=()=>{const editor=find('#pad-editor');editor.hidden=!editor.hidden;find('[data-pad-edit]').setAttribute('aria-expanded',String(!editor.hidden));};
  find('[data-pad-take]').onclick=take;
  find('[data-pad-cancel]').onclick=()=>{clear();announce('已取消下一幕');};
  pad.addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLElement>('[data-pad-slot]');if(!button)return;const id=slots[Number(button.dataset.padSlot)];if(id)(event.shiftKey?stage:launch)(id);});
  pad.addEventListener('change',event=>{
    const select=(event.target as HTMLElement).closest<HTMLSelectElement>('[data-pad-assign]');if(!select)return;
    slots[Number(select.dataset.padAssign)]=entryFor(select.value)?.id??null;
    try{localStorage.setItem(storageKey,JSON.stringify(slots));announce('快捷位已保存');}catch{announce('本浏览器无法保存，快捷位将在关闭页面后重置');}
    update(getConfig());
  });
  window.addEventListener('keydown',event=>{
    const target=event.target instanceof HTMLElement?event.target:null;
    const editing=!!target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')||!!document.querySelector('dialog[open]');
    const shortcut=padShortcut(event,editing);if(!shortcut)return;
    if(shortcut.type==='take'||shortcut.type==='cancel'){
      if(!pending)return;event.preventDefault();if(shortcut.type==='take')take();else{clear();announce('已取消下一幕');}return;
    }
    if(shortcut.type==='search'){event.preventDefault();search();return;}
    if(!('slot' in shortcut))return;
    const id=slots[shortcut.slot];if(!id)return;event.preventDefault();(shortcut.type==='stage'?stage:launch)(id);
  });
  update(getConfig());
  return {update,stage,launch};
}
