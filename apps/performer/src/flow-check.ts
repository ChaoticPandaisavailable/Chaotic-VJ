import * as THREE from 'three';
import { MaterialFlow,materialFlowGLSL,transportPoint } from '../../../packages/visual-engine/material-flow.ts';
import { vertex } from '../../../packages/visual-engine/shaders.ts';
import { defaultConfig } from '../../../packages/shared/config.ts';

/** Development-only GPU parity and area checks after prolonged loud input. */
export async function checkFlow(){
  const canvas=document.createElement('canvas'),renderer=new THREE.WebGLRenderer({canvas,powerPreference:'high-performance'});
  const scene=new THREE.Scene(),camera=new THREE.Camera(),geometry=new THREE.PlaneGeometry(2,2);
  const width=320,height=180,aspect=width/height;
  const target=new THREE.WebGLRenderTarget(width,height,{type:THREE.FloatType,depthBuffer:false,stencilBuffer:false});
  const material=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:`varying vec2 vUv;${materialFlowGLSL}void main(){vec2 p=transportMaterial((vUv-.5)*vec2(${aspect},1.));gl_FragColor=vec4(p,step(length(p),.14),1.);}`,uniforms:{uTransport:{value:Array.from({length:3},()=>new THREE.Vector4())}}});
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);
  const runs=[];let shaderError='';renderer.debug.onShaderError=(gl,_p,vs,fs)=>{shaderError=gl.getShaderInfoLog(fs)||gl.getShaderInfoLog(vs)||'Shader error';};
  try{
    if(!renderer.getContext().getExtension('EXT_color_buffer_float'))throw new Error('GPU 检查需要浮点渲染目标');
    for(const hz of [30,60,144]){
      const flow=new MaterialFlow();flow.reset(1337);let elapsed=0;
      for(const seconds of [0,60,600,1800]){
        for(let frame=0;frame<Math.round((seconds-elapsed)*hz);frame++)flow.update(1/hz,{kick:1,strike:1,spark:1,gain:1,impact:1,flow:1,detail:1,shear:1,pressure:1,release:1,activity:1},defaultConfig);
        elapsed=seconds;for(let i=0;i<3;i++)material.uniforms.uTransport.value[i].fromArray(flow.layers[i]);
        renderer.setRenderTarget(target);renderer.render(scene,camera);
        if(shaderError)throw new Error(shaderError);
        const pixels=new Float32Array(width*height*4);renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
        let maxError=0,area=0;
        for(let y=0;y<height;y++)for(let x=0;x<width;x++){
          const i=(y*width+x)*4,expected=transportPoint(((x+.5)/width-.5)*aspect,(y+.5)/height-.5,flow.layers);
          maxError=Math.max(maxError,Math.hypot(pixels[i]-expected[0],pixels[i+1]-expected[1]));area+=pixels[i+2];
        }
        const ratio=area/(Math.PI*.14**2*height**2);
        runs.push({hz,seconds,maxError,areaRatio:ratio,pass:maxError<.00002&&Math.abs(ratio-1)<.025});
        await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      }
    }
  }finally{geometry.dispose();material.dispose();target.dispose();renderer.dispose();}
  return runs;
}
