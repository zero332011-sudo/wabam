const timers=new Map();
export async function lockGroupForPrayer(sock,jid){
 try { await sock.groupSettingUpdate(jid,'announcement'); if(timers.has(jid))clearTimeout(timers.get(jid));
 const t=setTimeout(async()=>{try{await sock.groupSettingUpdate(jid,'not_announcement');await sock.sendMessage(jid,{text:'🕌 انتهت فترة الصلاة، تم فتح المجموعة.'});}catch(e){console.error(e);}finally{timers.delete(jid);}},5*60*1000);
 timers.set(jid,t); return true;
 } catch(e){console.error('تعذر قفل المجموعة:',e);return false;}
}
export async function unlockGroup(sock,jid){try{if(timers.has(jid))clearTimeout(timers.get(jid));timers.delete(jid);await sock.groupSettingUpdate(jid,'not_announcement');return true;}catch{return false;}}
export const isGroupLocked=jid=>timers.has(jid);
