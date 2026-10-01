import 'server-only';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
export async function optimizeVisualImage(bytes:Buffer) {
 if(!bytes.length||bytes.length>20*1024*1024)throw Error('VISUAL_FILE_SIZE');
 const options={limitInputPixels:40_000_000,failOn:'warning' as const};
 try{
  const info=await sharp(bytes,options).metadata();
  if(!['jpeg','png','webp'].includes(info.format||'')||(info.pages||1)!==1||!info.width||!info.height)throw Error('VISUAL_IMAGE_INVALID');
  // Decode and re-encode every byte; no EXIF/XMP/ICC passthrough, no SVG/GIF,
  // no animation, no crop/upscale, auto-orient before bounding the long edge.
  const {data:master,info:output}=await sharp(bytes,options).rotate().resize({width:2560,height:2560,fit:'inside',withoutEnlargement:true}).webp({quality:86,effort:4}).toBuffer({resolveWithObject:true});
  const thumbnail=await sharp(master,options).resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).webp({quality:76}).toBuffer();
  if(master.length>20*1024*1024||thumbnail.length>2*1024*1024)throw Error('VISUAL_FILE_SIZE');
  return {master,thumbnail,width:output.width,height:output.height,byte_size:master.length,thumbnail_bytes:thumbnail.length,sha256:createHash('sha256').update(master).digest('hex')};
 }catch(e){if(e instanceof Error&&e.message==='VISUAL_FILE_SIZE')throw e;throw Error('VISUAL_IMAGE_INVALID');}
}
