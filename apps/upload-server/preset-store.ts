import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { presetInput,savedPresetSchema,type SavedPreset } from '../../packages/shared/saved-presets.ts';

/** Serial, atomic writes: a successful response means the preset is on disk. */
export class PresetStore {
  private entries:SavedPreset[]=[];
  private writes:Promise<unknown>=Promise.resolve();
  constructor(private file:string){}
  async load(){
    try{const data=JSON.parse(await fs.readFile(this.file,'utf8'));this.entries=savedPresetSchema.array().parse(data);}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  }
  list(){return structuredClone(this.entries);}
  save(input:unknown,id?:string):Promise<SavedPreset>{
    const data=presetInput.parse(input);
    const operation=this.writes.then(async()=>{
      if(id&&!this.entries.some(p=>p.id===id))throw new Error('预设已不存在，请另存。');
      if(!id&&this.entries.length>=100)throw new Error('已达到 100 个预设，请更新已有预设。');
      const entry={...data,id:id??randomUUID(),updatedAt:Date.now()};
      const next=[entry,...this.entries.filter(p=>p.id!==entry.id)];
      await fs.writeFile(this.file+'.next',JSON.stringify(next));await fs.rename(this.file+'.next',this.file);
      this.entries=next;return structuredClone(entry);
    });
    this.writes=operation.catch(()=>{});return operation;
  }
}
