import {getDB,saveDB} from '../database/db.js';
export function addWarning(group,jid) {
 const db=getDB(); db.users[jid] ||= {jid,nickname:'عضو جديد',rank:17,bank:40,wallet:0,hearts:3,warnings:0};
 const u=db.users[jid]; u.warnings=(u.warnings||0)+1; let muted=false;
 if(u.warnings>=3){db.muted[jid]={group,until:Date.now()+30*60*1000};u.warnings=0;muted=true;}
 saveDB(db); return {warnings:u.warnings,muted};
}
export function isMuted(jid,group) {const db=getDB(),m=db.muted[jid];if(!m)return false;if(m.until<=Date.now()||(m.group&&group&&m.group!==group)){if(m.until<=Date.now()){delete db.muted[jid];saveDB(db);}return false;}return true;}
export function removeMute(jid){const db=getDB();delete db.muted[jid];saveDB(db);}
