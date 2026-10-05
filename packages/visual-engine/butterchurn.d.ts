declare module 'butterchurn' {
  interface Visualizer {
    loadPreset(preset:unknown,blendSeconds:number):void;
    setRendererSize(width:number,height:number,options?:Record<string,unknown>):void;
    render(options:{elapsedTime:number;audioLevels:{timeByteArray:Uint8Array;timeByteArrayL:Uint8Array;timeByteArrayR:Uint8Array}}):void;
  }
  const butterchurn:{createVisualizer(context:AudioContext|null,canvas:HTMLCanvasElement,options:{width:number;height:number;pixelRatio:number;textureRatio:number;meshWidth:number;meshHeight:number;outputAA:boolean}):Visualizer};
  export default butterchurn;
}
