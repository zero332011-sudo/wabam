import {getDB,saveDB,getUser} from '../database/db.js';
import {isDeveloper} from '../utils/permissions.js';
import {getTargetJid} from '../utils/helpers.js';
import {ranks} from '../config/settings.js';
export async function rankCommand(sock,m,text) {
  const jid=m.key.remoteJid,s=m.key.participant||jid,p=text.trim().split(/\s+/),cmd=p[0];
  if(cmd==='.لقب'){
    const name=p.slice(1).join(' ').trim();if(!name){await sock.sendMessage(jid,{text:'اكتب: .لقب اللقب الجديد (50 جنيه من المحفظة)'});return true;}
    const db=getDB();db.users[s] ||= getUser(s);
    if(!isDeveloper(s)&&db.users[s].wallet<50){await sock.sendMessage(jid,{text:'تحتاج 50 جنيه في المحفظة.'});return true;}
    if(!isDeveloper(s))db.users[s].wallet-=50;db.users[s].nickname=name.slice(0,30);saveDB(db);
    await sock.sendMessage(jid,{text:`🏷️ تم تغيير لقبك إلى ${db.users[s].nickname}.`});return true;
  }
  if(cmd==='.ترقيه'){
    if(!isDeveloper(s)){await sock.sendMessage(jid,{text:'⛔ للمطورين فقط.'});return true;}
    const n=Number(p[1]),target=getTargetJid(m)||s;
    if(!Number.isInteger(n)||n<0||n>=ranks.length){await sock.sendMessage(jid,{text:'استخدم رقم رتبة من 0 إلى 17.'});return true;}
    const db=getDB();db.users[target] ||= getUser(target);db.users[target].rank=n;saveDB(db);
    await sock.sendMessage(jid,{text:`👑 الرتبة الجديدة: ${ranks[n]}`,mentions:[target]});return true;
  }
  return false;
}
