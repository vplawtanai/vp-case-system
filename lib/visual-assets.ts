export const VISUAL_BUCKET = 'vp-visual-assets';
export const VISUAL_COOKIE = 'vp_visual_admin';
export const VISUAL_TYPES = ['journey','background','banner','illustration'] as const;
export const VISUAL_SCOPES = ['non_litigation','case','both'] as const;
export const VISUAL_STATUSES = ['draft','active','retired'] as const;
export type VisualAsset = {
 id:string; artwork_key:string; name_th:string; name_en:string; asset_type:string; scope:string; theme:string; tags:string[]; status:string;
 master_path:string; thumbnail_path:string; width:number; height:number; byte_size:number; thumbnail_bytes:number; sha256:string;
 overlay_ready:boolean; delete_pending:boolean; version:number; created_at:string; updated_at:string; master_url?:string; thumbnail_url?:string;
};
export type VisualMapping={scope:string;family_key:string;artwork_key:string};
export const validKey=(value:unknown):value is string=>typeof value==='string'&&/^[a-z][a-z0-9_-]{2,79}$/.test(value);
// Display codes refer to the immutable registry key, never a signed Storage URL.
// Existing, manually named keys retain their original representation.
export const visualAssetCode=(key:string)=>/^vp-img-[a-f0-9]{12}$/.test(key)?key.toUpperCase():key;
export const visualUseInstruction=(key:string,locale:string)=>locale==='en'
 ?`Use image ${visualAssetCode(key)} from the Visual Asset Library`
 :`ใช้ภาพ ${visualAssetCode(key)} จากคลังภาพระบบ`;
export function automaticVisualMetadata(id:string){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error('VISUAL_INVALID');
 // Stable across upload retries; the registry UNIQUE constraint prevents collisions
 // from replacing another image. The upload ID is generated on the server.
 const artwork_key=`vp-img-${id.replace(/-/g,'').slice(0,12).toLowerCase()}`;
 const code=visualAssetCode(artwork_key);
 return {artwork_key,name_th:`ภาพ ${code}`,name_en:`Image ${code}`,asset_type:'illustration',scope:'both',status:'draft',theme:'',tags:[] as string[],overlay_ready:false};
}
export function visualMetadata(input:unknown) {
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('VISUAL_INVALID');
 const d=input as Record<string,unknown>;
 const name=(k:string)=>{if(typeof d[k]!=='string'||!(d[k] as string).trim()||(d[k] as string).length>160)throw Error('VISUAL_INVALID');return (d[k] as string).trim();};
 if(!validKey(d.artwork_key)||!VISUAL_TYPES.includes(d.asset_type as typeof VISUAL_TYPES[number])||!VISUAL_SCOPES.includes(d.scope as typeof VISUAL_SCOPES[number])||!VISUAL_STATUSES.includes(d.status as typeof VISUAL_STATUSES[number])||typeof d.overlay_ready!=='boolean')throw Error('VISUAL_INVALID');
 if(typeof d.theme!=='string'||d.theme.length>80||!Array.isArray(d.tags)||d.tags.length>12||d.tags.some(t=>typeof t!=='string'||t.length>40))throw Error('VISUAL_INVALID');
 return {artwork_key:d.artwork_key,name_th:name('name_th'),name_en:name('name_en'),asset_type:d.asset_type as string,scope:d.scope as string,status:d.status as string,theme:d.theme.trim(),tags:[...new Set((d.tags as string[]).map(t=>t.trim()).filter(Boolean))],overlay_ready:d.overlay_ready};
}
// Future readers resolve FAMILY identity, never Work Type. Only explicitly active
// artwork is eligible; until an Admin maps both/universal the caller uses neutral UI.
export function resolveVisualAsset(assets:VisualAsset[],mappings:VisualMapping[],scope:'case'|'non_litigation',family:string):VisualAsset|null {
 for(const [s,f]of [[scope,family],['both',family],['both','universal']]){
  const map=mappings.find(m=>m.scope===s&&m.family_key===f);
  const asset=assets.find(a=>a.artwork_key===map?.artwork_key&&a.status==='active'&&!a.delete_pending&&(a.scope==='both'||a.scope===scope));
  if(asset)return asset;
 }return null;
}
