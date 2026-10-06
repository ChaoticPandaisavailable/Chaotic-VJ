import * as THREE from 'three';
import { gasComposite,gasCompositeGLSL } from '../../../packages/visual-engine/gas-motion.ts';
import { fieldFragment } from '../../../packages/visual-engine/fields.ts';
import { vertex } from '../../../packages/visual-engine/shaders.ts';

/** Development-only GPU checks: optical overlap and undeformed geometry/particle sampling. */
export async function checkFlow(){
  const canvas=document.createElement('canvas'),renderer=new THREE.WebGLRenderer({canvas,powerPreference:'high-performance'});
  const scene=new THREE.Scene(),camera=new THREE.Camera(),geometry=new THREE.PlaneGeometry(2,2),width=128,height=72;
  const target=new THREE.WebGLRenderTarget(width,height,{depthBuffer:false,stencilBuffer:false});
  const optical=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:`varying vec2 vUv;${gasCompositeGLSL}void main(){gl_FragColor=vec4(vec3(compositeGas(vec3(vUv.x,.7,.2),vec3(.25,.8,.45),vUv.y)),1.);}`});
  const mesh=new THREE.Mesh(geometry,optical);mesh.frustumCulled=false;scene.add(mesh);let shaderError='';
  renderer.debug.onShaderError=(gl,_p,vs,fs)=>{shaderError=gl.getShaderInfoLog(fs)||gl.getShaderInfoLog(vs)||'Shader error';};
  const bytes=new Uint8Array(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const n=(y*width+x)*4,v=x>y&&x<y+23?190:12;bytes[n]=bytes[n+1]=bytes[n+2]=v;bytes[n+3]=255;}
  const source=new THREE.DataTexture(bytes,width,height);source.needsUpdate=true;
  const materials:THREE.ShaderMaterial[]=[optical],runs=[];
  const draw=()=>{renderer.setRenderTarget(target);renderer.render(scene,camera);if(shaderError)throw new Error(shaderError);const data=new Uint8Array(bytes.length);renderer.readRenderTargetPixels(target,0,0,width,height,data);return data;};
  try{
    const opticalPixels=draw();let error=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)error=Math.max(error,Math.abs(opticalPixels[(y*width+x)*4]/255-gasComposite([(x+.5)/width,.7,.2],[.25,.8,.45],(y+.5)/height)));
    runs.push({check:'front-to-back opacity',maxError:error,pass:error<.005});
    for(const style of [9,10]){
      const uniforms={uParticles:{value:source},uHistory:{value:source},uNoise:{value:source},uResolution:{value:new THREE.Vector2(width,height)},uComposition:{value:new THREE.Vector4(0,0,0,1)},uGasLayers:{value:Array.from({length:3},()=>new THREE.Vector4())},uGasEvolution:{value:0},uTime:{value:0},uScale:{value:1},uDt:{value:1/60},uMemory:{value:0}};
      const mat=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fieldFragment,defines:{FIELD_STYLE:style},uniforms});materials.push(mat);mesh.material=mat;
      const quiet=draw();for(let i=0;i<3;i++)uniforms.uGasLayers.value[i].set(17-i,3+i,.007,-.006);uniforms.uTime.value=100;uniforms.uGasEvolution.value=200;
      const loud=draw();let changed=0,sourceError=0;for(let i=0;i<loud.length;i+=4){changed+=Number(loud[i]!==quiet[i]);sourceError=Math.max(sourceError,Math.abs(loud[i]-bytes[i]));}
      runs.push({check:style===10?'straight geometry':'particle shape',changed,sourceError,pass:changed===0&&sourceError<=1});
    }
  }finally{source.dispose();geometry.dispose();materials.forEach(m=>m.dispose());target.dispose();renderer.dispose();}
  return runs;
}
