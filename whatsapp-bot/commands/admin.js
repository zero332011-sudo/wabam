import {getDB,saveDB} from '../database/db.js';
import {isBotManager,isOwner} from '../utils/permissions.js';
import {getTargetJid, getMentioned, getRepliedJid, jidNumber} from '../utils/helpers.js';

export async function adminCommand(sock,m,text) {
  const jid=m.key.remoteJid,s=m.key.participant||jid;
  const parts=text.trim().split(/\s+/);
  if(parts[0]!=='.اضافه'||parts[1]!=='مطور') return false;
  if(!isBotManager(s)){await sock.sendMessage(jid,{text:'⛔ الأمر للرتب من 17 إلى 20 والمطورين فقط.'});return true;}
  const target=getTargetJid(m);
  if(!target){await sock.sendMessage(jid,{text:'اعمل منشن للشخص أو رد على رسالته.'});return true;}
  if(isOwner(target)){await sock.sendMessage(jid,{text:'⛔ المطور الأساسي لا يمكن إضافته أو تعديل هويته من الأمر.'});return true;}
  const context = m.message?.extendedTextMessage?.contextInfo || m.message?.imageMessage?.contextInfo || m.message?.videoMessage?.contextInfo || {};
  const candidates = [...new Set([target, ...getMentioned(m), getRepliedJid(m), context.participantPn, context.participantAlt].filter(x => typeof x === 'string' && x.includes('@')) )];
  const number = candidates.map(jidNumber).find(n => n && n.length >= 8 && !n.startsWith('69033026138303'));
  const db=getDB();db.developers ||= [];
  for (const identity of candidates) if (!db.developers.includes(identity)) db.developers.push(identity);
  if (number && !db.developers.some(x => jidNumber(x) === number)) db.developers.push(number + '@s.whatsapp.net');
  const user = db.users[target] ||= { jid: target, nickname: 'عضو جديد', bank: 100, wallet: 0, hearts: 3, warnings: 0, xp: 0, xpMessageCount: 0 };
  user.rank = 20;
  saveDB(db);
  await sock.sendMessage(jid,{text:`👑 تمت إضافة @${target.split('@')[0]} مطورًا برتبة الإمبراطور.\n🆔 تم حفظ المعرف والرقم المتاحين.`,mentions:[target]});
  return true;
}
