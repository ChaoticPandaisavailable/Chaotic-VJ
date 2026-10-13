import {TransientDetector} from './transient-detector.ts';
declare const sampleRate:number,currentTime:number;
declare class AudioWorkletProcessor {readonly port:MessagePort;}
declare function registerProcessor(name:string,processor:typeof AudioWorkletProcessor):void;

class TransientProcessor extends AudioWorkletProcessor {
  private detector=new TransientDetector(sampleRate);
  private elapsed=0;private previousEvent=0;
  constructor(){super();this.port.onmessage=({data})=>{if(Number.isFinite(data?.sensitivity))this.detector.sensitivity=data.sensitivity;};}
  process(inputs:Float32Array[][],outputs:Float32Array[][]){
    // This branch is an analysis tap; never play the captured desktop audio back.
    for(const channel of outputs[0]??[])channel.fill(0);
    const channels=inputs[0];if(!channels?.length)return true;
    const reading=this.detector.process(channels[0],channels[1]??channels[0]);
    this.elapsed+=channels[0].length/sampleRate;
    if(this.elapsed>=1/60||reading.eventId!==this.previousEvent){
      this.port.postMessage({...reading,audioTime:currentTime});this.elapsed=0;this.previousEvent=reading.eventId;
    }
    return true;
  }
}
registerProcessor('chaotic-transient',TransientProcessor);
