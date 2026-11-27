import {getDB,saveDB,getUser} from '../database/db.js';
import {getMentioned} from '../utils/helpers.js';
export async function economyCommand(sock,m,text) {
  const jid=m.key.remoteJid,s=m.key.participant||jid,parts=text.trim().split(/\s+/),cmd=parts[0],u=getUser(s);
  if(cmd==='.بنك'||cmd==='.محفظه'||cmd==='.محفظة'){await sock.sendMessage(jid,{text:`🏦 البنك: ${u.bank} جنيه\n👛 المحفظة: ${u.wallet} جنيه`});return true;}
  if(cmd==='.تحويل'){
    const target=getMentioned(m)[0],amount=Number(parts.find(x=>/^\d+$/.test(x)));
    if(!target||!Number.isSafeInteger(amount)||amount<=0){await sock.sendMessage(jid,{text:'الاستخدام: .تحويل @العضو المبلغ'});return true;}
    if(target===s){await sock.sendMessage(jid,{text:'لا يمكنك التحويل لنفسك.'});return true;}
    const db=getDB();db.users[s] ||= u;db.users[target] ||= {jid:target,nickname:'عضو جديد',rank:17,bank:40,wallet:0,hearts:3,warnings:0};
    if(db.users[s].wallet<amount){await sock.sendMessage(jid,{text:'رصيد المحفظة غير كافٍ.'});return true;}
    db.users[s].wallet-=amount;db.users[target].wallet+=amount;db.transfers.push({from:s,to:target,amount,at:Date.now()});saveDB(db);
    await sock.sendMessage(jid,{text:`✅ تم تحويل ${amount} جنيه إلى @${target.split('@')[0]}.`,mentions:[target]});return true;
  }
  return false;
}
