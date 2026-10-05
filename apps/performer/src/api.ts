export async function api<T = {ok:boolean}>(url:string,body?:unknown,method=body===undefined?'GET':'POST'):Promise<T>{
  const response=await fetch(url,{method,headers:{'Content-Type':'application/json','X-VJ-Request':'1'},body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json().catch(()=>({error:`请求失败 (${response.status})`}));if(!response.ok)throw new Error(result.error||'请求失败');return result;
}
export async function upload(file:File):Promise<{id:string;seq:number}>{
  if(file.size>12*1024*1024)throw new Error('图片不能超过 12 MB。');
  const response=await fetch('/api/photos',{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream','X-File-Name':encodeURIComponent(file.name),'X-VJ-Request':'1'},body:file});
  const result=await response.json();if(!response.ok)throw new Error(result.error);return result;
}
export const escapeHTML=(value:unknown)=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]!));
export const duration=(seconds:number)=>`${Math.floor(seconds/60)}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
export function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export function toast(message:string){const holder=document.querySelector<HTMLElement>('#toast');if(holder){holder.textContent=message;holder.classList.add('visible');setTimeout(()=>holder.classList.remove('visible'),6000);}}
