import type { Config } from '../../../packages/shared/config.ts';
import { configSchema } from '../../../packages/shared/config.ts';
import type { SavedPreset } from '../../../packages/shared/saved-presets.ts';
import { api,download,toast } from './api.ts';

export function mountPresetLibrary(app:HTMLElement,getConfig:()=>Config,load:(config:Config)=>void){
  app.querySelector('[data-panel="color"]')!.insertAdjacentHTML('afterbegin',`<section class="preset-library" aria-label="我的预设"><span class="eyebrow">我的预设</span><div class="preset-recall"><select id="saved-presets" aria-label="已保存预设"><option value="">选择预设</option></select><button id="recall-preset">载入</button></div><input id="preset-name" aria-label="预设名称" placeholder="给这组颜色与纹理起个名字" maxlength="60"/><div class="preset-buttons"><button id="save-new-preset" class="outline">存为新预设</button><button id="update-preset" disabled>更新选中</button><button id="export-preset">导出 JSON</button></div><p class="fine">保存颜色、Chaotic、打光及演奏设置；重启后仍在。</p></section>`);
  const select=app.querySelector<HTMLSelectElement>('#saved-presets')!,name=app.querySelector<HTMLInputElement>('#preset-name')!;
  const save=app.querySelector<HTMLButtonElement>('#save-new-preset')!,update=app.querySelector<HTMLButtonElement>('#update-preset')!,recall=app.querySelector<HTMLButtonElement>('#recall-preset')!;
  let entries:SavedPreset[]=[],busy=false;
  function selected(){return entries.find(p=>p.id===select.value);}
  function controls(){save.disabled=busy;update.disabled=busy||!selected();recall.disabled=busy||!selected();}
  async function refresh(id=select.value){entries=await api<SavedPreset[]>('/api/presets');select.replaceChildren(new Option('选择预设',''),...entries.map(p=>new Option(p.name,p.id)));select.value=id;controls();}
  select.onchange=()=>{name.value=selected()?.name??'';controls();};
  recall.onclick=()=>{const preset=selected();if(preset){load(configSchema.parse(structuredClone(preset.config)));toast(`已载入「${preset.name}」。`);}};
  async function store(replace:boolean){
    if(busy)return;if(!name.value.trim()){name.focus();toast('先给预设起个名字。');return;}
    const id=replace?selected()?.id:undefined;if(replace&&!id)return;
    busy=true;controls();
    try{const saved=await api<SavedPreset>(id?`/api/presets/${id}`:'/api/presets',{name:name.value.trim(),config:structuredClone(getConfig())},id?'PUT':'POST');await refresh(saved.id);toast(`已保存「${saved.name}」。`);}
    catch(error){toast((error as Error).message);}finally{busy=false;controls();}
  }
  save.onclick=()=>void store(false);update.onclick=()=>void store(true);
  name.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();void store(false);}};
  app.querySelector<HTMLButtonElement>('#export-preset')!.onclick=()=>download(new Blob([JSON.stringify(getConfig(),null,2)],{type:'application/json'}),`chaotic-preset-${Date.now()}.json`);
  void refresh().catch(error=>toast(`预设库读取失败：${error.message}`));
  return {open(){app.querySelector<HTMLButtonElement>('[data-tab="color"]')!.click();app.querySelector('.preset-library')!.scrollIntoView({block:'nearest'});name.focus();void refresh().catch(error=>toast(error.message));}};
}
