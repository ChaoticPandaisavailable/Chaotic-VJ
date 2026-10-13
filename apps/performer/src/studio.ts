import type { Config } from '../../../packages/shared/config.ts';
import { applyVisual, matchesVisual, selectedVisual, visualEntries, visualGroups, type VisualGroupId } from './visual-library.ts';
import { mountPerformancePad } from './performance-pad.ts';
import './studio.css';
import { musicDirections } from './music-directions.ts';

/** Assemble the inspector from the existing controls. Move nodes so bindings survive. */
export function mountStudio(app:HTMLElement,getConfig:()=>Config,changed:()=>void){
  app.classList.add('studio');
  const find=<T extends HTMLElement=HTMLElement>(selector:string)=>app.querySelector<T>(selector)!;
  const shape=find('[data-panel=shape]'),color=find('[data-panel=color]');
  const music=find('[data-panel=music]'),live=find('[data-panel=live]');
  const controls=find('.controls');
  const scroll=document.createElement('div');scroll.className='inspector-scroll';
  for(const panel of app.querySelectorAll<HTMLElement>('.tab-content')){
    panel.id=`inspector-${panel.dataset.panel}`;panel.setAttribute('role','tabpanel');
    panel.setAttribute('aria-labelledby',`tab-${panel.dataset.panel}`);scroll.append(panel);
  }
  controls.insertBefore(scroll,find('.controls-footer'));
  const tabs=Array.from(app.querySelectorAll<HTMLButtonElement>('[data-tab]'));
  for(const tab of tabs){
    tab.id=`tab-${tab.dataset.tab}`;tab.setAttribute('aria-controls',`inspector-${tab.dataset.tab}`);
    tab.tabIndex=tab.getAttribute('aria-selected')==='true'?0:-1;
  }
  function selectTab(key:string){
    if(app.classList.contains('stage-focused')){app.classList.remove('stage-focused');find('[data-studio-focus]').setAttribute('aria-pressed','false');find('[data-studio-focus]').textContent='专注画面';}
    for(const tab of tabs){const active=tab.dataset.tab===key;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
    for(const panel of scroll.children)if(panel instanceof HTMLElement)panel.hidden=panel.dataset.panel!==key;
    scroll.scrollTop=0;
  }
  find('.control-tabs').addEventListener('click',event=>{
    const tab=(event.target as HTMLElement).closest<HTMLElement>('[data-tab]');if(tab)selectTab(tab.dataset.tab!);
  });
  find('.control-tabs').addEventListener('keydown',event=>{
    const index=tabs.indexOf(event.target as HTMLButtonElement);if(index<0)return;
    const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;
    if(next<0)return;event.preventDefault();selectTab(tabs[next].dataset.tab!);tabs[next].focus();
  });

  // One home for every control: no mirrored inputs and no duplicate identifiers.
  shape.insertAdjacentHTML('afterbegin','<div class="effect-context"><h2 id="effect-title"></h2><p id="effect-note"></p><p class="sky-hint">星点随高频轻轻闪亮，气体随底鼓推动。</p></div>');
  find('.effect-context').insertAdjacentHTML('beforeend','<label class="vortex-forms" hidden><span>涡旋形态</span><select id="vortex-form" aria-label="涡旋形态"><option value="spiral">原旋臂 · 星尘深空</option><option value="wind">星风 · 舒展流动</option><option value="binary">双星流 · 引力交织</option></select></label>');
  find<HTMLSelectElement>('#vortex-form').onchange=()=>{getConfig().variation.vortexForm=find<HTMLSelectElement>('#vortex-form').value as Config['variation']['vortexForm'];changed();};
  const extras=document.createElement('details');extras.className='inspector-section';
  extras.innerHTML='<summary>残影与细节</summary><div class="secondary-macros"></div>';
  for(const key of ['memory','fragmentation','morph'])extras.lastElementChild!.append(find(`[data-macro="${key}"]`).closest('.macro')!);
  const motion=find<HTMLDetailsElement>('.motion-exploration');motion.querySelector('summary')!.textContent='构图与流动';
  const variation=find<HTMLDetailsElement>('.variation-exploration');variation.querySelector('summary')!.textContent='表面与演化';
  shape.append(find('.macro-grid'),find('.shuffle-control'),motion,find('.lighting-controls'),variation,extras);
  const rhythm=find('.rhythm-panel');music.append(find('.signal-panel'),find('.music-panel'),rhythm,find('.modulation-details'));
  find<HTMLDetailsElement>('.signal-panel').open=true;
  music.insertAdjacentHTML('afterbegin','<p class="inspector-intro" id="music-context"></p>');
  const sourceActions=document.createElement('div');sourceActions.className='music-connect';
  sourceActions.innerHTML='<button data-action="desktop" class="outline">连接桌面音频</button>';
  find('.signal-body').before(sourceActions);
  const queue=find('.queue-panel');live.append(queue);
  const photoSettings=find('[data-setting="photos.activeForSeconds"]').closest<HTMLElement>('.subsection')!;
  const photoDetails=document.createElement('details');photoDetails.className='inspector-section';
  photoDetails.innerHTML='<summary>照片显影设置</summary>';
  photoDetails.append(find('[data-macro=photoPresence]').closest('.macro')!,photoSettings);live.append(photoDetails);
  const paletteDetails=document.createElement('details');paletteDetails.className='inspector-section palette-detail';
  paletteDetails.innerHTML='<summary>自定义色槽与明暗</summary>';
  for(const child of Array.from(color.children))if(!child.classList.contains('mood-panel')&&!child.classList.contains('color-range'))paletteDetails.append(child);
  color.append(paletteDetails);
  find('.preset-library').querySelector('.eyebrow')!.textContent='我的预设';
  const transport=find('.transport');transport.insertAdjacentHTML('beforeend','<button class="stage-focus" data-studio-focus aria-pressed="false">专注画面</button>');
  find('[data-studio-focus]').onclick=()=>{
    const focused=app.classList.toggle('stage-focused');find('[data-studio-focus]').setAttribute('aria-pressed',String(focused));
    find('[data-studio-focus]').textContent=focused?'显示控制':'专注画面';
  };

  const library=find('.visual-library');
  const macroNames=new Map(Array.from(app.querySelectorAll<HTMLInputElement>('[data-macro]')).map(input=>[input.dataset.macro!,{label:input.closest('.macro')!.querySelector('b')!.textContent!,aria:input.getAttribute('aria-label')!}]));
  const search=find<HTMLInputElement>('#visual-search');
  const pad=mountPerformancePad(library,getConfig,id=>{if(applyVisual(getConfig(),id))changed();},()=>{
    if(app.classList.contains('stage-focused'))find('[data-studio-focus]').click();
    search.focus();search.scrollIntoView({block:'nearest'});
  },()=>{if(app.classList.contains('stage-focused'))find('[data-studio-focus]').click();});
  let group:VisualGroupId|'all'='atmosphere',previousId='';
  function filter(){
    const query=search.value.trim();let count=0;
    for(const button of library.querySelectorAll<HTMLElement>('[data-visual-group]'))button.setAttribute('aria-pressed',String(button.dataset.visualGroup===group));
    for(const button of library.querySelectorAll<HTMLElement>('[data-visual-id]')){
      const entry=visualEntries.find(entry=>entry.id===button.dataset.visualId)!;
      button.hidden=query?!matchesVisual(entry,query):group!=='all'&&entry.group!==group;
      if(!button.hidden)count++;
    }
    find('.visual-count').textContent=query?`${count} 个匹配 · 搜索全部分类`:`${visualEntries.length} 个效果 · 保留当前配色`;
    find('.visual-empty').hidden=count>0;
  }
  search.addEventListener('input',filter);
  search.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();search.value='';filter();search.blur();}});
  find('[data-clear-search]').onclick=()=>{search.value='';filter();search.focus();};
  library.addEventListener('click',event=>{
    const target=event.target as HTMLElement,filterButton=target.closest<HTMLElement>('[data-visual-group]');
    if(filterButton){group=filterButton.dataset.visualGroup as typeof group;search.value='';filter();}
    const entry=target.closest<HTMLElement>('[data-visual-id]');
    if(entry)(event.shiftKey?pad.stage:pad.launch)(entry.dataset.visualId!);
  });
  function update(config:Config){
    pad.update(config);
    const entry=selectedVisual(config);
    if(entry&&entry.id!==previousId){if(group!=='all')group=entry.group;previousId=entry.id;filter();}
    const title=entry?.name??'自定义视觉';find('.section-heading h1').textContent=title;
    find('#effect-title').textContent=title;find('#effect-note').textContent=entry?.note??'当前保存的视觉参数';
    const groupName=visualGroups.find(g=>g.id===entry?.group)?.label??'视觉现场';
    find('#scene-label').textContent=config.performance.enabled?find('#scene-label').textContent:`${groupName} / ${title}`;
    for(const button of library.querySelectorAll<HTMLElement>('[data-visual-id]'))button.setAttribute('aria-pressed',String(button.dataset.visualId===entry?.id));
    const gas=config.field.style===6;
    const names:Record<string,string>=config.field.style===9?{energy:'星尘亮度',chaos:'流束起伏',density:'粒子密度',motion:'星河流速'}:config.field.style===19?{energy:'光幕亮度',chaos:'风中褶皱',density:'光帘高度',motion:'流动速度'}:config.field.style===20?{energy:'折射亮度',chaos:'波面起伏',density:'水体明暗',motion:'流动速度'}:{};
    for(const [key,original] of macroNames){const input=find<HTMLInputElement>(`[data-macro="${key}"]`);input.closest('.macro')!.querySelector('b')!.textContent=names[key]??original.label;input.setAttribute('aria-label',names[key]??original.aria);}
    find('.vortex-forms').hidden=config.field.style!==4;
    find<HTMLSelectElement>('#vortex-form').value=config.variation.vortexForm??'spiral';
    find('.chaotic-control').hidden=!gas;find('.sky-hint').hidden=!gas;
    const bGas=config.performance.enabled&&config.performance.sceneB===0;
    find('.music-panel').hidden=!entry&&!bGas;rhythm.hidden=!gas&&!bGas;
    find('.music-sections').hidden=!gas&&!bGas;
    const direction=musicDirections[entry?.id??'nebula'];
    find('#music-context').textContent=direction.summary;
    find('#music-hint-amount').textContent=`控制声音对${title}的影响`;
    find('#music-hint-impact').textContent=direction.kick;
    find('#music-hint-flow').textContent=direction.flow;
    find('#music-hint-detail').textContent=direction.detail;
    find('.modulation-details').hidden=!gas&&!bGas;
    const simple=config.field.style>=6&&config.field.style<=8;
    find('.composition-controls').hidden=simple;
    find('[data-variation=cellSize]').closest<HTMLElement>('.setting')!.hidden=config.variation.surface==='fluid';
  }
  filter();update(getConfig());
  return {update,selectTab};
}
