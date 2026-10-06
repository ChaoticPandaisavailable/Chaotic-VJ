import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WebSocketServer, WebSocket } from 'ws';
import sharp from 'sharp';
import { configSchema, defaultConfig, scenePresets, emptyDJ, estimateWait, isPaused, type Config, type PhotoRecord, type Transport } from '../../packages/shared/config.ts';
import { PhotoQueue } from './queue.ts';
import { PresetStore } from './preset-store.ts';
import { presetInput } from '../../packages/shared/saved-presets.ts';
import { startDJBridge } from '../../packages/dj-bridge/index.ts';

const root=process.cwd(),runtime=process.env.VJ_DATA_DIR?path.resolve(process.env.VJ_DATA_DIR):path.join(root,'.runtime'),images=path.join(runtime,'images');
await fs.mkdir(images,{recursive:true});
const presets=new PresetStore(path.join(runtime,'presets.json'));await presets.load();
const keyPath=path.join(runtime,'admin-key.txt');
let adminKey=await fs.readFile(keyPath,'utf8').catch(()=> '');
if(!adminKey){adminKey=randomBytes(24).toString('hex');await fs.writeFile(keyPath,adminKey,{mode:0o600});}
const adminSession=randomBytes(32).toString('hex');
let config:Config=structuredClone(defaultConfig);
let transport:Transport={freeze:false,blackout:false,queuePaused:false,clearVersion:0};
const queue=new PhotoQueue(config,transport);
try{const saved=JSON.parse(await fs.readFile(path.join(runtime,'state.json'),'utf8'));config=configSchema.parse(saved.config);if(!saved.config.rhythm)config.renderer.fieldScale=.85;if(!saved.config.field){config.field={...scenePresets[0].field};config.macros={...scenePresets[0].macros};}queue.config=config;queue.restore(saved.photos??[]);}catch{}
let dj=emptyDJ();
let saveChain=Promise.resolve();let saveTimer:ReturnType<typeof setTimeout>|undefined;
function save(){if(saveTimer)return;saveTimer=setTimeout(()=>{saveTimer=undefined;const content=JSON.stringify({config,photos:queue.photos});saveChain=saveChain.then(async()=>{await fs.writeFile(path.join(runtime,'state.next.json'),content);await fs.rename(path.join(runtime,'state.next.json'),path.join(runtime,'state.json'));}).catch(e=>console.error('State persistence:',e.message));},500);}
const app=express();app.disable('x-powered-by');const server=createServer(app);const port=Number(process.env.PORT||5173);
const addresses=Object.entries(os.networkInterfaces()).sort(([a],[b])=>Number(/wlan|wi-fi|ethernet|以太网/i.test(b)&&!b.startsWith('vEthernet'))-Number(/wlan|wi-fi|ethernet|以太网/i.test(a)&&!a.startsWith('vEthernet'))).flatMap(([,entries])=>entries??[]).filter(a=>a.family==='IPv4'&&!a.internal).map(a=>a.address);
const allowedHosts=new Set(['localhost','127.0.0.1','[::1]',...addresses]);
const uploadUrls=addresses.map(a=>`http://${a}:${port}/upload`);
const cookies=(header?:string)=>Object.fromEntries((header??'').split(';').map(s=>s.trim().split('=')));
const local=(req:Request)=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress??'')&&['localhost','127.0.0.1','[::1]'].includes((req.headers.host??'').replace(/:\d+$/,''));
const authenticated=(header?:string)=>cookies(header).vj_admin===adminSession;
const admin=(req:Request,res:Response,next:NextFunction)=>authenticated(req.headers.cookie)?next():res.status(401).json({error:'请先登录管理界面。'});
const adminCookie=(res:Response)=>res.cookie('vj_admin',adminSession,{httpOnly:true,sameSite:'strict',path:'/',maxAge:86400000});
app.use((req,res,next)=>{
  const host=(req.headers.host??'').replace(/:\d+$/,'');
  if(!allowedHosts.has(host))return res.status(403).send('Host not allowed');
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  if(req.path.startsWith('/api')||req.path.startsWith('/media'))res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'&&req.method!=='HEAD'&&(!req.headers['x-vj-request']||(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)))return res.status(403).json({error:'请求来源不匹配。'});
  next();
});
app.use(express.json({limit:'96kb'}));
app.get('/api/bootstrap',(req,res)=>{if(local(req))adminCookie(res);res.json({admin:local(req)||authenticated(req.headers.cookie),local:local(req)});});
const attempts=new Map<string,{count:number;until:number}>();
function limit(key:string,max:number,ms:number){let entry=attempts.get(key);if(!entry||entry.until<Date.now()){entry={count:0,until:Date.now()+ms};attempts.set(key,entry);}return ++entry.count<=max;}
app.post('/api/login',(req,res)=>{if(!limit(`login:${req.socket.remoteAddress}`,8,60000))return res.status(429).json({error:'尝试过多，请一分钟后再试。'});const provided=Buffer.from(String(req.body.key??''));const actual=Buffer.from(adminKey);if(provided.length!==actual.length||!timingSafeEqual(provided,actual))return res.status(401).json({error:'管理密钥不正确。'});adminCookie(res);res.json({ok:true});});
app.get('/api/local-key',admin,(req,res)=>{if(!local(req))return res.sendStatus(403);res.json({key:adminKey});});
app.post('/api/guest',(req,res)=>{let guest=cookies(req.headers.cookie).vj_guest;if(!guest||!/^g_[0-9a-f]{48}$/.test(guest))guest='g_'+randomBytes(24).toString('hex');res.cookie('vj_guest',guest,{httpOnly:true,sameSite:'strict',path:'/',maxAge:86400000});res.json({ok:true});});

type Client={id:string;socket:WebSocket;role:'preview'|'output'|'control';lastFrame:number;ready:boolean};
const clients=new Map<string,Client>();let owner:Client|null=null;
function snapshot(){return {config,transport,photos:queue.photos.filter(p=>p.status!=='Deleted').map(({owner:_,...p})=>({...p,owner:''})),activeId:queue.activeId,ownerId:owner?.id??null,ownerRole:owner?.role??null,ownerReady:!!owner?.ready&&Date.now()-owner.lastFrame<2500,dj,uploadUrls};}
function send(client:Client,value:unknown){if(client.socket.readyState===WebSocket.OPEN)client.socket.send(JSON.stringify(value));}
function broadcast(){const payload=JSON.stringify({type:'snapshot',data:snapshot()});for(const client of clients.values())if(client.socket.readyState===WebSocket.OPEN)client.socket.send(payload);}
function changed(){save();broadcast();}
app.get('/api/state',admin,(_req,res)=>res.json(snapshot()));
app.get('/api/presets',admin,(_req,res)=>res.json(presets.list()));
app.post('/api/presets',admin,async(req,res)=>{
  const parsed=presetInput.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'请填写名称，并检查预设参数。'});
  res.status(201).json(await presets.save(parsed.data));
});
app.put('/api/presets/:id',admin,async(req,res)=>{
  const parsed=presetInput.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'预设名称或参数无效。'});
  const id=String(req.params.id);if(!presets.list().some(p=>p.id===id))return res.status(404).json({error:'预设已不存在，请另存。'});
  res.json(await presets.save(parsed.data,id));
});
app.put('/api/config',admin,(req,res)=>{const result=configSchema.safeParse(req.body);if(!result.success)return res.status(400).json({error:'预设格式或参数范围不正确。',details:result.error.issues.map(i=>i.path.join('.'))});config=result.data;queue.config=config;changed();res.json({ok:true});});
app.post('/api/transport',admin,(req,res)=>{for(const key of ['freeze','blackout','queuePaused'] as const)if(typeof req.body[key]==='boolean')transport[key]=req.body[key];if(req.body.clear===true)transport.clearVersion++;broadcast();res.json({ok:true});});

const cleanPhoto=async(id:string)=>{await Promise.all(['.source','.webp','.thumb.webp'].map(s=>fs.rm(path.join(images,id+s),{force:true}).catch(()=>{})));};
app.delete('/api/photos/:id',admin,async(req,res)=>{const p=queue.get(String(req.params.id));if(!p)return res.sendStatus(404);queue.delete(p.id);changed();await cleanPhoto(p.id);res.json({ok:true});});
app.post('/api/photos/:id/approve',admin,(req,res)=>{queue.approve(String(req.params.id));changed();res.json({ok:true});});
app.get('/media/:file',admin,(req,res)=>{const file=String(req.params.file);const match=/^([0-9a-f-]{36})(\.thumb)?\.webp$/.exec(file);if(!match)return res.sendStatus(404);const p=queue.get(match[1]);if(!p||['Deleted','Processing','Failed'].includes(p.status))return res.sendStatus(404);res.sendFile(path.join(images,file),{dotfiles:'allow'});});

let processing=0;const waiting:string[]=[];
async function processPhoto(id:string){
  const photo=queue.get(id);if(!photo||photo.status!=='Processing'){await cleanPhoto(id);return;}
  try{
    const source=path.join(images,id+'.source');
    const pipeline=sharp(source,{limitInputPixels:40_000_000,animated:false,failOn:'error'}).timeout({seconds:30});const meta=await pipeline.metadata();
    if(!['jpeg','png','webp'].includes(meta.format??''))throw new Error('目前支持 JPEG、PNG、WebP；请将 HEIC 转为 JPEG。');
    const {data,info}=await pipeline.rotate().resize({width:1536,height:1536,fit:'inside',withoutEnlargement:true}).webp({quality:87}).toBuffer({resolveWithObject:true});
    if(queue.get(id)?.status!=='Processing'){await cleanPhoto(id);return;}
    const thumb=await sharp(data).resize({width:256,height:256,fit:'inside'}).webp({quality:75}).toBuffer();
    const stats=await sharp(data).stats();const tiny=await sharp(data).resize(3,1,{fit:'fill'}).removeAlpha().raw().toBuffer();
    const palette=Array.from({length:3},(_,i)=>'#'+tiny.subarray(i*3,i*3+3).toString('hex'));
    await fs.writeFile(path.join(images,id+'.webp'),data);await fs.writeFile(path.join(images,id+'.thumb.webp'),thumb);await fs.rm(source,{force:true});
    if(!queue.ready(id,info.width/info.height,{palette,luminance:stats.channels.slice(0,3).reduce((s,c)=>s+c.mean,0)/765}))await cleanPhoto(id);
  }catch(e){queue.fail(id,e instanceof Error?e.message:'图片处理失败。');await cleanPhoto(id);}finally{changed();}
}
function pump(){while(processing<2&&waiting.length){const id=waiting.shift()!;processing++;void processPhoto(id).finally(()=>{processing--;pump();});}}
app.post('/api/photos',express.raw({type:['image/jpeg','image/png','image/webp','application/octet-stream'],limit:'12mb'}),async(req,res)=>{
  const isAdmin=authenticated(req.headers.cookie),guest=cookies(req.headers.cookie).vj_guest;
  if(!isAdmin&&(!guest||!/^g_[0-9a-f]{48}$/.test(guest)))return res.status(401).json({error:'请刷新上传页后再试。'});
  if(!limit(`upload:${req.socket.remoteAddress}`,isAdmin?150:30,60000))return res.status(429).json({error:'上传过于频繁，请稍后再试。'});
  if(!Buffer.isBuffer(req.body)||!req.body.length)return res.status(400).json({error:'请选择 JPEG、PNG 或 WebP 图片。'});
  if(waiting.length>=30)return res.status(503).json({error:'图片正在处理中，请稍后再试。'});
  let p:PhotoRecord|undefined;
  try{const name=decodeURIComponent(String(req.headers['x-file-name']??'photo'));p=queue.reserve(name,isAdmin?'admin':guest);changed();await fs.writeFile(path.join(images,p.id+'.source'),req.body);if(p.status==='Deleted')await cleanPhoto(p.id);else{waiting.push(p.id);pump();}res.status(202).json({id:p.id,seq:p.seq});}
  catch(e){if(p){queue.fail(p.id,'上传保存失败。');await cleanPhoto(p.id);changed();}res.status(400).json({error:e instanceof Error?e.message:'上传失败。'});}
});
app.get('/api/receipt/:id',(req,res)=>{const p=queue.get(String(req.params.id));const guest=cookies(req.headers.cookie).vj_guest;if(!p||(p.owner!==guest&&!authenticated(req.headers.cookie)))return res.sendStatus(404);const paused=isPaused(transport)||!owner?.ready||Date.now()-(owner?.lastFrame??0)>2500;res.json({seq:p.seq,status:p.status,error:p.error,eta:p.status==='Pending'?null:estimateWait(queue.photos,p.id,config,paused),paused,processing:p.status==='Processing'});});

const wss=new WebSocketServer({noServer:true,maxPayload:65536});
server.on('upgrade',(req,socket,head)=>{if(req.url?.split('?')[0]!=='/ws')return;const host=(req.headers.host??'').replace(/:\d+$/,'');if(!allowedHosts.has(host)||req.headers.origin!==`http://${req.headers.host}`||!authenticated(req.headers.cookie)){socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');socket.destroy();return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));});
wss.on('connection',socket=>{
  const client:Client={id:randomBytes(12).toString('hex'),socket,role:'control',lastFrame:0,ready:false};clients.set(client.id,client);send(client,{type:'welcome',id:client.id});send(client,{type:'snapshot',data:snapshot()});
  socket.on('message',raw=>{try{const message=JSON.parse(raw.toString());
    if(message.type==='claim'&&['preview','output'].includes(message.role)){
      client.role=message.role;
      const stalledPreview=client.role==='preview'&&owner?.role==='preview'&&Date.now()-owner.lastFrame>3500;
      if(!owner||(client.role==='output'&&owner.role!=='output')||stalledPreview){owner=client;client.ready=false;client.lastFrame=Date.now();broadcast();}else send(client,{type:'snapshot',data:snapshot()});
    }
    if(message.type==='release'&&owner===client){owner=null;client.role='control';client.ready=false;broadcast();}
    if(message.type==='stop-audio'&&owner){send(owner,{type:'stop-audio'});return;}
    if(owner!==client)return;
    if(message.type==='audio-features'){
      const incoming=message.features;
      const keys=['rms','bass','mid','high','centroid','flux','onset','kick','snare','hat','peak'];
      if(!incoming||keys.some(key=>typeof incoming[key]!=='number'||!Number.isFinite(incoming[key])||incoming[key]<0||incoming[key]>1))return;
      const features=Object.fromEntries(keys.map(key=>[key,incoming[key]]));
      for(const c of clients.values())if(c!==client)send(c,{type:'audio-features',features});
    }
    if(message.type==='frame'){
      const now=Date.now(),elapsed=client.lastFrame?Math.max(0,(now-client.lastFrame)/1000):0;const wasReady=client.ready,oldId=queue.activeId,oldStatus=oldId?queue.get(oldId)?.status:null;client.lastFrame=now;client.ready=true;
      if(typeof message.id==='string'&&typeof message.delta==='number')queue.advance(message.id,Math.min(message.delta,elapsed+.025));
      if(!wasReady||queue.activeId!==oldId||(oldId&&queue.get(oldId)?.status!==oldStatus))broadcast();save();
    }
    if(message.type==='started'&&typeof message.id==='string'){if(queue.start(message.id)){client.lastFrame=Date.now();client.ready=true;changed();}}
    if(message.type==='failed'&&typeof message.id==='string'){queue.fail(message.id,'输出端无法解码纹理。');changed();}
    if(message.type==='telemetry'){const data=message.data;if(!data||typeof data!=='object')return;for(const c of clients.values())if(c!==client)send(c,{type:'telemetry',data});}
  }catch{send(client,{type:'error',message:'事件格式无效。'});}});
  socket.on('close',()=>{clients.delete(client.id);if(owner===client){owner=null;broadcast();}});
});
setInterval(()=>{queue.expire();for(const [key,e]of attempts)if(e.until<Date.now())attempts.delete(key);broadcast();},1000).unref();
startDJBridge(state=>{dj=state;broadcast();});

if(process.argv.includes('--production')){app.use(express.static(path.join(root,'dist')));app.get('/{*path}',(_req,res)=>res.sendFile(path.join(root,'dist','index.html')));}
else{const {createServer:createVite}=await import('vite');const vite=await createVite({server:{middlewareMode:true,hmr:{server},fs:{allow:[root],deny:['**/.runtime/**','**/.git/**','**/.env*','**/*.{crt,pem}']}}});app.use(vite.middlewares);}
app.use((error:Error&{status?:number},_req:Request,res:Response,_next:NextFunction)=>{console.warn(error.message);res.status(error.status??500).json({error:error.status===413?'图片不能超过 12 MB。':'请求失败，请重试。'});});
server.listen(port,()=>{console.log(`CHAOTIC VJ ready: http://localhost:${port}`);console.log(`Audience: ${uploadUrls.join(' | ')||'尚未检测到 LAN 地址'}`);console.log('Remote admin key: .runtime/admin-key.txt (keep private)');});
