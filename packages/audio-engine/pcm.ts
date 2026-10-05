export interface PcmFrame { samples:Float32Array; sampleRate:number }
/** Butterchurn's null-context analyser assumes 44.1 kHz; resample the newest window accordingly. */
export function pcmBytes(frame:PcmFrame|null|undefined,out:Uint8Array){
  if(!frame||!Number.isFinite(frame.sampleRate)||frame.sampleRate<=0){out.fill(128);return out;}
  const ratio=frame.sampleRate/44100,start=frame.samples.length-1-(out.length-1)*ratio;
  for(let i=0;i<out.length;i++){
    const at=start+i*ratio,left=Math.floor(at),fraction=at-left;
    const a=frame.samples[left]??0,b=frame.samples[left+1]??a;
    const sample=fraction===0?a:a+(b-a)*fraction;
    out[i]=Number.isFinite(sample)?Math.round(Math.max(0,Math.min(255,128+sample*127))):128;
  }
  return out;
}
