import type { Config } from '../../../packages/shared/config.ts';
import { nextShuffle } from '../../../packages/shared/shuffle.ts';
import './shuffle-ui.css';

export function mountShuffle(app:HTMLElement,getConfig:()=>Config,changed:()=>void){
  app.querySelector('.chaotic-control')!.insertAdjacentHTML('afterend',`<section class="shuffle-control" aria-label="构图重排">
    <button class="shuffle-button" type="button" aria-label="Shuffle 重新生成构图"><span aria-hidden="true">↻</span> Shuffle</button>
    <p>按一下重排画面<br/>保留配色与参数</p>
  </section>`);
  app.querySelector<HTMLButtonElement>('.shuffle-button')!.onclick=()=>{nextShuffle(getConfig());changed();};
}
