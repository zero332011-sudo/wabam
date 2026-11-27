import fs from 'node:fs';
import path from 'node:path';
export const mediaDir='./anime/media';
export function ensureMediaDir(){fs.mkdirSync(mediaDir,{recursive:true});}
export function safeName(s){return String(s).replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,80);}
export function mediaPath(name){ensureMediaDir();return path.join(mediaDir,safeName(name));}
