import QRCode from 'qrcode';
import { VisualEngine } from '../../../packages/visual-engine/index.ts';
import { DesktopAudioSource } from '../../../packages/audio-engine/index.ts';
import { configSchema, defaultConfig, scenePresets, applyScenePreset, silentFeatures, isPaused, estimateWait, type Config, type Snapshot, type MacroKey, type AudioFeatures } from '../../../packages/shared/config.ts';
import { api, toast, escapeHTML, upload, duration, download } from './api.ts';
import { PhotoCache } from './photo-cache.ts';
import { mountVariations } from './variations-ui.ts';
import { mountMidi } from './midi-ui.ts';
import { milkdropScenes, originalSceneCount } from '../../../packages/shared/scene-catalog.ts';
import { mountPresetLibrary } from './preset-library.ts';
import { capturePalette,editablePalette,rememberPalette,resetPalette,type PaletteSettings } from '../../../packages/shared/palette-editing.ts';
import { outputSize,selectedOutputSize } from '../../../packages/shared/quality.ts';
import { FramePacer, renderPolicy } from '../../../packages/shared/render-policy.ts';
import { colorCue } from '../../../packages/shared/color-motion.ts';

const resolutionOptions='<option value="auto">输出 · 自动</option><option value="1080p">输出 · 1920 × 1080</option><option value="1440p">输出 · 2560 × 1440</option><option value="2160p">输出 · 3840 × 2160</option>';
const atmospheres=[['clouds','云海风暴'],['ink','水墨山海'],['nebula','熔流星云'],['classic','经典卷曲']] as const;
const macroLabels:Record<MacroKey,[string,string]>={energy:['Energy','能量'],chaos:['Chaos','扭曲'],density:['Density','密度'],memory:['Memory','残影'],fragmentation:['Fragmentation','碎裂'],photoPresence:['Photo presence','照片'],motion:['Motion','流速'],morph:['Morph','形态']};
const statusLabels:Record<string,string>={Processing:'处理中',Pending:'待审核',Queued:'排队中',Active:'正在呈现',Fading:'消散中',Done:'已结束',Failed:'失败'};
type Telemetry={features:AudioFeatures;source:string;fps:number;gpu:string;resolution:string;fieldResolution:string;gpuMs:number|null;cpuMs:number;rafHz:number;error:string|null;colorPhase?:number;colorCue?:string};
const slider=(id:string,label:string,min:number,max:number,step:number,value:number)=>`<label class="setting"><span>${label}<output data-value="${id}">${value}</output></span><input aria-label="${label}" data-setting="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"/></label>`;
const sceneButton=(p:typeof scenePresets[number],i:number)=>`<button data-scene="${i}" class="scene" title="${escapeHTML(p.note+(milkdropScenes.find(s=>s.style===p.field.style)?' · '+milkdropScenes.find(s=>s.style===p.field.style)!.preset:''))}" aria-pressed="false"><strong>${p.name}</strong></button>`;

export function startPerformer(app:HTMLDivElement,output:boolean,local:boolean,initial:Snapshot){
  // Controls cannot write defaults before the first WebSocket snapshot has arrived.
  let state:Snapshot=structuredClone(initial);
  let id='',connected=false,socket:WebSocket|null=null,configTimer:ReturnType<typeof setTimeout>|undefined,configBusy=false,configDirty=false,ignoreConfigUntil=0;
  let remote:Telemetry|null=null,activeId:string|null=null,localAge=0,reportedDelta=0,lastFrame=performance.now(),lastReport=0,lastTelemetry=0,frames=0,fps=0,fpsAt=performance.now(),drawn=false;
  let paletteUndo:PaletteSettings|null=null;
  let queueHTML='',lastClearClaim=0,tapTimes:number[]=[],recording=false,abortRecording=false,lastRaf=performance.now();
  const framePacer=new FramePacer();
  let rafFrames=0,rafHz=0,cpuMs=0,lastControls='',localTelemetry:Telemetry|null=null,remoteAt=0;
  const audio=new DesktopAudioSource(),cache=new PhotoCache();
  let variationsUI:ReturnType<typeof mountVariations>|null=null;
  let midiUI:ReturnType<typeof mountMidi>|null=null;
  const controlTop=`<button data-action="save" class="mobile-save" title="保存预设">保存</button><button data-action="desktop" class="primary"><span class="audio-icon">≋</span> 连接桌面音频</button><button data-action="output" class="outline">独立输出 ↗</button>`;
  app.innerHTML=output?`<main class="output-stage"><canvas id="visual" aria-label="实时生成视觉输出"></canvas><div class="output-tools" role="toolbar" aria-label="输出控制"><div class="output-actions"><span>CHAOTIC / OUTPUT</span><button data-action="desktop">连接桌面音频</button><button data-action="file">本地音乐</button><button data-action="stop-audio">停止音频</button><button data-action="fullscreen" class="primary">进入全屏 ↗</button><select id="output-resolution" aria-label="输出分辨率">${resolutionOptions}</select><button data-action="hide-tools" aria-label="隐藏输出控制">×</button></div><div class="output-readout"><span id="output-status">正在连接</span><span id="output-fps">— FPS</span><span id="output-size">—</span><span id="output-gpu">GPU —</span></div></div><button class="output-reveal" data-action="show-tools" aria-label="显示输出控制">控制</button><div id="fatal" role="alert"></div></main>`:`
    <header class="topbar"><div class="brand"><span class="brand-symbol">✳</span><span class="wordmark">CHAOTIC<span class="accent">/</span></span><span class="edition">REALTIME<br/>VISUAL INSTRUMENT</span></div><div class="session"><i class="status-dot"></i><span id="connection">连接中</span><span class="session-label">LOCAL SESSION</span></div><div class="top-actions">${controlTop}</div></header>
    <main class="desk"><section class="workspace"><div class="section-heading"><h1>视觉现场</h1><div class="live-meta"><span id="fps">— FPS</span><span id="resolution">预览 —</span><select id="output-resolution" aria-label="输出分辨率">${resolutionOptions}</select><i class="live-dot"></i> LIVE</div></div>
    <div class="preview-frame"><canvas id="visual" aria-label="实时生成视觉预览"></canvas><div class="preview-label"><span>CHAOTIC</span><span id="scene-label">CUSTOM / 混沌场</span></div><div class="preview-bottom"><span id="photo-now">NO PHOTO · 场持续演化</span><button data-action="fullscreen" class="icon-btn" aria-label="预览全屏">⛶</button></div><div id="fatal" role="alert"></div></div>
    <div class="transport"><div class="transport-group"><button data-action="freeze"><span>Ⅱ</span> Freeze</button><button data-action="blackout"><span>■</span> Blackout</button><button data-action="clear"><span>↺</span> 清空残影</button></div><button data-action="tap" class="tap"><span class="beat-dot"></span><b id="bpm">120</b><small>TAP TEMPO</small></button></div>
    <div class="scenes primary-scenes">${scenePresets.slice(0,3).map(sceneButton).join('')}</div><details class="explorations"><summary>更多形态</summary><div class="scenes">${scenePresets.slice(3,originalSceneCount).map((p,i)=>sceneButton(p,i+3)).join('')}</div></details>
    <details class="explorations"><summary>开源视觉 · MilkDrop</summary><div class="scenes">${scenePresets.slice(originalSceneCount).map((p,i)=>sceneButton(p,i+originalSceneCount)).join('')}</div><p class="fine">隧道、镜像与分形。共用 XY 色板，接入音乐后更丰富。<a href="/open-visual-credits.txt" target="_blank" rel="noopener">作者与许可 ↗</a></p></details>
    <details class="explorations motion-exploration"><summary>运动与节拍</summary><div class="gesture-strip"><select id="gesture" aria-label="构图动作"><option value="flow">缓慢流动</option><option value="sweep">整团推移 / 回弹</option><option value="collision">环流对冲</option><option value="surge">蓄力 / 舒展</option><option value="split">柔性拉扯</option><option value="orbit">空间盘旋</option></select><label>幅度<input aria-label="构图动作幅度" data-setting="field.amplitude" type="range" min="0" max="1" step=".01" value=".7"/></label><label>形体尺度<input aria-label="形体尺度" data-setting="field.scale" type="range" min=".5" max="3" step=".01" value="1.3"/></label></div></details>
    <details class="signal-panel"><summary class="panel-title"><span>音频</span><span id="source" class="subtle">未连接 · 静音演化</span></summary><div class="signal-body"><canvas id="signal-history" width="650" height="62" aria-label="音频能量历史"></canvas><div class="audio-actions"><button data-action="file">本地音乐 ↗</button><button data-action="demo">测试节奏 ▷</button><button data-action="stop-audio" aria-label="停止音频分析">停止</button></div></div><div class="meters">${['bass','mid','high','kick','onset'].map(key=>`<div><span>${key.toUpperCase()}</span><i><b data-meter="${key}"></b></i><output data-feature="${key}">0.00</output></div>`).join('')}</div><p id="sync-status" class="fine">节拍来源：内部时钟 · VDJ 尚未连接</p></details>
    <section class="queue-panel"><div class="panel-title"><div><span class="eyebrow">照片</span><span id="queue-count" class="count">0</span></div><div><button data-action="queue-pause">暂停队列</button><button data-action="audience">手机上传 ⌁</button><button data-action="photos" class="outline">＋ 添加照片</button></div></div><div id="photo-list" class="photo-list"><div class="empty-queue"><span>＋</span><div>给混沌留下一点痕迹。<small>添加照片，依次显影 15 秒，再用 3 秒消散。</small></div></div></div></section>
    <footer class="desk-footer"><span id="owner-state">等待输出端</span></footer></section>
    <aside class="controls"><div class="controls-heading"><span class="eyebrow">控制</span><button data-action="save" title="保存预设">保存 ↗</button></div><div class="control-tabs" role="tablist"><button role="tab" aria-selected="true" data-tab="shape">形态</button><button role="tab" aria-selected="false" data-tab="color">色板</button><button role="tab" aria-selected="false" data-tab="settings">设置</button></div>
    <div class="tab-content" data-panel="shape"><div class="atmosphere-options" role="group" aria-label="混沌意境">${atmospheres.map(([key,label])=>`<button data-atmosphere="${key}" aria-pressed="false">${label}</button>`).join('')}</div><div class="chaotic-control">${slider('look.chaotic','Chaotic',0,1,.01,0)}<div class="slider-caption"><span>舒展 · 大体量</span><span>繁密 · 细节</span></div><p class="fine">调整纹理疏密。三种意境与经典卷曲共用当前配色。</p></div><div class="macro-grid">${Object.entries(macroLabels).map(([key,[label,cn]])=>`<label class="macro"><span><b title="${label}">${cn}</b></span><div class="macro-reading"><output data-macro-value="${key}">${Math.round(defaultConfig.macros[key as MacroKey]*100)}</output><span>/ 100</span></div><input type="range" min="0" max="1" step=".01" value="${defaultConfig.macros[key as MacroKey]}" data-macro="${key}" aria-label="${label}"/></label>`).join('')}</div><details class="subsection modulation-details"><summary>音频调制</summary>${Object.entries({bass:'Bass → 大结构',mid:'Mid → 轮廓',high:'High → 稀疏细节',onset:'Onset → 冲量 / 裂口',flux:'Flux → 扭曲',level:'Level → 运动 / 密度',beat:'Beat → 重拍呼吸'}).map(([key,label])=>slider(`modulation.${key}`,label,0,1,.01,defaultConfig.modulation[key as keyof Config['modulation']])).join('')}<p class="fine">滑到 0 即关闭这一路。基础形态与音乐调制分开控制。</p></details></div>
    <div class="tab-content" data-panel="color" hidden><div class="panel-title"><span class="eyebrow">YOUR PALETTE</span><div class="palette-reset-actions"><button data-action="reset-palette" title="恢复本次调色起点">重置</button><button data-action="undo-palette" hidden>撤销重置</button></div></div><div class="palette-base"><select id="palette-preset" aria-label="初始色板"><option value="stone">暖白石墨</option><option value="ember">暗红暖白</option><option value="blue">深蓝米白</option><option value="mono">黑白</option></select></div><div id="color-slots"></div><div class="color-slot"><label for="background-color">背景</label><input id="background-color" data-color="background" type="color" value="#08090c"/><input aria-label="背景 HEX" data-hex="background" value="#08090c" maxlength="7"/></div><p class="fine" id="palette-edit-hint">每个色槽均可独立修改。</p><div class="color-count"><button data-action="add-color">＋ 颜色槽</button><button data-action="remove-color">－ 颜色槽</button></div>${slider('palette.brightness','亮度',0,2,.01,1)}${slider('palette.contrast','对比度',.3,2,.01,1.12)}${slider('palette.saturation','饱和度',0,2,.01,.9)}${slider('palette.drift','色板内漂移',0,1,.01,.14)}${slider('palette.transitionSeconds','过渡 / 秒',0,10,.1,2)}<label class="toggle"><span>锁定基础色板<small>照片仅提供纹理和明暗</small></span><input id="palette-lock" type="checkbox" checked/></label>${slider('palette.photoColorMix','照片带色比例',0,1,.01,0)}<p class="fine">取消锁色后，照片颜色才会混入；退出时随照片一起消散。</p></div>
    <div class="tab-content" data-panel="settings" hidden><span class="eyebrow">RENDER / OUTPUT</span><label class="select-row">画质比例<select id="render-scale" aria-label="画质比例"><option value="1">100%</option><option value=".75">75%</option><option value=".5">50%</option></select></label><label class="select-row">随机种子<input id="seed" type="number" min="0" max="999999" value="1337"/></label>${slider('renderer.grain','颗粒',0,1,.01,.18)}${slider('renderer.aberration','色差',0,1,.01,.08)}${slider('renderer.bloom','微光',0,1,.01,.16)}<div class="subsection"><span class="eyebrow">PHOTO LIFECYCLE</span>${slider('photos.activeForSeconds','开始淡出 / 秒',2,120,1,15)}${slider('photos.fadeInSeconds','淡入 / 秒',0,10,.1,2)}${slider('photos.fadeOutSeconds','淡出 / 秒',.2,20,.1,3)}${slider('photos.coverage','局部覆盖',.05,.7,.01,.27)}${slider('photos.fragments','碎片密度',4,40,1,16)}${slider('photos.warp','照片扭曲',0,1,.01,.4)}${slider('photos.clarity','局部清晰度',0,1,.01,.6)}${slider('photos.edgeThreshold','轮廓阈值',0,1,.01,.25)}<label class="select-row">队列上限<input id="max-queued" type="number" min="1" max="300" value="100"/></label><label class="toggle"><span>新照片先审核</span><input id="moderation" type="checkbox"/></label></div><div class="subsection"><span class="eyebrow">SESSION TOOLS</span>${slider('tempo.offsetMs','节拍补偿 / ms',-2000,2000,10,0)}<button data-action="load" class="wide">导入 JSON 预设 ↗</button><button data-action="compare" class="wide">录制三版对比 · 3 × 30 秒</button><button data-action="cancel-recording" class="wide" hidden>停止录制</button>${local?'<button data-action="admin-key" class="wide">查看手机管理密钥</button>':''}<p id="gpu" class="fine"></p><p class="fine">细腻保留细节；极致锁定全精度。Ctrl + Shift + 空格：Freeze<br/>Ctrl + Shift + B：Blackout</p></div></div>
    <div class="controls-footer"><span class="live-dot"></span> ALWAYS EVOLVING</div></aside></main>`;
  app.insertAdjacentHTML('beforeend',`<input id="photo-input" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden/><input id="audio-input" type="file" accept="audio/*" hidden/><input id="preset-input" type="file" accept="application/json,.json" hidden/><div id="toast" role="status"></div><dialog id="dialog"><button id="close-dialog" class="dialog-close" aria-label="关闭">×</button><div id="dialog-body"></div></dialog>`);
  const canvas=document.querySelector<HTMLCanvasElement>('#visual')!;
  let engine:VisualEngine;
  try{engine=new VisualEngine(canvas);}catch(e){document.querySelector('#fatal')!.textContent=(e as Error).message;return;}
  const byId=(key:string)=>document.getElementById(key);
  if(!output)variationsUI=mountVariations(app,()=>state.config,()=>{colorSlots();mutateConfig();});
  if(!output)midiUI=mountMidi(app,()=>state.config,mutateConfig);
  const safe=(fn:()=>Promise<unknown>)=>void fn().catch(e=>toast(e.message||String(e)));
  const presetLibrary=output?null:mountPresetLibrary(app,()=>state.config,config=>{state.config=config;rememberPalette(state.config);paletteUndo=null;mutateConfig();});
  byId('output-resolution')!.onchange=()=>{state.config.renderer.outputResolution=(byId('output-resolution')as HTMLSelectElement).value as Config['renderer']['outputResolution'];mutateConfig();};
  function send(value:unknown){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(value));}
  function connect(){socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);socket.onopen=()=>{connected=true;};socket.onmessage=e=>{const message=JSON.parse(e.data);if(message.type==='welcome'){id=message.id;send({type:'claim',role:output?'output':'preview'});}if(message.type==='snapshot'){
      const incoming=message.data as Snapshot;incoming.config=configSchema.parse(incoming.config);if(configBusy||configDirty||Date.now()<ignoreConfigUntil)incoming.config=state.config;state=incoming;
      if((!state.ownerId||(!output&&state.ownerId!==id&&state.ownerRole==='preview'&&!state.ownerReady))&&!document.hidden&&performance.now()-lastClearClaim>1000){lastClearClaim=performance.now();send({type:'claim',role:output?'output':'preview'});}
      cache.sync(state.photos,state.activeId);updateUI();
    }if(message.type==='telemetry'){remote=message.data;remoteAt=performance.now();}
    if(message.type==='error')toast(message.message);if(message.type==='stop-audio')audio.stop();
  };socket.onclose=()=>{connected=false;id='';remote=null;cache.dispose();engine.setPhoto(null);updateUI();setTimeout(connect,1500);};socket.onerror=()=>{};}
  connect();
  document.addEventListener('visibilitychange',()=>{if(!output&&!recording){if(document.hidden&&state.ownerId===id&&!audio.context)send({type:'release'});else if(!document.hidden)send({type:'claim',role:'preview'});}});
  function mutateConfig(){configDirty=true;ignoreConfigUntil=Date.now()+700;if(configTimer===undefined)configTimer=setTimeout(()=>{configTimer=undefined;void flushConfig();},60);updateControls();}
  async function flushConfig(){if(configBusy)return;configBusy=true;try{while(configDirty){configDirty=false;await api('/api/config',structuredClone(state.config),'PUT');}}catch(e){toast((e as Error).message);}finally{configBusy=false;}}
  function toggle(key:'freeze'|'blackout'|'queuePaused'){safe(async()=>{await api('/api/transport',{[key]:!state.transport[key]});});}
  function needsOwner(){if(state.ownerId!==id){toast('音频请在当前独立输出窗口连接；控制台仍可调节画面。');return false;}return true;}
  async function fullscreen(){if(document.fullscreenElement)await document.exitFullscreen();else await (output?document.documentElement:canvas.parentElement!).requestFullscreen();}
  async function action(name:string){
    if(name==='desktop'){if(needsOwner())await audio.desktop();}
    if(name==='file'){if(needsOwner())(byId('audio-input')as HTMLInputElement).click();}
    if(name==='demo'){if(needsOwner())await audio.file('/test-beat.wav','测试节奏 · 120 BPM');}
    if(name==='stop-audio'){audio.stop();send({type:'stop-audio'});}
    if(name==='photos')(byId('photo-input')as HTMLInputElement).click();
    if(name==='freeze')toggle('freeze');if(name==='blackout')toggle('blackout');if(name==='queue-pause')toggle('queuePaused');
    if(name==='clear')await api('/api/transport',{clear:true});
    if(name==='fullscreen')await fullscreen();
    if(name==='hide-tools')document.body.classList.add('hide-output-tools');
    if(name==='show-tools'){document.body.classList.remove('hide-output-tools');armOutputHide();}
    if(name==='output'){const win=window.open('/output','chaotic-output','popup,width=1280,height=720');if(!win)toast('请允许本站弹出独立输出窗口。');else toast('将输出窗口拖到 HDMI 扩展屏；在该窗口重新连接桌面音频。');}
    if(name==='tap'){const now=Date.now();if(now-(tapTimes.at(-1)??0)>2500)tapTimes=[];tapTimes.push(now);tapTimes=tapTimes.slice(-8);if(tapTimes.length>=2){const intervals=tapTimes.slice(1).map((t,i)=>t-tapTimes[i]).sort((a,b)=>a-b);state.config.tempo.bpm=Math.min(300,Math.max(30,60000/intervals[Math.floor(intervals.length/2)]));state.config.tempo.source='tap';state.config.tempo.anchor=now;mutateConfig();}}
    if(name==='save')presetLibrary?.open();
    if(name==='reset-palette'){paletteUndo=resetPalette(state.config);mutateConfig();toast('颜色已恢复，可撤销；纹理与打光保留。');}
    if(name==='undo-palette'&&paletteUndo){Object.assign(state.config,paletteUndo);paletteUndo=null;mutateConfig();}
    if(name==='load')(byId('preset-input')as HTMLInputElement).click();
    if(name==='add-color'){capturePalette(state.config,engine.colorPosition);if(state.config.palette.colors.length<5){state.config.palette.mapping='even';state.config.palette.colors.push('#d9ddbd');}mutateConfig();colorSlots();}
    if(name==='remove-color'){capturePalette(state.config,engine.colorPosition);if(state.config.palette.colors.length>3){state.config.palette.mapping='even';state.config.palette.colors.pop();}mutateConfig();colorSlots();}
    if(name==='audience'){
      const urls=state.uploadUrls;const url=urls[0]??`${location.origin}/upload`;const qr=await QRCode.toDataURL(url,{color:{dark:'#101310',light:'#e8e6dc'},width:240,margin:2});
      byId('dialog-body')!.innerHTML=`<span class="eyebrow">AUDIENCE ENTRY</span><h2>把照片带进现场。</h2><img src="${qr}" width="240" height="240" alt="局域网照片上传二维码"/><p>手机与电脑连接同一个可互通的 Wi-Fi / 热点。</p><select id="lan-choice" aria-label="选择局域网地址">${(urls.length?urls:[url]).map(u=>`<option value="${escapeHTML(u)}">${escapeHTML(u)}</option>`).join('')}</select><p><a id="upload-link" href="${escapeHTML(url)}" target="_blank" rel="noopener">打开上传页 ↗</a></p><p class="fine">如存在虚拟网卡，请选择手机可访问的实际 Wi-Fi 地址。Windows 防火墙需要允许本地端口 5173。</p>`;
      (byId('dialog')as HTMLDialogElement).showModal();byId('lan-choice')!.onchange=()=>{safe(async()=>{const chosen=(byId('lan-choice')as HTMLSelectElement).value;(byId('dialog-body')!.querySelector('img')as HTMLImageElement).src=await QRCode.toDataURL(chosen,{width:240,margin:2,color:{dark:'#101310',light:'#e8e6dc'}});(byId('upload-link')as HTMLAnchorElement).href=chosen;});};
    }
    if(name==='admin-key'){const result=await api<{key:string}>('/api/local-key');byId('dialog-body')!.innerHTML=`<span class="eyebrow">PRIVATE / PERFORMER ONLY</span><h2>手机管理密钥</h2><p>在手机打开电脑的 LAN 地址根页面，输入此密钥。不要分享给观众。</p><code class="secret">${escapeHTML(result.key)}</code>`;(byId('dialog')as HTMLDialogElement).showModal();}
    if(name==='compare')await compare();if(name==='cancel-recording')abortRecording=true;
  }
  app.addEventListener('click',e=>{const target=e.target as HTMLElement;const button=target.closest<HTMLElement>('[data-action]');if(button)safe(()=>action(button.dataset.action!));const atmosphere=target.closest<HTMLElement>('[data-atmosphere]');if(atmosphere){if(state.config.field.style!==6)applyScenePreset(state.config,scenePresets[0]);state.config.look.atmosphere=atmosphere.dataset.atmosphere as Config['look']['atmosphere'];mutateConfig();}const scene=target.closest<HTMLElement>('[data-scene]');if(scene){applyScenePreset(state.config,scenePresets[Number(scene.dataset.scene)]);mutateConfig();}const tab=target.closest<HTMLElement>('[data-tab]');if(tab){document.querySelectorAll<HTMLElement>('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==tab.dataset.tab);document.querySelectorAll('[data-tab]').forEach(p=>p.setAttribute('aria-selected',String((p as HTMLElement).dataset.tab===tab.dataset.tab)));}const deletion=target.closest<HTMLElement>('[data-delete]');if(deletion)safe(async()=>{await api(`/api/photos/${deletion.dataset.delete}`,undefined,'DELETE');});const approve=target.closest<HTMLElement>('[data-approve]');if(approve)safe(async()=>{await api(`/api/photos/${approve.dataset.approve}/approve`,{});});});
  app.addEventListener('focusin',e=>{const input=e.target as HTMLInputElement;if(input.matches('[data-color],[data-hex]')&&state.config.colorMood.enabled){capturePalette(state.config,engine.colorPosition);mutateConfig();}});
  app.addEventListener('input',e=>{const input=e.target as HTMLInputElement;
    if(input.dataset.macro){state.config.macros[input.dataset.macro as MacroKey]=Number(input.value);mutateConfig();}
    if(input.dataset.setting){const [group,key]=input.dataset.setting.split('.');const obj=state.config[group as keyof Config] as Record<string,unknown>;obj[key]=Number(input.value);mutateConfig();}
    if(input.dataset.color!==undefined||input.dataset.hex!==undefined){const key=input.dataset.color??input.dataset.hex!;if(!/^#[\da-fA-F]{6}$/.test(input.value))return;paletteUndo=null;capturePalette(state.config,engine.colorPosition);if(key==='background')state.config.palette.background=input.value;else state.config.palette.colors[Number(key)]=input.value;mutateConfig();}
  });
  if(!output){
    document.querySelector('[data-panel=settings]')!.insertAdjacentHTML('afterbegin',`<label class="toggle"><span>自动档全屏超清<small>固定分辨率使用上方选择；自动档全屏按 4K 生成</small></span><input id="fullscreen-uhd" type="checkbox"/></label>`);
    byId('fullscreen-uhd')!.onchange=()=>{state.config.renderer.fullscreenUhd=(byId('fullscreen-uhd')as HTMLInputElement).checked;mutateConfig();};
    document.querySelector('.chaotic-control')!.insertAdjacentHTML('afterend',`<details class="lighting-controls"><summary>打光与层次</summary>${slider('look.light','主光',0,1,.01,.6)}${slider('look.shadow','阴影',0,1,.01,.55)}${slider('look.lightAngle','光照方向',0,1,.01,.35)}${slider('look.depth','立体程度',0,1,.01,.72)}</details>`);
    document.querySelector('[data-panel=settings]')!.insertAdjacentHTML('afterbegin',`<label class="select-row">画质档位<select id="quality-mode" aria-label="画质档位"><option value="performance">流畅</option><option value="fine">细腻 · 推荐</option><option value="ultra">极致 · 全精度</option></select></label>`);
    byId('quality-mode')!.onchange=()=>{const mode=(byId('quality-mode')as HTMLSelectElement).value as Config['renderer']['quality'];Object.assign(state.config.renderer,{quality:mode,renderScale:1,fieldScale:mode==='performance'?.85:1,adaptive:mode!=='ultra',grain:.035,aberration:.015});mutateConfig();};
    byId('quality-mode')!.closest('label')!.insertAdjacentHTML('afterend',`<label class="select-row">输出帧率<select id="frame-rate" aria-label="输出帧率"><option value="display">跟随屏幕 · 高刷</option><option value="60">60 FPS</option><option value="120">120 FPS</option><option value="144">144 FPS</option><option value="165">165 FPS</option></select></label><p class="fine">仅调整帧率上限，画质参数保持不变。</p>`);
    byId('frame-rate')!.onchange=()=>{state.config.renderer.frameRate=(byId('frame-rate')as HTMLSelectElement).value as Config['renderer']['frameRate'];mutateConfig();};
    byId('gesture')!.onchange=()=>{state.config.field.gesture=(byId('gesture')as HTMLSelectElement).value as Config['field']['gesture'];mutateConfig();};
    document.querySelector('[data-panel=settings]')!.insertAdjacentHTML('afterbegin',`<label class="toggle"><span>自适应精度<small>按画质档位调整，保留输出尺寸</small></span><input id="adaptive" type="checkbox" checked/></label>${slider('renderer.fieldScale','内部场精度',.35,1,.05,.85)}<p id="performance-detail" class="fine"></p>`);
    byId('adaptive')!.onchange=()=>{state.config.renderer.adaptive=(byId('adaptive')as HTMLInputElement).checked;mutateConfig();};
    document.querySelector('.gesture-strip')!.insertAdjacentHTML('afterend',`<details class="rhythm-panel"><summary>鼓点响应</summary><div class="rhythm-grid">${slider('rhythm.impact','亮块推移',0,1,.01,.75)}${slider('rhythm.ripple','涟漪扩散',0,1,.01,.6)}${slider('rhythm.drift','惯性游走',0,1,.01,.55)}${slider('rhythm.color','节拍色彩',0,1,.01,.4)}</div></details>`);
    byId('palette-lock')!.onchange=()=>{state.config.palette.locked=(byId('palette-lock')as HTMLInputElement).checked;mutateConfig();};
    byId('moderation')!.onchange=()=>{state.config.photos.moderation=(byId('moderation')as HTMLInputElement).checked;mutateConfig();};
    for(const [element,group,key] of [['render-scale','renderer','renderScale'],['seed','renderer','seed'],['max-queued','photos','maxQueued']])byId(element)!.onchange=()=>{const candidate=structuredClone(state.config);(candidate[group as keyof Config]as Record<string,unknown>)[key]=Number((byId(element)as HTMLInputElement).value);const result=configSchema.safeParse(candidate);if(result.success){state.config=result.data;mutateConfig();}else{toast('参数超出允许范围。');updateControls(true);}};
    byId('palette-preset')!.onchange=()=>{const palettes:Record<string,string[]>={stone:['#08090c','#343943','#aca89f','#f1ebdd'],ember:['#100909','#522521','#b96943','#f5e5c7'],blue:['#050a16','#13344c','#688995','#e3e5cb'],mono:['#050505','#363636','#adadad','#ffffff']};state.config.colorMood.enabled=false;state.config.colorMotion.enabled=false;state.config.palette.mapping='even';state.config.palette.colors=palettes[(byId('palette-preset')as HTMLSelectElement).value];state.config.palette.background=state.config.palette.colors[0];rememberPalette(state.config);paletteUndo=null;colorSlots();mutateConfig();};
  }
  byId('close-dialog')!.onclick=()=>{(byId('dialog')as HTMLDialogElement).close();byId('dialog-body')!.textContent='';};
  (byId('photo-input')as HTMLInputElement).onchange=async e=>{const input=e.target as HTMLInputElement;const files=Array.from(input.files??[]);let count=0;for(const file of files){try{await upload(file);count++;}catch(e){toast(`${file.name}: ${(e as Error).message}`);break;}}if(count)toast(`${count} 张照片已按选择顺序接收。`);input.value='';};
  (byId('audio-input')as HTMLInputElement).onchange=e=>{const input=e.target as HTMLInputElement;const file=input.files?.[0];if(file)safe(()=>audio.file(file));input.value='';};
  (byId('preset-input')as HTMLInputElement).onchange=e=>{const input=e.target as HTMLInputElement;const file=input.files?.[0];if(file)safe(async()=>{const result=configSchema.safeParse(JSON.parse(await file.text()));if(!result.success)throw new Error('预设格式或范围无效。');state.config=result.data;rememberPalette(state.config);paletteUndo=null;colorSlots();mutateConfig();toast('预设已加载。');});input.value='';};
  window.addEventListener('keydown',e=>{if(e.ctrlKey&&e.shiftKey&&e.code==='Space'){e.preventDefault();toggle('freeze');}if(e.ctrlKey&&e.shiftKey&&e.code==='KeyB'){e.preventDefault();toggle('blackout');}});
  canvas.ondblclick=()=>safe(fullscreen);
  let toolTimer:ReturnType<typeof setTimeout>;
  function armOutputHide(){clearTimeout(toolTimer);toolTimer=setTimeout(()=>{const bar=document.querySelector('.output-tools');if(!bar?.matches(':hover')&&!bar?.contains(document.activeElement))document.body.classList.add('hide-output-tools');},3000);}
  if(output){armOutputHide();window.addEventListener('pointermove',e=>{if(e.clientY>window.innerHeight-110){document.body.classList.remove('hide-output-tools');armOutputHide();}});document.querySelector('.output-tools')!.addEventListener('pointerleave',armOutputHide);}
  document.addEventListener('fullscreenchange',()=>{if(output){document.body.classList.add('hide-output-tools');armOutputHide();}});
  let colorCount=0;
  function colorSlots(){if(output)return;const slots=byId('color-slots')!;const palette=editablePalette(state.config,engine.colorPosition);colorCount=palette.colors.length;slots.innerHTML=palette.colors.map((hex,i)=>`<div class="color-slot"><label>${['底色','过渡','主体','点缀','峰值'][i]}</label><input type="color" aria-label="颜色 ${i+1}" data-color="${i}" value="${hex}"/><input aria-label="颜色 ${i+1} HEX" data-hex="${i}" value="${hex}" maxlength="7"/></div>`).join('');}
  function updateColorInputs(){if(output)return;const palette=editablePalette(state.config,engine.colorPosition);if(colorCount!==palette.colors.length)colorSlots();document.querySelectorAll<HTMLInputElement>('[data-color],[data-hex]').forEach(input=>{const key=input.dataset.color??input.dataset.hex!;if(document.activeElement!==input)input.value=key==='background'?palette.background:palette.colors[Number(key)];});byId('palette-edit-hint')!.textContent=state.config.colorMood.enabled?'正在显示当前配色。点击色槽开始编辑，并暂停自动变色。':'自定义颜色已定格；可逐项调整并保存。';}
  function updateControls(force=false){if(output)return;const cfg=state.config,key=JSON.stringify(cfg);if(!force&&key===lastControls)return;lastControls=key;if(colorCount!==editablePalette(cfg).colors.length)colorSlots();
    variationsUI?.update(cfg);midiUI?.update(cfg);
    for(const button of app.querySelectorAll<HTMLElement>('[data-atmosphere]'))button.setAttribute('aria-pressed',String(cfg.field.style===6&&button.dataset.atmosphere===cfg.look.atmosphere));
    app.querySelector<HTMLButtonElement>('[data-action=undo-palette]')!.hidden=!paletteUndo;
    for(const key of Object.keys(macroLabels)as MacroKey[]){const input=document.querySelector<HTMLInputElement>(`[data-macro="${key}"]`)!;if(document.activeElement!==input)input.value=String(cfg.macros[key]);document.querySelector(`[data-macro-value="${key}"]`)!.textContent=String(Math.round(cfg.macros[key]*100));input.style.setProperty('--amount',`${cfg.macros[key]*100}%`);}
    document.querySelectorAll<HTMLInputElement>('[data-setting]').forEach(input=>{const [group,key]=input.dataset.setting!.split('.');const value=(cfg[group as keyof Config]as Record<string,number>)[key];if(document.activeElement!==input)input.value=String(value);const out=document.querySelector(`[data-value="${input.dataset.setting}"]`);if(out)out.textContent=String(Math.round(value*100)/100);});
    updateColorInputs();
    (byId('fullscreen-uhd')as HTMLInputElement).checked=cfg.renderer.fullscreenUhd;
    (byId('palette-lock')as HTMLInputElement).checked=cfg.palette.locked;(byId('moderation')as HTMLInputElement).checked=cfg.photos.moderation;
    for(const [element,value]of [['render-scale',cfg.renderer.renderScale],['seed',cfg.renderer.seed],['max-queued',cfg.photos.maxQueued]]as const){const input=byId(element)as HTMLInputElement;if(document.activeElement!==input)input.value=String(value);}
    (byId('gesture')as HTMLSelectElement).value=cfg.field.gesture;(byId('adaptive')as HTMLInputElement).checked=cfg.renderer.adaptive;(byId('quality-mode')as HTMLSelectElement).value=cfg.renderer.quality;
    (byId('frame-rate')as HTMLSelectElement).value=cfg.renderer.frameRate;
    const scene=scenePresets.findIndex(p=>p.field.style===cfg.field.style);
    document.querySelectorAll<HTMLElement>('[data-scene]').forEach(b=>{const selected=Number(b.dataset.scene)===scene;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});byId('scene-label')!.textContent=cfg.performance.enabled?`A ${scene<0?'自定':scenePresets[scene].name} / B ${scenePresets[cfg.performance.sceneB].name} · ${Math.round(cfg.performance.mix*100)}%`:scene<0?'CUSTOM / 自定义':scenePresets[scene].label;
  }
  function updateUI(){const owner=state.ownerId===id;
    const resolution=byId('output-resolution')as HTMLSelectElement;if(document.activeElement!==resolution)resolution.value=state.config.renderer.outputResolution;
    if(!owner&&audio.context)audio.stop();
    if(output){showOutputStatus();return;}
    byId('connection')!.textContent=connected?'本地已连接':'正在重连';document.querySelector('.status-dot')!.classList.toggle('offline',!connected);
    byId('owner-state')!.textContent=!connected?'连接中断 · 照片已暂停':owner?'● 控制台预览正在播放':state.ownerReady?'● 独立窗口正在输出 · 此控制台可收起':'等待输出端恢复 · 照片时钟暂停';
    for(const key of ['freeze','blackout'])document.querySelector(`[data-action="${key}"]`)!.classList.toggle('active',state.transport[key as 'freeze'|'blackout']);
    const pause=document.querySelector('[data-action="queue-pause"]')!;pause.textContent=state.transport.queuePaused?'继续队列':'暂停队列';pause.classList.toggle('active',state.transport.queuePaused);
    updateControls();
    const photos=state.photos,paused=isPaused(state.transport)||!state.ownerReady;
    const playing=photos.find(p=>p.id===state.activeId);byId('photo-now')!.textContent=playing?`PHOTO ${String(playing.seq).padStart(3,'0')} · ${statusLabels[playing.status]} · ${Math.max(0,state.config.photos.activeForSeconds+state.config.photos.fadeOutSeconds-playing.age).toFixed(1)}s`:'NO PHOTO · 场持续演化';
    byId('queue-count')!.textContent=String(photos.filter(p=>['Queued','Processing','Pending','Active','Fading'].includes(p.status)).length);
    const html=photos.length?photos.slice().sort((a,b)=>{const rank=(s:string)=>s==='Active'||s==='Fading'?0:s==='Done'||s==='Failed'?2:1;return rank(a.status)-rank(b.status)||a.seq-b.seq;}).map(p=>`<article class="photo-row ${p.status==='Active'||p.status==='Fading'?'current':''}">${['Processing','Failed'].includes(p.status)?'<div class="thumb-placeholder">…</div>':`<img src="/media/${p.id}.thumb.webp" alt="照片 ${p.seq}" loading="lazy"/>`}<span class="photo-seq">${String(p.seq).padStart(3,'0')}</span><div class="photo-info"><strong>${escapeHTML(p.name)}</strong><span>${statusLabels[p.status]}${p.status==='Queued'?paused?' · 已暂停':` · 预计 ${duration(estimateWait(photos,p.id,state.config,false)??0)}`:p.error?` · ${escapeHTML(p.error)}`:''}</span></div>${p.status==='Pending'?`<button data-approve="${p.id}">通过</button>`:''}<button class="delete-photo" data-delete="${p.id}" aria-label="删除照片 ${p.seq}">×</button></article>`).join(''):'<div class="empty-queue"><span>＋</span><div>给混沌留下一点痕迹。<small>添加照片，依次显影 15 秒，再用 3 秒消散。</small></div></div>';
    if(html!==queueHTML){queueHTML=html;byId('photo-list')!.innerHTML=html;}
  }
  const histories:AudioFeatures[]=[];
  function showOutputStatus(){
    const owner=state.ownerId===id,data=connected&&owner?localTelemetry:null;
    const values:Record<string,string>={'output-status':!connected?'连接中断':owner?`正在输出 · ${data?.source??'静音演化'}`:'已有输出 · 本页待机','output-fps':data?`${Math.round(data.fps)} FPS`:'— FPS','output-size':data?.resolution??'—','output-gpu':data?.gpuMs!=null?`GPU ${data.gpuMs.toFixed(1)} ms`:'GPU —'};
    for(const [key,value]of Object.entries(values)){const node=byId(key)!;if(node.textContent!==value)node.textContent=value;}
    byId('output-fps')!.title=data?`浏览器 ${Math.round(data.rafHz)} Hz · ${state.config.renderer.frameRate==='display'?'跟随屏幕':`上限 ${state.config.renderer.frameRate} FPS`}`:'';
  }
  function showTelemetry(data:Telemetry){
    if(output){showOutputStatus();return;}
    byId('fps')!.textContent=`${Math.round(data.fps)} FPS`;byId('resolution')!.textContent=`预览 ${data.resolution}`;byId('resolution')!.title=state.ownerId!==id&&remote?`正式输出 ${remote.resolution} · 内部场 ${remote.fieldResolution}`:`当前输出 ${data.resolution} · 内部场 ${data.fieldResolution}`;byId('source')!.textContent=data.source;byId('gpu')!.textContent=data.gpu;
    const stats=state.ownerId!==id&&remote?remote:data;
    byId('performance-detail')!.textContent=`${stats===data?'本页':'输出端'}内部场 ${stats.fieldResolution} · 输出 ${stats.resolution}${stats.gpuMs!==null?` · GPU ${stats.gpuMs.toFixed(1)} ms`:''} · CPU ${stats.cpuMs?.toFixed(1)??'—'} ms · 浏览器 ${Math.round(stats.rafHz??0)} Hz`;
    for(const key of ['bass','mid','high','kick','onset']as const){document.querySelector<HTMLElement>(`[data-meter="${key}"]`)!.style.width=`${data.features[key]*100}%`;document.querySelector(`[data-feature="${key}"]`)!.textContent=data.features[key].toFixed(2);}
    const bpm=state.dj.connected&&state.dj.currentBpm?state.dj.currentBpm:state.config.tempo.bpm;byId('bpm')!.textContent=String(Math.round(bpm));byId('sync-status')!.textContent=`节拍来源：${state.dj.connected?`VDJ ${state.dj.source?.toUpperCase()} · ${state.dj.beatPosition===null?'仅 BPM，拍位未知':'实时拍位'}`:state.config.tempo.source==='tap'?'Tap Tempo · VDJ 尚未连接':'内部时钟 · VDJ 尚未连接'} · RMS ${data.features.rms.toFixed(2)} / Flux ${data.features.flux.toFixed(2)} / 亮度 ${data.features.centroid.toFixed(2)}`;
    histories.push(data.features);if(histories.length>160)histories.shift();const plot=byId('signal-history')as HTMLCanvasElement;const ctx=plot.getContext('2d')!;ctx.clearRect(0,0,plot.width,plot.height);ctx.strokeStyle='#30332e';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,56);ctx.lineTo(plot.width,56);ctx.stroke();
    for(const [key,color]of [['rms','#c9dc91'],['bass','#656f54'],['onset','#a18159']]as const){ctx.beginPath();histories.forEach((f,i)=>{const x=i/159*plot.width,y=56-f[key]*49;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.strokeStyle=color;ctx.lineWidth=key==='rms'?1.6:1;ctx.stroke();}
    if(data.error)byId('fatal')!.textContent=data.error;
  }
  function tick(now:number){
    requestAnimationFrame(tick);
    rafFrames++;
    const owner=connected&&state.ownerId===id;
    const policy=renderPolicy(owner,output,document.hidden,!!document.fullscreenElement,recording?'60':state.config.renderer.frameRate);
    const frameDt=(now-lastRaf)/1000;lastRaf=now;
    if(!framePacer.ready(frameDt,policy.fps))return;
    const workStart=performance.now();const dt=Math.min(.25,Math.max(0,(now-lastFrame)/1000));lastFrame=now;frames++;
    if(now-fpsAt>=1000){fps=frames*1000/(now-fpsAt);rafHz=rafFrames*1000/(now-fpsAt);rafFrames=frames=0;fpsAt=now;}
    const features=owner?audio.update(dt):remote?.features??silentFeatures();
    let current=connected?state.photos.find(p=>p.id===state.activeId):undefined;
    if(current?.id!==activeId){activeId=current?.id??null;localAge=current?.age??0;reportedDelta=0;}
    if(current){if(owner){if(!isPaused(state.transport)&&cache.get(current.id)?.texture){localAge+=dt;reportedDelta+=dt;}}else localAge=current.age;engine.setPhoto(cache.get(current.id)?.texture??null);engine.setPhotoAge(localAge);}else engine.setPhoto(null);
    const begin=!current&&owner&&!isPaused(state.transport)?state.photos.find(p=>p.status==='Queued'||p.status==='Processing'):undefined;
    if(begin?.status==='Queued'){const entry=cache.get(begin.id);if(entry?.failed)send({type:'failed',id:begin.id});else if(entry?.texture){engine.setPhoto(entry.texture);engine.setPhotoAge(0);}}
    if(current&&owner&&cache.get(current.id)?.failed)send({type:'failed',id:current.id});
    if(policy.draw){
      const full=!!document.fullscreenElement,uhd=full&&state.config.renderer.fullscreenUhd&&!recording;
      const explicit=!recording&&(owner||output||full)&&state.config.renderer.outputResolution!=='auto',locked=explicit||uhd;
      const cssWidth=output||full?window.innerWidth:recording?1920:Math.min(policy.previewLimit,Math.max(1280,Math.round(canvas.clientWidth))),cssHeight=output||full?window.innerHeight:Math.round(cssWidth*9/16);
      const renderConfig:Config=locked?{...state.config,renderer:{...state.config.renderer,quality:'ultra',adaptive:false,fieldScale:1,renderScale:1}}:state.config;
      const {width:w,height:h}=locked?selectedOutputSize(state.config.renderer.outputResolution,cssWidth,cssHeight,window.devicePixelRatio,renderConfig.renderer.quality,uhd,engine.maxTextureSize):outputSize(cssWidth,cssHeight,recording?1:output?window.devicePixelRatio:Math.max(1.5,window.devicePixelRatio),renderConfig.renderer.quality);
      const fieldScale=engine.quality(dt,renderConfig,owner&&!document.hidden&&!state.transport.freeze&&!state.transport.blackout&&!recording);
      engine.resize(w,h,renderConfig.renderer.renderScale,locked?1:fieldScale);
      const beat=state.dj.connected&&state.dj.beatPosition!==null?state.dj.beatPosition+(Date.now()-(state.dj.receivedAt??Date.now())+state.config.tempo.offsetMs)/60000*(state.dj.currentBpm??state.config.tempo.bpm):(Date.now()-state.config.tempo.anchor+state.config.tempo.offsetMs)/60000*state.config.tempo.bpm;
      const colorPhase=!owner&&remote?.colorCue===colorCue(state.config)&&typeof remote.colorPhase==='number'?remote.colorPhase+(state.config.colorMotion.enabled&&state.config.colorMood.enabled&&!state.transport.freeze&&!state.transport.blackout?(now-remoteAt)/1000/state.config.colorMotion.seconds:0):undefined;
      engine.render(dt,renderConfig,features,state.transport,beat%16,owner?audio.pcmFrame():null,colorPhase);drawn=true;
      const beatDot=document.querySelector<HTMLElement>('.beat-dot');if(beatDot)beatDot.style.opacity=String(.2+.8*Math.pow(1-(beat%1),4));
    }
    if(begin?.status==='Queued'&&cache.get(begin.id)?.texture&&drawn&&!engine.error)send({type:'started',id:begin.id});
    if(owner&&now-lastReport>=100&&drawn&&!engine.error){send({type:'frame',id:current?.id??null,delta:reportedDelta});reportedDelta=0;lastReport=now;}
    cpuMs+=(performance.now()-workStart-cpuMs)*.1;
    if(now-lastTelemetry>=(output?1000:200)){const data:Telemetry={features,source:owner?audio.sourceName:remote?.source??audio.sourceName,fps,gpu:engine.gpu,resolution:`${canvas.width} × ${canvas.height}`,fieldResolution:engine.fieldResolution,gpuMs:engine.gpuMs,cpuMs,rafHz,error:engine.error,colorPhase:engine.colorPhase,colorCue:engine.colorCue};localTelemetry=data;if(owner)send({type:'telemetry',data});showTelemetry(data);variationsUI?.updateLive(engine.colorPosition);updateColorInputs();if(!output&&!owner&&remote)byId('fps')!.textContent=`预览 ${Math.round(fps)} · 输出 ${Math.round(remote.fps)} FPS`;lastTelemetry=now;}
    const message=engine.error??engine.notice??'';if(byId('fatal')!.textContent!==message)byId('fatal')!.textContent=message;
  }
  requestAnimationFrame(tick);colorSlots();
  async function compare(){
    if(recording||!needsOwner())return;if(typeof MediaRecorder==='undefined')throw new Error('浏览器不支持录制。');
    recording=true;abortRecording=false;const original=structuredClone(state.config),originalTransport={...state.transport};
    const cancel=document.querySelector<HTMLElement>('[data-action="cancel-recording"]');if(cancel)cancel.hidden=false;
    try{
      // Deterministic original test audio, identical start and shader seed for each scene.
      await audio.file('/test-beat.wav','三版对比测试节奏');await api('/api/transport',{freeze:false,blackout:false,queuePaused:true});
      for(let i=0;i<3&&!abortRecording;i++){
        state.config=structuredClone(original);state.config.macros={...scenePresets[i].macros};state.config.field={...scenePresets[i].field};state.config.macros.photoPresence=0;await api('/api/config',state.config,'PUT');engine.reset();audio.restartFile();
        const stream=canvas.captureStream(30);const audioTap=audio.recordingTap();audioTap?.stream.getAudioTracks().forEach(track=>stream.addTrack(track));const mime=['video/webm;codecs=vp8,opus','video/webm'].find(s=>MediaRecorder.isTypeSupported(s));
        const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8000000});const chunks:Blob[]=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
        const done=new Promise<void>((resolve,reject)=>{recorder.onstop=()=>resolve();recorder.onerror=()=>reject(new Error('录制失败'));});
        recorder.start(1000);const started=performance.now();toast(`正在录制 ${i+1}/3 · ${scenePresets[i].name} · 30 秒`);
        await new Promise<void>(resolve=>{const poll=setInterval(()=>{if(abortRecording||performance.now()-started>=30000){clearInterval(poll);resolve();}},100);});
        recorder.stop();await done;audioTap?.dispose();stream.getTracks().forEach(t=>t.stop());
        if(!abortRecording)download(new Blob(chunks,{type:'video/webm'}),`chaotic-${i+1}-${scenePresets[i].label.split(' / ')[1].toLowerCase()}-30s.webm`);
      }
      toast(abortRecording?'录制已停止。':'三段视觉对比已导出，每段含同一测试节奏。');
    }finally{recording=false;if(cancel)cancel.hidden=true;state.config=original;await api('/api/config',original,'PUT');await api('/api/transport',originalTransport);mutateConfig();}
  }
  window.addEventListener('beforeunload',()=>{socket?.close();audio.stop();cache.dispose();engine.dispose();});
}
