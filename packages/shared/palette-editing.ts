import { defaultConfig,type Config } from './config.ts';
import { moodPalette, type ColorLook } from './palette.ts';

/** A starting point for each authored look; manual edits remain untouched by XY motion. */
export const lookTexture:Record<ColorLook,number>={free:.35,dusk:.22,meadow:.42,gold:.64,storm:.78,prism:.36,cedar:.12,magma:.7};

export function editablePalette(config:Config,position?:{x:number;y:number}){
  const p=position??{x:config.colorMood.warmth,y:config.colorMood.richness};
  return config.colorMood.enabled?moodPalette(p.x,p.y,config.colorLook):config.palette;
}

/** Keep the five authored colour roles at their original scalar positions. */
export function capturePalette(config:Config,position?:{x:number;y:number}){
  const wasMood=config.colorMood.enabled;
  if(config.colorMood.enabled){
    const palette=editablePalette(config,position);
    config.palette.colors=[...palette.colors];config.palette.background=palette.background;
    config.palette.mapping='cinematic';
  }
  config.colorMood.enabled=false;config.colorMotion.enabled=false;
  if(wasMood||!config.paletteBaseline)rememberPalette(config);
}

export type PaletteSettings=Pick<Config,'palette'|'colorMood'|'colorLook'|'colorMotion'>;
export function paletteSettings(config:Config):PaletteSettings{
  return structuredClone({palette:config.palette,colorMood:config.colorMood,colorLook:config.colorLook,colorMotion:config.colorMotion});
}
export function rememberPalette(config:Config){config.paletteBaseline=paletteSettings(config);}
/** Return the prior colour state for Undo; scene, lighting, MIDI and output stay untouched. */
export function resetPalette(config:Config):PaletteSettings{
  const undo=paletteSettings(config);
  const baseline=config.paletteBaseline??(config.colorMood.enabled?{...paletteSettings(config),palette:structuredClone(defaultConfig.palette)}:paletteSettings(defaultConfig));
  Object.assign(config,structuredClone(baseline));return undo;
}
