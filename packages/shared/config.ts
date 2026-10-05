import { z } from 'zod';
import { midiSchema } from './midi.ts';
import { maxSceneId, milkdropScenes } from './scene-catalog.ts';
import { colorLookIds } from './palette.ts';

const unit = z.number().finite().min(0).max(1);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const paletteSchema=z.object({ mapping:z.enum(['even','cinematic']).default('even'), colors:z.array(hex).min(3).max(5),background:hex,locked:z.boolean(),photoColorMix:unit,transitionSeconds:z.number().min(0).max(10),brightness:z.number().min(0).max(2),contrast:z.number().min(.3).max(2),saturation:z.number().min(0).max(2),drift:unit });
const moodSchema=z.object({enabled:z.boolean().default(false),warmth:unit.default(.5),richness:unit.default(.45)});
const motionSchema=z.object({enabled:z.boolean(),seconds:z.number().finite().min(45).max(600)});
export const configSchema = z.object({
  schemaVersion: z.literal(1),
  renderer: z.object({ renderScale: z.number().min(0.35).max(1.5), seed: z.number().int().min(0).max(999999), grain: unit, aberration: unit, bloom: unit, adaptive: z.boolean().default(true), fieldScale: z.number().min(.35).max(1).default(1), quality:z.enum(['performance','fine','ultra']).default('fine'), frameRate:z.enum(['display','60','120','144','165']).default('display'),fullscreenUhd:z.boolean().default(true),outputResolution:z.enum(['auto','1080p','1440p','2160p']).default('2160p') }),
  look:z.object({depth:unit.default(.72),shadow:unit.default(.55),light:unit.default(.6),morph:unit.default(.85),chaotic:unit.default(0),lightAngle:unit.default(.35),atmosphere:z.enum(['clouds','ink','nebula','classic']).default('clouds')}).default({depth:.72,shadow:.55,light:.6,morph:.85,chaotic:0,lightAngle:.35,atmosphere:'clouds'}),
  field: z.object({ style: z.number().int().min(0).max(maxSceneId).default(6), gesture: z.enum(['flow','sweep','collision','surge','split','orbit']).default('flow'), amplitude: unit.default(.7), scale: z.number().min(.5).max(3).default(1) }).default({style:6,gesture:'flow',amplitude:.7,scale:1}),
  variation: z.object({
    surface: z.enum(['fluid','dots','pixels','contours','ascii','hanzi']).default('fluid'),
    complexity: unit.default(.72), rotation: z.number().finite().min(-1).max(1).default(0),
    cellSize: z.number().finite().min(4).max(32).default(12),
    transitionSeconds: z.number().finite().min(.3).max(12).default(3),
    autoEvolve: z.boolean().default(false), evolution: unit.default(.35),
    particleForm: unit.default(.33), spread: unit.default(.25),
    roam:z.boolean().default(true),roamAmount:unit.default(.6),compositionSeed:z.number().int().min(0).max(999999).default(0),
  }).default({surface:'fluid',complexity:.72,rotation:0,cellSize:12,transitionSeconds:3,autoEvolve:false,evolution:.35,particleForm:.33,spread:.25,roam:true,roamAmount:.6,compositionSeed:0}),
  colorMood: moodSchema.default({enabled:false,warmth:.5,richness:.45}),
  colorLook:z.enum(colorLookIds).default('free'),
  colorMotion:motionSchema.default({enabled:true,seconds:180}),
  colorRange: z.object({enabled:z.boolean(),warmMin:unit,warmMax:unit,richMin:unit,richMax:unit}).refine(r=>r.warmMin<=r.warmMax&&r.richMin<=r.richMax,'颜色区间的起点不能高于终点').default({enabled:false,warmMin:0,warmMax:1,richMin:0,richMax:1}),
  performance: z.object({enabled:z.boolean(),sceneB:z.number().int().min(0).max(maxSceneId),mix:unit,padTarget:z.enum(['a','b']).default('a')}).default({enabled:false,sceneB:3,mix:0,padTarget:'a'}),
  midi: midiSchema,
  macros: z.object({ energy: unit, chaos: unit, density: unit, memory: unit, fragmentation: unit, photoPresence: unit, motion: unit, morph: unit }),
  rhythm: z.object({impact:unit,ripple:unit,drift:unit,color:unit.default(.4)}).default({impact:.75,ripple:.6,drift:.55,color:.4}),
  modulation: z.object({ bass: unit, mid: unit, high: unit, onset: unit, flux: unit, level: unit, beat: unit }),
  palette:paletteSchema,
  paletteBaseline:z.object({palette:paletteSchema,colorMood:moodSchema,colorLook:z.enum(colorLookIds),colorMotion:motionSchema}).nullable().default(null),
  photos: z.object({ activeForSeconds: z.number().min(2).max(120), fadeInSeconds: z.number().min(0).max(10), fadeOutSeconds: z.number().min(0.2).max(20), maxQueued: z.number().int().min(1).max(300), coverage: z.number().min(0.05).max(0.7), fragments: z.number().int().min(4).max(40), warp: unit, clarity: unit, edgeThreshold: unit, moderation: z.boolean() }),
  tempo: z.object({ bpm: z.number().min(30).max(300), source: z.enum(['internal', 'tap']), anchor: z.number().finite(), offsetMs: z.number().min(-2000).max(2000) }),
});
export type Config = z.infer<typeof configSchema>;
export type Macros = Config['macros'];
export type MacroKey = keyof Macros;
export const defaultConfig: Config = {
  schemaVersion: 1,
  renderer: { renderScale: 1, seed: 1337, grain: .035, aberration: .015, bloom: .14, adaptive: true, fieldScale: 1, quality:'fine', frameRate:'display', fullscreenUhd:true,outputResolution:'2160p' },
  look:{depth:.72,shadow:.55,light:.6,morph:.85,chaotic:0,lightAngle:.35,atmosphere:'clouds'},
  field: { style:6,gesture:'flow',amplitude:.7,scale:1 },
  variation: {surface:'fluid',complexity:.72,rotation:0,cellSize:12,transitionSeconds:3,autoEvolve:false,evolution:.35,particleForm:.33,spread:.25,roam:true,roamAmount:.6,compositionSeed:0},
  colorMood: {enabled:false,warmth:.5,richness:.45},
  colorLook:'free',
  colorMotion: {enabled:true,seconds:180},
  colorRange: {enabled:false,warmMin:0,warmMax:1,richMin:0,richMax:1},
  performance: {enabled:false,sceneB:3,mix:0,padTarget:'a'},
  midi: {bindings:[]},
  macros: { energy: 0.7, chaos: 0.65, density: 0.68, memory: 0.52, fragmentation: 0.35, photoPresence: 0.55, motion: 0.72, morph: 0.35 },
  rhythm: {impact:.75,ripple:.6,drift:.55,color:.4},
  modulation: { bass: 0.7, mid: 0.4, high: 0.5, onset: 0.65, flux: 0.5, level: 0.6, beat: 0.2 },
  paletteBaseline:null,
  palette: { mapping:'even', colors: ['#08090c', '#343943', '#aca89f', '#f1ebdd'], background: '#08090c', locked: true, photoColorMix: 0, transitionSeconds: 2, brightness: 1, contrast: 1.12, saturation: 0.9, drift: 0.14 },
  photos: { activeForSeconds: 15, fadeInSeconds: 2, fadeOutSeconds: 3, maxQueued: 100, coverage: 0.27, fragments: 16, warp: 0.4, clarity: 0.6, edgeThreshold: 0.25, moderation: false },
  tempo: { bpm: 120, source: 'internal', anchor: 0, offsetMs: 0 },
};
export const scenePresets = [
  { name: '原生混沌', label: '01 / CHAOS', note: '原始形态 · 多层卷曲',field:{style:6,gesture:'flow',amplitude:.65,scale:1},macros:{energy:.68,chaos:.78,density:.72,memory:.66,fragmentation:.4,photoPresence:.55,motion:.62,morph:.4}},
  { name: '体积风暴', label: '02 / STORM', note: '深层云体 · 环流涌动',field:{style:7,gesture:'flow',amplitude:.48,scale:1.2},macros:{energy:.64,chaos:.7,density:.64,memory:.4,fragmentation:.35,photoPresence:.55,motion:.5,morph:.5}},
  { name: '弦流云幕', label: '03 / STRINGS', note: '高维灵感 · 空间交织',field:{style:8,gesture:'orbit',amplitude:.26,scale:1.68},macros:{energy:.68,chaos:.46,density:.58,memory:.38,fragmentation:.46,photoPresence:.55,motion:.29,morph:.44}},
  { name: '粒子花云', label: '04 / NEBULA', note: '薄纱环面 · 空间折叠',field:{style:9,gesture:'flow',amplitude:.35,scale:1},macros:{energy:.62,chaos:.5,density:.64,memory:.25,fragmentation:.2,photoPresence:.55,motion:.42,morph:.45}},
  { name: '几何叠影', label: '05 / FACETS', note: '悬浮切面 · 半色调织纹',field:{style:10,gesture:'flow',amplitude:.3,scale:1},macros:{energy:.62,chaos:.45,density:.58,memory:.22,fragmentation:.28,photoPresence:.55,motion:.38,morph:.4}},
  { name: '液态洪流', label: '01 / TORRENT', note: '液体褶皱 · 细线高光',field:{style:0,gesture:'sweep',amplitude:.45,scale:1.15},macros:{energy:.7,chaos:.68,density:.72,memory:.52,fragmentation:.22,photoPresence:.55,motion:.76,morph:.3}},
  { name: '细胞脉冲', label: '02 / ORGANISM', note: '薄膜细胞 · 暗腔呼吸',field:{style:1,gesture:'collision',amplitude:.42,scale:1.25},macros:{energy:.68,chaos:.48,density:.7,memory:.38,fragmentation:.2,photoPresence:.55,motion:.65,morph:.4}},
  { name: '晶面裂变', label: '03 / PRISM', note: '矿物晶面 · 留白切片',field:{style:2,gesture:'flow',amplitude:.32,scale:1.3},macros:{energy:.8,chaos:.5,density:.7,memory:.35,fragmentation:.78,photoPresence:.55,motion:.7,morph:.78}},
  { name: '磁流丝带', label: '04 / RIBBON', note: '平行丝带 · 曲面光泽',field:{style:3,gesture:'sweep',amplitude:.48,scale:1.15},macros:{energy:.75,chaos:.75,density:.75,memory:.55,fragmentation:.26,photoPresence:.55,motion:.8,morph:.56}},
  { name: '深空涡旋', label: '05 / VORTEX', note: '星云旋臂 · 细尘深空',field:{style:4,gesture:'surge',amplitude:.38,scale:1.05},macros:{energy:.82,chaos:.7,density:.7,memory:.6,fragmentation:.3,photoPresence:.55,motion:.8,morph:.5}},
  { name: '断层风暴', label: '06 / RIFT', note: '层叠岩面 · 沉积切线',field:{style:5,gesture:'split',amplitude:.4,scale:1.15},macros:{energy:.88,chaos:.85,density:.65,memory:.35,fragmentation:.85,photoPresence:.55,motion:.85,morph:.9}},
  ...milkdropScenes.map(p=>({name:p.name,label:p.label,note:p.note,field:{style:p.style,gesture:'flow' as const,amplitude:.3,scale:1},macros:{energy:.6,chaos:.5,density:.6,memory:.3,fragmentation:.2,photoPresence:.55,motion:.5,morph:.5}})),
] satisfies {name:string;label:string;note:string;macros:Macros;field:Config['field']}[];

/** Primary scenes reopen in their original continuous expression, preserving the current palette. */
export function applyScenePreset(config:Config,preset:typeof scenePresets[number]){
  config.macros={...preset.macros};config.field={...preset.field};
  if(preset.field.style>=6&&preset.field.style<=8){
    config.variation={...config.variation,surface:'fluid',complexity:defaultConfig.variation.complexity,rotation:0,autoEvolve:false};
  }
}

export interface Transport { freeze: boolean; blackout: boolean; queuePaused: boolean; clearVersion: number }
export type PhotoStatus = 'Processing' | 'Pending' | 'Queued' | 'Active' | 'Fading' | 'Done' | 'Deleted' | 'Failed';
export interface PhotoRecord { id: string; seq: number; name: string; status: PhotoStatus; receivedAt: number; age: number; aspect: number; owner: string; error?: string; palette?: string[]; luminance?: number }
export interface AudioFeatures { rms: number; bass: number; mid: number; high: number; centroid: number; flux: number; onset: number; kick:number; peak: number }
export const silentFeatures = (): AudioFeatures => ({ rms: 0, bass: 0, mid: 0, high: 0, centroid: 0, flux: 0, onset: 0, kick:0, peak: 0 });
export interface DJState { source: 'osc' | 'os2l' | null; connected: boolean; receivedAt: number | null; deckId: number | null; currentBpm: number | null; originalBpm: number | null; beatPosition: number | null; beatPhase: number | null; beatInBar: number | null }
export const emptyDJ = (): DJState => ({ source: null, connected: false, receivedAt: null, deckId: null, currentBpm: null, originalBpm: null, beatPosition: null, beatPhase: null, beatInBar: null });
export interface Snapshot { config: Config; transport: Transport; photos: PhotoRecord[]; activeId: string | null; ownerId: string | null; ownerRole?:'preview'|'output'|'control'|null; ownerReady: boolean; dj: DJState; uploadUrls: string[] }
export function clamp(n: number, lo = 0, hi = 1) { return Math.min(hi, Math.max(lo, n)); }
export function smoothstep(lo: number, hi: number, v: number) { const x = hi === lo ? Number(v >= hi) : clamp((v - lo) / (hi - lo)); return x * x * (3 - 2 * x); }
export function photoEnvelope(age: number, settings: Config['photos']) { return smoothstep(0, settings.fadeInSeconds, age) * (1 - smoothstep(settings.activeForSeconds, settings.activeForSeconds + settings.fadeOutSeconds, age)); }
export function isPaused(transport: Transport) { return transport.freeze || transport.blackout || transport.queuePaused; }
export function estimateWait(photos: PhotoRecord[], id: string, config: Config, paused: boolean): number | null {
  if (paused) return null;
  let wait = 0;
  const duration = config.photos.activeForSeconds + config.photos.fadeOutSeconds;
  for (const p of photos) {
    if (p.id === id) return wait;
    if (['Processing', 'Queued', 'Active', 'Fading'].includes(p.status)) wait += Math.max(0, duration - p.age);
  }
  return wait;
}
