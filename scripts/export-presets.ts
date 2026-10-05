import { promises as fs } from 'node:fs';
import { configSchema, defaultConfig, scenePresets } from '../packages/shared/config.ts';

await fs.mkdir('presets',{recursive:true});
const stableOrder=['chaos','storm','strings','torrent','organism','prism','ribbon','vortex','rift','nebula','facets'];
for(const preset of scenePresets){
  const config=configSchema.parse({...structuredClone(defaultConfig),macros:preset.macros,field:preset.field});
  const name=preset.label.split(' / ')[1].toLowerCase();
  const index=stableOrder.indexOf(name);
  await fs.writeFile(`presets/${String(index+1).padStart(2,'0')}-${name}.json`,JSON.stringify(config,null,2)+'\n');
}
console.log(`Exported ${scenePresets.length} presets.`);
