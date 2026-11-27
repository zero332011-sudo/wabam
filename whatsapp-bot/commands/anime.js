import fs from 'node:fs';
import path from 'node:path';
import {downloadMediaMessage} from '@whiskeysockets/baileys';
import {getDB,saveDB} from '../database/db.js';
import {isDeveloper} from '../utils/permissions.js';

const mediaDir=path.resolve(process.env.MEDIA_DIR || path.join(process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || '.', 'anime', 'media'));
const safe=s=>String(s||'').replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,80);
const parsePair=value=>String(value||'').split('|').map(x=>x.trim());

export async function animeCommand(sock,m,text) {
  const jid=m.key.remoteJid,sender=m.key.participant||jid,parts=text.trim().split(/\s+/),cmd=parts[0],db=getDB();
  if(cmd==='.انمي') {
    const names=Object.keys(db.anime);
    await sock.sendMessage(jid,{text:names.length?'🍥 مكتبة الأنمي\n'+names.map((x,i)=>`${i+1}. ${x} — ${Object.keys(db.anime[x].sections||{}).length} قسم`).join('\n'):'المكتبة فارغة.'});
    return true;
  }
  if(cmd==='.حلقات'||cmd==='.حلقه') {
    const [anime,section,episodeNo]=parsePair(parts.slice(1).join(' '));
    const episodes=db.anime[anime]?.sections?.[section];
    if(!episodes){await sock.sendMessage(jid,{text:'الأنمي أو القسم غير موجود. الصيغة: .حلقات اسم الأنمي|اسم القسم'});return true;}
    if(cmd==='.حلقات') {
      const list=episodes.map(e=>typeof e==='string'?path.basename(e):'الحلقة '+e.number).join('\n');
      await sock.sendMessage(jid,{text:list?'📺 حلقات '+anime+' - '+section+'\n'+list:'لا توجد حلقات مضافة لهذا القسم.'});
      return true;
    }
    const item=episodes.find(e=>String(typeof e==='string'?path.parse(e).name:e.number)===String(episodeNo));
    if(!episodeNo||!item){await sock.sendMessage(jid,{text:'الحلقة غير موجودة. استخدم: .حلقه الأنمي|القسم|رقم الحلقة'});return true;}
    const file=path.resolve(typeof item==='string'?item:item.file);
    if(!file.startsWith(mediaDir+path.sep)||!fs.existsSync(file)){await sock.sendMessage(jid,{text:'ملف الحلقة غير موجود على الاستضافة.'});return true;}
    const buffer=fs.readFileSync(file),ext=path.extname(file).toLowerCase();
    if(['.mp4','.mov','.webm'].includes(ext)) await sock.sendMessage(jid,{video:buffer,caption:'📺 '+anime+' - '+section+' - الحلقة '+episodeNo});
    else await sock.sendMessage(jid,{document:buffer,fileName:path.basename(file),mimetype:'application/octet-stream',caption:'📺 '+anime+' - '+section+' - الحلقة '+episodeNo});
    return true;
  }
  if(!['.اضافه','.حذف'].includes(cmd)) return false;
  if(!isDeveloper(sender)){await sock.sendMessage(jid,{text:'⛔ إدارة مكتبة الأنمي للمطورين فقط.'});return true;}
  if(parts[1]==='انمي'&&cmd==='.اضافه') {
    const name=parts.slice(2).join(' ').trim();if(!name){await sock.sendMessage(jid,{text:'اكتب اسم الأنمي.'});return true;}
    db.anime[name] ||= {sections:{}};saveDB(db);await sock.sendMessage(jid,{text:'✅ تمت إضافة الأنمي: '+name});return true;
  }
  if(parts[1]==='قسم'&&cmd==='.اضافه') {
    const [anime,section]=parsePair(parts.slice(2).join(' '));
    if(!anime||!section||!db.anime[anime]){await sock.sendMessage(jid,{text:'الاستخدام: .اضافه قسم اسم_الانمي|اسم_القسم'});return true;}
    db.anime[anime].sections ||= {};db.anime[anime].sections[section] ||= [];saveDB(db);
    await sock.sendMessage(jid,{text:'✅ تمت إضافة قسم '+section+' داخل '+anime+'.'});return true;
  }
  if(parts[1]==='حلقه'&&cmd==='.اضافه') {
    const [anime,section,requestedNo]=parsePair(parts.slice(2).join(' '));
    const episodes=db.anime[anime]?.sections?.[section];
    const media=m.message?.videoMessage||m.message?.documentMessage;
    const filename=String(media?.fileName||media?.title||'');
    const detected=filename.match(/(?:episode|ep|حلقة|الحلقه|e)?\s*0*(\d{1,4})(?!.*\d)/i)?.[1];
    const episodeNo=requestedNo||detected;
    if(!episodes||!media||!episodeNo){
      await sock.sendMessage(jid,{text:'أرفق الفيديو أو الملف واكتب .اضافه حلقه الأنمي|القسم|رقم الحلقة. يمكن ترك الرقم إذا كان اسم الملف يحتوي رقم الحلقة.'});
      return true;
    }
    try {
      fs.mkdirSync(mediaDir,{recursive:true});
      const buffer=await downloadMediaMessage(m,'buffer',{}, {logger:sock.logger||console});
      const ext=media.mimetype==='video/mp4'?'.mp4':(media.fileName?path.extname(media.fileName):'.bin')||'.bin';
      const file=path.join(mediaDir,safe(anime+'_'+section+'_'+episodeNo)+ext);
      fs.writeFileSync(file,buffer);
      const old=episodes.findIndex(e=>String(typeof e==='string'?path.parse(e).name:e.number)===String(episodeNo));
      const record={number:String(episodeNo),file};
      if(old>=0)episodes[old]=record;else episodes.push(record);
      saveDB(db);
      await sock.sendMessage(jid,{text:'✅ تم حفظ الحلقة '+episodeNo+' في '+anime+' / '+section+'.'});
    } catch(error) { console.error('Anime episode download:',error);await sock.sendMessage(jid,{text:'❌ فشل تحميل الملف. تأكد أن البوت استلم الفيديو/الملف مع الأمر.'}); }
    return true;
  }
  if(parts[1]==='قسم'&&cmd==='.حذف') {
    const [anime,section]=parsePair(parts.slice(2).join(' '));
    if(!db.anime[anime]?.sections?.[section]){await sock.sendMessage(jid,{text:'القسم غير موجود.'});return true;}
    delete db.anime[anime].sections[section];saveDB(db);await sock.sendMessage(jid,{text:'🗑️ تم حذف القسم.'});return true;
  }
  if(parts[1]==='انمي'&&cmd==='.حذف') {
    const name=parts.slice(2).join(' ').trim();if(!db.anime[name]){await sock.sendMessage(jid,{text:'الأنمي غير موجود.'});return true;}
    delete db.anime[name];saveDB(db);await sock.sendMessage(jid,{text:'🗑️ تم حذف الأنمي وأقسامه.'});return true;
  }
  return false;
}
