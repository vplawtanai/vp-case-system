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
export function visualMetadata(input:unknown) {
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('VISUAL_INVALID');
 const d=input as Record<string,unknown>;
 const name=(k:string)=>{if(typeof d[k]!=='string'||!(d[k] as string).trim()||(d[k] as string).length>160)throw Error('VISUAL_INVALID');return (d[k] as string).trim();};
 if(!validKey(d.artwork_key)||!VISUAL_TYPES.includes(d.asset_type as typeof VISUAL_TYPES[number])||!VISUAL_SCOPES.includes(d.scope as typeof VISUAL_SCOPES[number])||!VISUAL_STATUSES.includes(d.status as typeof VISUAL_STATUSES[number])||d.overlay_ready!==true)throw Error('VISUAL_INVALID');
 if(typeof d.theme!=='string'||d.theme.length>80||!Array.isArray(d.tags)||d.tags.length>12||d.tags.some(t=>typeof t!=='string'||t.length>40))throw Error('VISUAL_INVALID');
 return {artwork_key:d.artwork_key,name_th:name('name_th'),name_en:name('name_en'),asset_type:d.asset_type as string,scope:d.scope as string,status:d.status as string,theme:d.theme.trim(),tags:[...new Set((d.tags as string[]).map(t=>t.trim()).filter(Boolean))],overlay_ready:true};
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
