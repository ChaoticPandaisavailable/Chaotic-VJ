import { scenePresets, type Config } from '../../../packages/shared/config.ts';
import { decodeMidi, MidiControl, midiTargets, type MidiBinding, type MidiTarget } from '../../../packages/shared/midi.ts';
import { applyControl, controlValue } from '../../../packages/shared/performance.ts';

const labels:Record<string,string>={mix:'A / B 混合',warmth:'颜色 · 色相',richness:'颜色 · 点缀',energy:'能量',chaos:'扭曲',density:'密度',motion:'流速',morph:'形态',complexity:'复杂度',rotation:'旋转'};
const label=(target:MidiTarget)=>target.startsWith('scene:')?`场景 · ${scenePresets[Number(target.split(':')[1])].name}`:labels[target];
const modes=[['absolute','绝对值'],['relative1','相对 1'],['relative2','相对 2'],['relative3','相对 3']] as const;
const options=modes.map(([v,n])=>`<option value="${v}">${n}</option>`).join('');

export function mountMidi(app:HTMLElement,getConfig:()=>Config,changed:()=>void){
  app.querySelector('.primary-scenes')!.insertAdjacentHTML('afterend',`<details class="explorations performance-panel"><summary>演奏 <span class="midi-summary">MIDI · A/B</span></summary><div class="performance-body">
    <div class="deck-selectors"><span class="deck-a">A · 当前视觉</span><label>B <select id="scene-b" aria-label="B 视觉">${scenePresets.map((p,i)=>`<option value="${i}">${p.name}</option>`).join('')}</select></label><label class="mix-toggle"><input type="checkbox" id="mix-enabled"/>混合</label></div>
    <label class="crossfader"><span>A</span><input type="range" id="scene-mix" aria-label="A B 混合" min="0" max="1" step=".001"/><span>B</span><output id="mix-value">0%</output></label>
    <div class="midi-connect"><button id="midi-connect">连接 MiniLab / MIDI</button><select id="midi-device" aria-label="MIDI 输入设备" hidden></select></div><p class="fine midi-status" role="status">USB 连接 MiniLab MkII，再点连接。无需固定的键盘预设。</p>
    <details class="midi-learn"><summary>映射与旋钮范围 <span id="midi-count">0</span></summary><div class="learn-row"><select id="midi-target" aria-label="MIDI 映射目标">${midiTargets.map(t=>`<option value="${t}">${label(t)}</option>`).join('')}</select><select id="midi-mode" aria-label="旋钮编码模式">${options}</select><button id="midi-learn">学习</button></div><p class="fine">选目标 → 学习 → 按一下打击垫或转动旋钮。旋钮模式与 Arturia MIDI Control Center 中的设置一致。</p><div id="midi-bindings"></div><p class="fine">绝对值旋钮默认等到经过当前值才接管。范围为 0–100%，起止反过来可反向控制。映射随预设保存。</p></details>
  </div></details>`);
  const query=<T extends Element=HTMLElement>(selector:string)=>app.querySelector<T>(selector)!;
  query('.learn-row').insertAdjacentHTML('beforebegin','<label class="midi-routing">场景按键装入 <select id="midi-deck" aria-label="MIDI 场景目标"><option value="a">A · 切换当前视觉</option><option value="b">B · 准备混合视觉</option></select></label>');
  query('#midi-deck').addEventListener('change',()=>{getConfig().performance.padTarget=query<HTMLSelectElement>('#midi-deck').value as 'a'|'b';changed();});
  const status=query('.midi-status'),connect=query<HTMLButtonElement>('#midi-connect'),devices=query<HTMLSelectElement>('#midi-device');
  let access:MIDIAccess|null=null,port:MIDIInput|null=null,learning:MidiTarget|null=null,connecting=false,enabled=false;
  const controls=new Map<string,MidiControl>();let rowsKey='',portGeneration=0,connectAttempt=0;
  const message=(text:string)=>{status.textContent=text;};
  const stopLearning=()=>{learning=null;query('#midi-learn').textContent='学习';};
  const onMessage=(event:MIDIMessageEvent)=>{
    if(!enabled||!event.data)return;
    const signal=decodeMidi(event.data);if(!signal)return;
    if(learning){
      if(signal.kind==='note'&&!signal.pressed)return;
      if(!learning.startsWith('scene:')&&signal.kind!=='cc'){message('这个参数需要旋钮 CC；请转动要绑定的旋钮。');return;}
      if(learning.startsWith('scene:')&&signal.kind==='cc'&&signal.value<64)return;
      const config=getConfig(),target=learning;
      const binding:MidiBinding={target,kind:signal.kind,channel:signal.channel,number:signal.number,mode:query<HTMLSelectElement>('#midi-mode').value as MidiBinding['mode'],min:0,max:1,pickup:true};
      config.midi.bindings=config.midi.bindings.filter(b=>b.target!==target&&!(b.kind===binding.kind&&b.channel===binding.channel&&b.number===binding.number));
      config.midi.bindings.push(binding);controls.clear();stopLearning();changed();message(`已绑定 ${label(target)} · ${signal.kind==='cc'?'CC':'音符'} ${signal.number} / CH ${signal.channel}`);return;
    }
    for(const binding of getConfig().midi.bindings){
      const key=JSON.stringify(binding);let control=controls.get(key);if(!control){control=new MidiControl();controls.set(key,control);}
      const value=control.value(signal,binding,controlValue(getConfig(),binding.target));
      if(value!==null){applyControl(getConfig(),binding.target,value);changed();message(`${label(binding.target)} · ${binding.target.startsWith('scene:')?'已切换':`${Math.round(value*100)}%`}`);}
    }
  };
  async function selectPort(id:string){
    const generation=++portGeneration,previous=port;port=null;controls.clear();stopLearning();
    if(previous){previous.onmidimessage=null;void previous.close().catch(()=>{});}
    const next=access?.inputs.get(id);if(!next||next.state!=='connected'){message('未发现 MIDI 输入。插入 MiniLab 后会自动检测。');return;}
    // Opening also emits statechange; retain the selection before awaiting to avoid reopening recursively.
    port=next;
    try{await next.open();if(generation!==portGeneration||!enabled){void next.close().catch(()=>{});return;}port.onmidimessage=onMessage;message(`已连接 ${next.name??'MIDI'} · 打开映射，绑定打击垫与旋钮。`);}
    catch{if(generation===portGeneration)port=null;message('设备无法打开，请检查其他 MIDI 软件是否独占了端口。');}
  }
  function refreshPorts(){
    if(!access||!enabled)return;
    const inputs=Array.from(access.inputs.values()).filter(p=>p.state==='connected');
    const selected=inputs.find(p=>p.id===port?.id)??inputs.find(p=>/minilab|arturia/i.test(p.name??''))??inputs[0];
    devices.replaceChildren(...inputs.map(p=>new Option(p.name??'MIDI 输入',p.id)));devices.hidden=inputs.length===0;
    if(selected)devices.value=selected.id;
    if(!selected||selected.id!==port?.id)void selectPort(selected?.id??'');
  }
  connect.addEventListener('click',async()=>{
    if(connecting){connectAttempt++;connecting=false;connect.textContent='连接 MiniLab / MIDI';message('已取消连接。若没有出现授权提示，请用 Chrome / Edge 打开本机页面。');return;}
    if(enabled){enabled=false;portGeneration++;if(port){port.onmidimessage=null;void port.close().catch(()=>{});}port=null;if(access)access.onstatechange=null;controls.clear();stopLearning();devices.hidden=true;connect.textContent='连接 MiniLab / MIDI';message('MIDI 已断开，画面保持当前参数。');return;}
    if(!navigator.requestMIDIAccess||!window.isSecureContext){message('请在本机 Chrome / Edge 的 localhost 页面连接 MIDI。');return;}
    connecting=true;const attempt=++connectAttempt;connect.textContent='取消连接';message('等待 MIDI 访问许可；若没有提示，请用 Chrome / Edge 打开 localhost 页面。');
    try{const granted=await navigator.requestMIDIAccess({sysex:false});if(attempt!==connectAttempt)return;access=granted;enabled=true;connect.textContent='断开 MIDI';access.onstatechange=refreshPorts;refreshPorts();}
    catch(error){if(attempt===connectAttempt)message(error instanceof DOMException&&error.name==='NotAllowedError'?'MIDI 访问未获允许，请在浏览器站点权限中允许后重试。':'MIDI 连接失败，请检查设备连接后重试。');}
    finally{if(attempt===connectAttempt){connecting=false;if(!enabled)connect.textContent='连接 MiniLab / MIDI';}}
  });
  devices.addEventListener('change',()=>void selectPort(devices.value));
  query('#midi-learn').addEventListener('click',()=>{
    if(learning){stopLearning();message('已取消学习。');return;}
    if(!port){message('请先连接一个 MIDI 输入设备。');return;}
    learning=query<HTMLSelectElement>('#midi-target').value as MidiTarget;query('#midi-learn').textContent='取消';message(`等待 ${label(learning)}：按打击垫或转动旋钮…`);
  });
  query('#scene-b').addEventListener('change',()=>{getConfig().performance.sceneB=Number(query<HTMLSelectElement>('#scene-b').value);changed();});
  query('#mix-enabled').addEventListener('change',()=>{getConfig().performance.enabled=query<HTMLInputElement>('#mix-enabled').checked;changed();});
  query('#scene-mix').addEventListener('input',()=>{getConfig().performance.enabled=true;getConfig().performance.mix=Number(query<HTMLInputElement>('#scene-mix').value);changed();});
  query('#midi-bindings').addEventListener('click',e=>{const button=(e.target as HTMLElement).closest<HTMLElement>('[data-unlearn]');if(button){getConfig().midi.bindings=getConfig().midi.bindings.filter(b=>b.target!==button.dataset.unlearn);controls.clear();changed();}});
  query('#midi-bindings').addEventListener('change',e=>{
    const input=e.target as HTMLInputElement,key=input.dataset.bindingKey,binding=getConfig().midi.bindings.find(b=>b.target===input.closest<HTMLElement>('[data-binding]')?.dataset.binding);
    if(!binding||!key)return;
    if(key==='mode')binding.mode=input.value as MidiBinding['mode'];
    else if(key==='pickup')binding.pickup=input.checked;
    else if((key==='min'||key==='max')&&Number.isFinite(input.valueAsNumber))binding[key]=Math.max(0,Math.min(1,input.valueAsNumber/100));
    controls.clear();changed();
  });
  return {update(config:Config){
    query('.deck-a').textContent=`A · ${scenePresets.find(p=>p.field.style===config.field.style)?.name??'当前视觉'}`;
    query<HTMLSelectElement>('#midi-deck').value=config.performance.padTarget;
    query<HTMLSelectElement>('#scene-b').value=String(config.performance.sceneB);query<HTMLInputElement>('#mix-enabled').checked=config.performance.enabled;
    const mix=query<HTMLInputElement>('#scene-mix');if(document.activeElement!==mix)mix.value=String(config.performance.mix);query('#mix-value').textContent=`${Math.round(config.performance.mix*100)}%`;
    const key=JSON.stringify(config.midi.bindings);if(rowsKey===key)return;rowsKey=key;controls.clear();query('#midi-count').textContent=String(config.midi.bindings.length);
    query('#midi-bindings').innerHTML=config.midi.bindings.length?config.midi.bindings.map(b=>`<div class="midi-binding" data-binding="${b.target}"><div><strong>${label(b.target)}</strong><span>${b.kind==='cc'?'CC':'音符'} ${b.number} · CH ${b.channel}</span><button data-unlearn="${b.target}" aria-label="移除 ${label(b.target)} 映射">×</button></div>${b.target.startsWith('scene:')?'':`<div class="binding-options"><select aria-label="${label(b.target)} 编码模式" data-binding-key="mode">${modes.map(([v,n])=>`<option value="${v}" ${b.mode===v?'selected':''}>${n}</option>`).join('')}</select><label>起<input type="number" aria-label="${label(b.target)} 起点" data-binding-key="min" min="0" max="100" value="${Math.round(b.min*100)}"/></label><label>止<input type="number" aria-label="${label(b.target)} 终点" data-binding-key="max" min="0" max="100" value="${Math.round(b.max*100)}"/></label><label title="绝对值旋钮经过当前值才接管"><input type="checkbox" data-binding-key="pickup" ${b.pickup?'checked':''}/>接管</label></div>`}</div>`).join(''):'<p class="fine">还没有映射。可先绑定 8 个打击垫，再绑定混合、色相与点缀旋钮。</p>';
  }};
}
