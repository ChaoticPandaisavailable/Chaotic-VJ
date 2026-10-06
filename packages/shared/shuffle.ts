import type { Config } from './config.ts';

export const shuffleSteps=127;
/** State 0 preserves the existing seed; every other stop is reproducible in a preset. */
export function compositionSeed(config:Config){return (config.renderer.seed+config.renderer.shuffle*7919)%1000000;}
export function setShuffle(config:Config,value:number){config.renderer.shuffle=Math.round(Math.min(1,Math.max(0,value))*shuffleSteps);}
export function nextShuffle(config:Config){config.renderer.shuffle=(config.renderer.shuffle+1)%(shuffleSteps+1);}
