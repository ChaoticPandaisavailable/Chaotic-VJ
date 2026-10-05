import './style.css';
import './instrument.css';
import { api, escapeHTML, toast, upload, duration } from './api.ts';
import { startPerformer } from './performer.ts';
import type { Snapshot } from '../../../packages/shared/config.ts';

const app=document.querySelector<HTMLDivElement>('#app')!;
if(location.pathname==='/upload')void audience();else void initialize();
async function initialize(){try{const state=await api<{admin:boolean;local:boolean}>('/api/bootstrap');if(state.admin){const initial=await api<Snapshot>('/api/state');startPerformer(app,location.pathname==='/output',state.local,initial);}else login();}catch(e){app.innerHTML=`<main class="arrival"><h1>连接暂时中断</h1><p>${escapeHTML((e as Error).message)}</p><button onclick="location.reload()">重新连接</button></main>`;}}
function login(){app.innerHTML=`<main class="arrival"><span class="wordmark">CHAOTIC<span class="accent">/</span></span><p class="eyebrow">PERFORMER ACCESS</p><h1>回到现场。</h1><p>输入电脑上的管理密钥，控制这场视觉演出。</p><form id="login"><input name="key" type="password" autocomplete="current-password" placeholder="管理密钥" aria-label="管理密钥" required/><button class="primary">连接控制台 ↗</button></form><p class="muted">密钥位于电脑项目的 .runtime/admin-key.txt</p><p id="error" role="alert"></p></main>`;document.querySelector('#login')!.addEventListener('submit',e=>{e.preventDefault();void api('/api/login',{key:(document.querySelector('[name=key]')as HTMLInputElement).value}).then(initialize).catch(e=>{document.querySelector('#error')!.textContent=e.message;});});}
async function audience(){
  app.innerHTML=`<main class="audience"><header><span class="wordmark">CHAOTIC<span class="accent">/</span></span><span class="eyebrow">LIVE VISUALS</span></header><div class="audience-art" aria-hidden="true"><span>YOUR IMAGE.<br/>OUR CHAOS.</span><i>↗</i></div><span class="eyebrow">BECOME PART OF THE SET</span><h1>让你的照片，<br/>流入这一刻。</h1><p>照片会化成舞台上的纹理、碎片与残影，<br/>短暂浮现，再回到混沌之中。</p><label class="primary upload-choice">选择一张照片 <span>＋</span><input id="audience-file" type="file" accept="image/jpeg,image/png,image/webp"/></label><p class="fine">JPEG / PNG / WebP · 最大 12 MB<br/>仅上传你有权分享、适合现场展示的照片。照片会保留在演出电脑供管理者清理。</p><div id="receipts" aria-live="polite"></div><footer>ONE IMAGE. A FLEETING TRACE.</footer><div id="toast" role="status"></div></main>`;
  const ids:string[]=[];await api('/api/guest',{}).catch(e=>toast(e.message));
  document.querySelector<HTMLInputElement>('#audience-file')!.onchange=async(e)=>{const input=e.target as HTMLInputElement;const file=input.files?.[0];if(!file)return;input.disabled=true;try{const r=await upload(file);ids.push(r.id);toast(`已收到 · 编号 ${r.seq}`);await refresh();}catch(e){toast((e as Error).message);}finally{input.disabled=false;input.value='';}};
  const statuses:Record<string,string>={Processing:'正在处理',Pending:'等待现场审核',Queued:'已加入队列',Active:'正在融入画面',Fading:'正在消散',Done:'已完成，谢谢你留下的痕迹',Deleted:'已由现场移除',Failed:'处理未成功'};
  async function refresh(){const results=await Promise.all(ids.map(async id=>{try{return await api<{seq:number;status:string;eta:number|null;paused:boolean;error?:string}>(`/api/receipt/${id}`);}catch{return null;}}));document.querySelector('#receipts')!.innerHTML=results.filter(r=>r).reverse().map(r=>`<article class="receipt"><span class="eyebrow">PHOTO ${String(r!.seq).padStart(3,'0')}</span><strong>${statuses[r!.status]}</strong><p>${r!.error?escapeHTML(r!.error):['Queued','Processing'].includes(r!.status)?r!.paused?'现场已暂停，恢复后继续排队':`预计等待 ${duration(r!.eta??0)}${r!.status==='Processing'?'，处理时间另计':''}`:''}</p></article>`).join('');}
  setInterval(()=>void refresh(),2000);
}
