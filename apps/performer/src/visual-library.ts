import { applyScenePreset, scenePresets, type Config } from '../../../packages/shared/config.ts';
import { escapeHTML } from './api.ts';

export const visualGroups = [
  {id:'atmosphere',label:'混沌与星空'},
  {id:'spatial',label:'空间与形体'},
] as const;

export type VisualGroupId = typeof visualGroups[number]['id'];

// UI ordering is independent of the persisted scene indexes used by MIDI and A/B.
const definitions = [
  {id:'nebula',group:'atmosphere',sceneIndex:0,atmosphere:'nebula',name:'熔流星云',note:'旋臂烟云 · 深空星光'},
  {id:'clouds',group:'atmosphere',sceneIndex:0,atmosphere:'clouds',name:'云海风暴',note:'舒展云体 · 留白星空'},
  {id:'ink',group:'atmosphere',sceneIndex:0,atmosphere:'ink',name:'水墨山海',note:'水墨层叠 · 疏星微光'},
  {id:'classic',group:'atmosphere',sceneIndex:0,atmosphere:'classic',name:'经典卷曲',note:'原始混沌 · 气流卷曲'},
  {id:'vortex',group:'atmosphere',sceneIndex:9,note:'宇宙旋臂 · 星际风流'},
  {id:'storm',group:'spatial',sceneIndex:1},
  {id:'strings',group:'spatial',sceneIndex:2},
  {id:'particles',group:'spatial',sceneIndex:3},
  {id:'facets',group:'spatial',sceneIndex:4},
  {id:'aurora',group:'atmosphere',sceneIndex:19},
  {id:'tidal',group:'spatial',sceneIndex:20},
] as const satisfies readonly {id:string;group:VisualGroupId;sceneIndex:number;atmosphere?:Config['look']['atmosphere'];name?:string;note?:string}[];

export type VisualEntryId = typeof definitions[number]['id'];
export interface VisualEntry {
  id:VisualEntryId;
  name:string;
  note:string;
  group:VisualGroupId;
  sceneIndex:number;
  atmosphere?:Config['look']['atmosphere'];
}

export const visualEntries:readonly VisualEntry[] = definitions.map(entry=>({
  name:scenePresets[entry.sceneIndex].name,
  note:scenePresets[entry.sceneIndex].note,
  ...entry,
}));

export function selectedVisual(config:Config):VisualEntry|undefined {
  return visualEntries.find(entry=>scenePresets[entry.sceneIndex].field.style===config.field.style&&(!entry.atmosphere||entry.atmosphere===config.look.atmosphere));
}

/** Returns whether the ID is known; unknown UI values never change the session. */
export function applyVisual(config:Config,id:string):boolean {
  const entry=visualEntries.find(candidate=>candidate.id===id);
  if(!entry)return false;
  const preset=scenePresets[entry.sceneIndex];
  if(!entry.atmosphere||config.field.style!==preset.field.style)applyScenePreset(config,preset);
  if(entry.atmosphere)config.look.atmosphere=entry.atmosphere;
  return true;
}

export function renderVisualLibrary():string {
  return `<section class="visual-library" aria-label="视觉库">
    <header class="visual-library-header"><h2>视觉库</h2><span class="visual-count">${visualEntries.length} 个效果 · 保留当前配色</span></header>
    <label class="visual-search"><span>查找效果</span><input type="search" id="visual-search" placeholder="名称、质感或分类…　/" autocomplete="off" aria-label="查找效果" aria-controls="visual-grid"/></label>
    <div class="visual-filters" role="group" aria-label="视觉分类"><button type="button" data-visual-group="all" aria-pressed="true">全部</button>${visualGroups.map(group=>`<button type="button" data-visual-group="${group.id}" aria-pressed="false">${escapeHTML(group.label)}</button>`).join('')}</div>
    <div class="visual-grid" id="visual-grid">${visualEntries.map(entry=>`<button type="button" class="visual-entry" data-visual-id="${entry.id}" data-visual-category="${entry.group}" aria-pressed="false" title="${escapeHTML(entry.note)} · Shift 点击排入下一幕"><strong>${escapeHTML(entry.name)}</strong><small>${escapeHTML(entry.note)}</small></button>`).join('')}</div>
    <p class="visual-empty" hidden>没有匹配的效果。<button type="button" data-clear-search>清空搜索</button></p>
  </section>`;
}

export function matchesVisual(entry:VisualEntry,query:string):boolean {
  const haystack=`${entry.name} ${entry.note} ${entry.id} ${visualGroups.find(group=>group.id===entry.group)?.label}`.toLocaleLowerCase();
  return query.trim().toLocaleLowerCase().split(/\s+/).every(term=>haystack.includes(term));
}
