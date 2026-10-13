import workletUrl from './transient-worklet.ts?worker&url';
import type {AudioFeatures,DetectionStatus} from '../shared/config.ts';
import {TransientMailbox} from './transient-detector.ts';

export class TransientTap {
  status:DetectionStatus='starting';
  private node:AudioWorkletNode|null=null;private sink:GainNode|null=null;
  private stopped=false;private sensitivity=.5;
  private mailbox=new TransientMailbox();
  private context:AudioContext;private source:AudioNode;
  constructor(context:AudioContext,source:AudioNode){this.context=context;this.source=source;void this.start().catch(()=>{if(!this.stopped)this.status='fallback';});}
  private async start(){
    await this.context.audioWorklet.addModule(workletUrl);if(this.stopped)return;
    const node=this.node=new AudioWorkletNode(this.context,'chaotic-transient',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
    const sink=this.sink=this.context.createGain();sink.gain.value=0;
    node.onprocessorerror=()=>{this.stop();this.status='fallback';};
    node.port.postMessage({sensitivity:this.sensitivity});
    node.port.onmessage=({data})=>{
      if(this.stopped)return;
      // Drop callbacks delayed by a busy/background UI; never replay old drum hits.
      if(this.mailbox.accept(data,this.context.currentTime))this.status='live';
    };
    this.source.connect(node);node.connect(sink);sink.connect(this.context.destination);
  }
  configure(sensitivity:number){if(sensitivity===this.sensitivity)return;this.sensitivity=sensitivity;this.node?.port.postMessage({sensitivity});}
  apply(features:AudioFeatures){
    if(this.status==='fallback')return features;
    return this.mailbox.apply(features,this.context.currentTime);
  }
  stop(){
    this.stopped=true;
    if(this.node){this.node.port.onmessage=null;this.node.port.close();try{this.source.disconnect(this.node);}catch{}this.node.disconnect();}
    this.sink?.disconnect();this.mailbox=new TransientMailbox();
  }
}
