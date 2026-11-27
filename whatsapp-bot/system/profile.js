import {getDB,getUser,saveDB} from '../database/db.js';
import {ranks} from '../config/settings.js';
export function getProfile(jid){return getUser(jid);}
export async function sendProfile(sock,message,target){
 const jid=message.key.remoteJid, who=target||message.key.participant||jid, u=getUser(who);
 let pp;try{pp=await sock.profilePictureUrl(who,'image');}catch{}
 const caption=`👤 معلومات العضو\n🏷️ اللقب: ${u.nickname}\n📱 الرقم: ${who.split('@')[0]}\n🆔 المعرف: ${who}\n👑 الرتبة: ${ranks[u.rank]||'غير محددة'}\n🏦 البنك: ${u.bank} جنيه\n👛 المحفظة: ${u.wallet} جنيه`;
 await sock.sendMessage(jid,pp?{image:{url:pp},caption}:{text:caption},{quoted:message});
}
export function updateNickname(jid,nickname){const db=getDB();db.users[jid] ||= {jid,nickname:'عضو جديد',rank:17,bank:40,wallet:0,hearts:3,warnings:0};db.users[jid].nickname=nickname;saveDB(db);}
