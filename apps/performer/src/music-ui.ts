import type { Config } from '../../../packages/shared/config.ts';
import type { MusicResponse } from '../../../packages/audio-engine/music-forces.ts';
import './music-ui.css';

const range=(key:string,label:string,hint:string,max=1,step=.01)=>`<label class="setting"><span>${label}<output data-value="music.${key}"></output></span><input type="range" min="0" max="${max}" step="${step}" data-setting="music.${key}" aria-label="${label}" aria-describedby="music-hint-${key}"/><small id="music-hint-${key}">${hint}</small></label>`;

export function mountMusic(app:HTMLElement){
  app.querySelector('.macro-grid')!.insertAdjacentHTML('beforebegin',`<section class="music-panel" aria-label="音乐施力">
    <div class="panel-title"><span>音乐施力</span><small class="music-state">自然演化</small></div>
    ${range('amount','音乐参与度','原生混沌：音乐推动分层气流')}
    <div class="music-controls">${range('impact','推动','低频起音推动云气，带轻微震颤')}${range('flow','流动','实时低频越强，前后云层漂流越快')}${range('detail','细节','高频带动前景薄雾与局部微光')}</div>
    <div class="music-meters" aria-label="实时音乐响应">${[['impact','推动'],['flow','流动'],['detail','细节']].map(([key,label])=>`<div><span>${label}</span><meter data-music-meter="${key}" min="0" max="1" value="0" aria-label="${label}响应"></meter></div>`).join('')}</div>
    <div class="music-sections" role="group" aria-label="音乐段落"><button data-action="music-steady" aria-pressed="true">平稳</button><button data-action="music-build" aria-pressed="false">蓄力</button><button data-action="music-release">释放 ↗</button></div>
    <details class="music-calibration"><summary>节拍与校准</summary><button data-action="align-beat" class="music-align">对齐这一拍</button>${range('delayMs','画面延后 / ms','画面抢在实际声音之前时增加',250,5)}<p class="fine">流动跟随实时声音，BPM 只作节拍参考。蓄力与释放由你触发。</p></details>
  </section>`);
  const panel=app.querySelector<HTMLElement>('.music-panel')!;
  const state=panel.querySelector<HTMLElement>('.music-state')!;
  const release=panel.querySelector<HTMLButtonElement>('[data-action=music-release]')!;
  return {
    update(config:Config){
      for(const section of ['steady','build'])panel.querySelector(`[data-action=music-${section}]`)!.setAttribute('aria-pressed',String(config.music.section===section));
    },
    live(response:MusicResponse){
      for(const key of ['impact','flow','detail'] as const)panel.querySelector<HTMLMeterElement>(`[data-music-meter=${key}]`)!.value=response[key];
      state.textContent=response.release>.1?'释放中':response.pressure>.15?'蓄力中':response.activity>.03?'声音驱动流动':'自然演化';
      release.classList.toggle('active',response.release>.1);
    }
  };
}
