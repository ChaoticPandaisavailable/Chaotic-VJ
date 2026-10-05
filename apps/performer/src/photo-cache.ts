import { Texture, SRGBColorSpace } from 'three';
import type { PhotoRecord } from '../../../packages/shared/config.ts';
export class PhotoCache {
  private entries=new Map<string,{texture:Texture|null;abort:AbortController;failed:boolean}>();
  sync(photos:PhotoRecord[],activeId:string|null){
    const active=photos.find(p=>p.id===activeId);
    const queued=photos.filter(p=>p.status==='Queued');
    const desired=[...(active?[active]:[]),...queued.slice(0,active?2:3)];
    const ids=new Set(desired.map(p=>p.id));
    for(const [id,entry] of this.entries)if(!ids.has(id)){entry.abort.abort();entry.texture?.dispose();this.entries.delete(id);}
    for(const photo of desired)if(!this.entries.has(photo.id)){
      const entry={texture:null as Texture|null,abort:new AbortController(),failed:false};this.entries.set(photo.id,entry);
      void (async()=>{let bitmap:ImageBitmap|null=null;try{const response=await fetch(`/media/${photo.id}.webp`,{signal:entry.abort.signal});if(!response.ok)throw new Error('Texture fetch failed');bitmap=await createImageBitmap(await response.blob(),{imageOrientation:'flipY'});if(entry.abort.signal.aborted||this.entries.get(photo.id)!==entry){bitmap.close();return;}
        const texture=new Texture(bitmap);texture.colorSpace=SRGBColorSpace;texture.needsUpdate=true;texture.addEventListener('dispose',()=>bitmap?.close());entry.texture=texture;
      }catch{bitmap?.close();if(!entry.abort.signal.aborted)entry.failed=true;}})();
    }
  }
  get(id:string){return this.entries.get(id);}
  dispose(){for(const e of this.entries.values()){e.abort.abort();e.texture?.dispose();}this.entries.clear();}
}
