import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { request as httpRequest } from 'node:http';
import sharp from 'sharp';
import { WebSocket } from 'ws';
import { silentFeatures, type Snapshot } from '../packages/shared/config.ts';
import { maxSceneId } from '../packages/shared/scene-catalog.ts';

const port=5193,base=`http://localhost:${port}`,testDir=path.resolve(`.runtime/integration-test-${Date.now()}`);
let processHandle:ChildProcess,cookie='',guest='',png:Buffer;
const headers={'X-VJ-Request':'1'};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function req(route:string,method='GET',body?:unknown,auth=cookie){return fetch(base+route,{method,headers:{...headers,Cookie:auth,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});}
async function state(){return (await req('/api/state')).json()as Promise<Snapshot>;}
async function until<T>(fn:()=>Promise<T|false>,ms=8000):Promise<T>{const end=Date.now()+ms;while(Date.now()<end){const r=await fn();if(r!==false)return r;await sleep(50);}throw new Error('Timed out');}
async function submit(){const r=await fetch(base+'/api/photos',{method:'POST',headers:{...headers,Cookie:guest,'Content-Type':'image/png','X-File-Name':'fixture.png'},body:png as unknown as BodyInit});assert.equal(r.status,202);return (await r.json()).id as string;}
function ws(){const socket=new WebSocket(`ws://localhost:${port}/ws`,{headers:{Cookie:cookie,Origin:base}});let id='';socket.on('message',b=>{const m=JSON.parse(b.toString());if(m.type==='welcome')id=m.id;});return {socket,get id(){return id;}};}
before(async()=>{
  await fs.mkdir(testDir,{recursive:true});
  processHandle=spawn(process.execPath,['--import','tsx','apps/upload-server/index.ts','--production'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),VJ_DATA_DIR:testDir},stdio:'pipe',windowsHide:true});
  let logs='';processHandle.stderr?.on('data',chunk=>{logs+=chunk.toString();});
  try{await until(async()=>{try{return (await fetch(base+'/api/bootstrap')).ok;}catch{return false;}},15000);}catch(e){throw new Error(String(e)+' '+logs);}
  const bootstrap=await fetch(base+'/api/bootstrap');cookie=bootstrap.headers.get('set-cookie')!.split(';')[0];
  const session=await req('/api/guest','POST',{},'');guest=session.headers.get('set-cookie')!.split(';')[0];
  png=await sharp({create:{width:64,height:48,channels:3,background:'#da7a47'}}).png().toBuffer();
});
after(async()=>{processHandle?.kill();await sleep(250);});

test('audience has no admin read/delete/config/media access; csrf and host checks reject',async()=>{
  assert.equal((await req('/api/state','GET',undefined,guest)).status,401);
  assert.equal((await req('/api/config','PUT',{},guest)).status,401);
  assert.equal((await req('/api/presets','GET',undefined,guest)).status,401);
  assert.equal((await req('/api/presets','POST',{},guest)).status,401);
  assert.equal((await req('/api/photos/not-an-id','DELETE',undefined,guest)).status,401);
  assert.equal((await fetch(base+'/api/transport',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{"blackout":true}'})).status,403);
  const hostStatus=await new Promise<number|undefined>((resolve,reject)=>{const r=httpRequest(base+'/api/bootstrap',{headers:{Host:'untrusted.example'}},response=>{response.resume();resolve(response.statusCode);});r.on('error',reject);r.end();});
  assert.equal(hostStatus,403);
});

test('preset API validates, saves and updates complete creative settings without altering the live configuration',async()=>{
  const live=(await state()).config,c=structuredClone(live);c.look.chaotic=.84;c.look.lightAngle=.28;c.palette.mapping='cinematic';c.palette.colors=['#fcfcfc','#bbccbb','#3d775e','#254638','#123123'];
  c.music={amount:.85,impact:.6,flow:.9,detail:.3,section:'build',releaseId:2,delayMs:70};
  assert.equal((await req('/api/presets','POST',{name:'',config:c})).status,400);
  const response=await req('/api/presets','POST',{name:'我的雪松',config:c});assert.equal(response.status,201);const saved=await response.json();
  assert.deepEqual(saved.config,c);assert.deepEqual((await state()).config,live);
  c.look.chaotic=.5;assert.equal((await req(`/api/presets/${saved.id}`,'PUT',{name:'雪松半密',config:c})).status,200);
  const entries=await(await req('/api/presets')).json();assert.equal(entries.filter((p:{id:string})=>p.id===saved.id).length,1);assert.deepEqual(entries.find((p:{id:string})=>p.id===saved.id).config,c);
});
test('Sharp accepts PNG, creates bounded WebP/thumbnail, exposes status only to owning guest; delete purges files',async()=>{
  const id=await submit();await until(async()=>{const p=(await state()).photos.find(p=>p.id===id);return p?.status==='Queued'?p:false;});
  assert.equal((await req(`/media/${id}.webp`,'GET',undefined,guest)).status,401);
  const media=await req(`/media/${id}.webp`);assert.equal(media.status,200);const metadata=await sharp(Buffer.from(await media.arrayBuffer())).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.width,64);
  assert.equal((await req(`/api/receipt/${id}`,'GET',undefined,guest)).status,200);
  assert.equal((await req(`/api/receipt/${id}`,'GET',undefined,'')).status,404);
  assert.equal((await req(`/api/photos/${id}`,'DELETE')).status,200);assert.equal((await req(`/media/${id}.webp`)).status,404);
  assert.equal((await fs.readdir(path.join(testDir,'images'))).some(f=>f.startsWith(id)),false);
});
test('one scheduler lease: output supersedes preview, second output cannot race the active clock',async()=>{
  const id=await submit();await until(async()=>{return (await state()).photos.find(p=>p.id===id)?.status==='Queued';});
  const preview=ws(),output=ws(),other=ws();await until(async()=>preview.id&&output.id&&other.id?true:false);
  preview.socket.send(JSON.stringify({type:'claim',role:'preview'}));await until(async()=>(await state()).ownerId===preview.id);
  output.socket.send(JSON.stringify({type:'claim',role:'output'}));await until(async()=>(await state()).ownerId===output.id);
  other.socket.send(JSON.stringify({type:'claim',role:'output'}));await sleep(100);assert.equal((await state()).ownerId,output.id);
  preview.socket.send(JSON.stringify({type:'started',id}));await sleep(100);assert.equal((await state()).activeId,null);
  output.socket.send(JSON.stringify({type:'started',id}));await until(async()=>(await state()).activeId===id);
  await sleep(150);output.socket.send(JSON.stringify({type:'frame',id,delta:.1}));await until(async()=>((await state()).photos.find(p=>p.id===id)?.age??0)>0);
  await req('/api/transport','POST',{freeze:true});const age=(await state()).photos.find(p=>p.id===id)!.age;
  await sleep(150);output.socket.send(JSON.stringify({type:'frame',id,delta:.1}));await sleep(80);assert.equal((await state()).photos.find(p=>p.id===id)!.age,age);
  await req(`/api/photos/${id}`,'DELETE');output.socket.send(JSON.stringify({type:'started',id}));await sleep(80);assert.equal((await state()).activeId,null);assert.equal((await state()).photos.some(p=>p.id===id),false);
  await req('/api/transport','POST',{freeze:false});preview.socket.close();output.socket.close();other.socket.close();
});
test('invalid image fails processing without blocking the following upload',async()=>{
  const bad=await fetch(base+'/api/photos',{method:'POST',headers:{...headers,Cookie:guest,'Content-Type':'image/png','X-File-Name':'invalid.png'},body:'not an image'});const badId=(await bad.json()).id;
  const next=await submit();await until(async()=>{const s=await state();return s.photos.find(p=>p.id===badId)?.status==='Failed'&&s.photos.find(p=>p.id===next)?.status==='Queued';});
  await req(`/api/photos/${badId}`,'DELETE');await req(`/api/photos/${next}`,'DELETE');
});

test('a stalled preview releases priority to a live preview, while an output retains its lease',async()=>{
  const a=ws(),b=ws();await until(async()=>a.id&&b.id?true:false);
  try{
    a.socket.send(JSON.stringify({type:'claim',role:'preview'}));await until(async()=>(await state()).ownerId===a.id);
    assert.equal((await state()).ownerRole,'preview');
    b.socket.send(JSON.stringify({type:'claim',role:'preview'}));await sleep(80);assert.equal((await state()).ownerId,a.id);
    await sleep(3550);b.socket.send(JSON.stringify({type:'claim',role:'preview'}));await until(async()=>(await state()).ownerId===b.id);
    a.socket.send(JSON.stringify({type:'claim',role:'output'}));await until(async()=>(await state()).ownerId===a.id);
    assert.equal((await state()).ownerRole,'output');
    b.socket.send(JSON.stringify({type:'claim',role:'preview'}));await sleep(80);assert.equal((await state()).ownerId,a.id);
  }finally{a.socket.close();b.socket.close();}
});

test('variation and colour macro settings round trip while scene changes preserve palette',async()=>{
  const original=(await state()).config,c=structuredClone(original);c.variation.surface='hanzi';c.variation.autoEvolve=true;c.variation.rotation=-.35;c.colorMood={enabled:true,warmth:.81,richness:.24};c.field.style=9;
  c.performance={enabled:true,sceneB:4,mix:.45,padTarget:'b'};c.colorRange={enabled:true,warmMin:.25,warmMax:.9,richMin:.1,richMax:.6};c.midi.bindings=[{target:'mix',kind:'cc',channel:1,number:74,mode:'relative1',min:.1,max:.8,pickup:true}];
  c.renderer.quality='ultra';c.renderer.frameRate='144';c.look.depth=.63;c.variation.compositionSeed=723;c.variation.roam=false;c.colorLook='dusk';
  assert.equal((await req('/api/config','PUT',c)).status,200);
  let actual=(await state()).config;assert.deepEqual(actual.variation,c.variation);assert.deepEqual(actual.colorMood,c.colorMood);assert.deepEqual(actual.palette,c.palette);
  assert.deepEqual(actual.performance,c.performance);assert.deepEqual(actual.colorRange,c.colorRange);assert.deepEqual(actual.midi,c.midi);
  assert.equal(actual.renderer.quality,'ultra');assert.equal(actual.renderer.frameRate,'144');assert.deepEqual(actual.look,c.look);assert.equal(actual.colorLook,'dusk');
  c.field.style=10;assert.equal((await req('/api/config','PUT',c)).status,200);actual=(await state()).config;assert.deepEqual(actual.colorMood,c.colorMood);assert.deepEqual(actual.palette,c.palette);
  c.field.style=maxSceneId;c.performance.sceneB=maxSceneId;c.midi.bindings[0].target=`scene:${maxSceneId}`;
  assert.equal((await req('/api/config','PUT',c)).status,200);actual=(await state()).config;
  assert.equal(actual.field.style,maxSceneId);assert.equal(actual.performance.sceneB,maxSceneId);assert.deepEqual(actual.midi,c.midi);
  assert.equal((await req('/api/config','PUT',{...c,variation:{...c.variation,surface:'invalid'}})).status,400);
  await req('/api/config','PUT',original);
});

test('fast audio channel forwards only validated owner features without unrelated payload',async()=>{
  const owner=ws(),preview=ws(),received:unknown[]=[];
  preview.socket.on('message',raw=>{const message=JSON.parse(raw.toString());if(message.type==='audio-features')received.push(message.features);});
  try{
    await until(async()=>owner.id&&preview.id?true:false);
    owner.socket.send(JSON.stringify({type:'claim',role:'output'}));await until(async()=>(await state()).ownerId===owner.id);
    preview.socket.send(JSON.stringify({type:'audio-features',features:silentFeatures()}));
    owner.socket.send(JSON.stringify({type:'audio-features',features:{...silentFeatures(),hat:5}}));
    await sleep(60);assert.equal(received.length,0);
    const features={...silentFeatures(),kick:.8,hat:.4};
    owner.socket.send(JSON.stringify({type:'audio-features',features:{...features,extra:'not forwarded'}}));
    await until(async()=>received.length===1);assert.deepEqual(received[0],features);
  }finally{owner.socket.close();preview.socket.close();}
});
