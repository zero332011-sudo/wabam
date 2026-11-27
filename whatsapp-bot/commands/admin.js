import {getDB,saveDB} from '../database/db.js';
import {isBotManager,isOwner} from '../utils/permissions.js';
import {getTargetJid} from '../utils/helpers.js';

export async function adminCommand(sock,m,text) {
  const jid=m.key.remoteJid,s=m.key.participant||jid;
  const parts=text.trim().split(/\s+/);
  if(parts[0]!=='.اضافه'||parts[1]!=='مطور') return false;
  if(!isBotManager(s)){await sock.sendMessage(jid,{text:'⛔ الأمر للإمبراطور والرتب من 1 إلى 5 أو المطورين.'});return true;}
  const target=getTargetJid(m);
  if(!target){await sock.sendMessage(jid,{text:'اعمل منشن للشخص أو رد على رسالته.'});return true;}
  if(isOwner(target)){await sock.sendMessage(jid,{text:'⛔ المطور الأساسي لا يمكن إضافته أو تعديل هويته من الأمر.'});return true;}
  const db=getDB();db.developers ||= [];
  if(!db.developers.some(x=>x===target)){db.developers.push(target);saveDB(db);}
  await sock.sendMessage(jid,{text:`👑 تمت إضافة @${target.split('@')[0]} مطورًا.`,mentions:[target]});
  return true;
}
