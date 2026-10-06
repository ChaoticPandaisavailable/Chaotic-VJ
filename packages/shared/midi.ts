import { z } from 'zod';
import { sceneCount } from './scene-catalog.ts';

const unit=z.number().finite().min(0).max(1);
export const midiTargets=[...Array.from({length:sceneCount},(_,i)=>`scene:${i}` as const),'mix','warmth','richness','energy','chaos','density','motion','morph','complexity','rotation','shuffle:next','shuffle','music:amount','music:impact','music:flow','music:detail','section:steady','section:build','section:release'] as const;
export const isMidiTrigger=(target:string)=>target==='shuffle:next'||target.startsWith('scene:')||target.startsWith('section:');
export const midiBindingSchema=z.object({
  target:z.enum(midiTargets),kind:z.enum(['note','cc']),channel:z.number().int().min(1).max(16),number:z.number().int().min(0).max(127),
  mode:z.enum(['absolute','relative1','relative2','relative3']).default('absolute'),
  min:unit.default(0),max:unit.default(1),pickup:z.boolean().default(true),
});
export const midiSchema=z.object({bindings:z.array(midiBindingSchema).max(32).default([])}).default({bindings:[]});
export type MidiBinding=z.infer<typeof midiBindingSchema>;
export type MidiTarget=typeof midiTargets[number];
export type MidiSignal={kind:'note'|'cc';channel:number;number:number;value:number;pressed:boolean};
export function decodeMidi(data:ArrayLike<number>):MidiSignal|null{
  if(data.length<3)return null;
  const type=data[0]&0xf0,value=data[2];
  if(![0x80,0x90,0xb0].includes(type)||data[1]>127||value>127)return null;
  return {kind:type===0xb0?'cc':'note',channel:(data[0]&15)+1,number:data[1],value,pressed:type===0x90&&value>0};
}
export function relativeDelta(value:number,mode:MidiBinding['mode']){
  // MiniLab MkII manual §4.8.4.1: all relative modes interleave a neutral 00.
  if(mode==='relative1')return value>=61&&value<=67?value-64:0;
  if(mode==='relative2')return value>=125?value-128:value>=1&&value<=3?value:0;
  if(mode==='relative3')return value>=13&&value<=19?value-16:0;
  return 0;
}
export const unitClamp=(value:number)=>Math.max(0,Math.min(1,value));
/** Per-binding pickup state is local to the receiving console, never serialized. */
export class MidiControl {
  private caught=false;
  private previous:number|null=null;
  private sent:number|null=null;
  value(signal:MidiSignal,binding:MidiBinding,current:number):number|null{
    if(signal.kind!==binding.kind||signal.channel!==binding.channel||signal.number!==binding.number)return null;
    if(isMidiTrigger(binding.target)){
      const high=signal.kind==='note'?signal.pressed:signal.value>=64;
      const trigger=high&&!this.caught;this.caught=high;return trigger?1:null;
    }
    if(signal.kind!=='cc')return null;
    const low=Math.min(binding.min,binding.max),high=Math.max(binding.min,binding.max),span=binding.max-binding.min;
    if(binding.mode!=='absolute'){
      const delta=relativeDelta(signal.value,binding.mode);
      return delta===0?null:Math.max(low,Math.min(high,current+delta*span/127));
    }
    const next=binding.min+signal.value/127*span;
    // Re-arm if a mouse, preset or another console moves the target away from this encoder.
    if(this.sent!==null&&Math.abs(current-this.sent)>.025){this.caught=false;this.previous=null;this.sent=null;}
    const pickupAt=Math.max(low,Math.min(high,current));
    if(!binding.pickup||Math.abs(next-pickupAt)<=Math.max(.015,Math.abs(span)/127)||
      (this.previous!==null&&(this.previous-pickupAt)*(next-pickupAt)<=0))this.caught=true;
    this.previous=next;
    if(!this.caught)return null;
    this.sent=next;return next;
  }
}
