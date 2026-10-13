/** Original audible fixture. The visual receives only the resulting PCM, never this schedule. */
export function diagnosticSignal(rate:number){
  const pcm=new Float32Array(rate*18);
  for(let i=0;i<pcm.length;i++){
    const t=i/rate,age=t%.5;
    const bass=(t<4||t>=8&&t<16)?(t<4?.15:.4)*Math.sin(2*Math.PI*83*t)*Math.min(1,t/.4):0;
    const kick=t>=4&&t<12?(t<8?.4:.12)*Math.sin(2*Math.PI*(46*age+7*(1-Math.exp(-age*35))))*Math.exp(-age*18):0;
    pcm[i]=bass+kick;
  }
  return pcm;
}
export function diagnosticPhase(seconds:number){const t=seconds%18;return t<4?'只有 Bass':t<8?'只有 Kick':t<12?'强 Bass + 轻 Kick':t<16?'只有 Bass':'静音';}
