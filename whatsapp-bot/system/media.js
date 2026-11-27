import {downloadMediaMessage} from '@whiskeysockets/baileys';
export async function showMedia(sock,m){
 const jid=m.key.remoteJid;
 const ctx=m.message?.extendedTextMessage?.contextInfo;
 if(!ctx?.quotedMessage){await sock.sendMessage(jid,{text:'📎 رد على صورة أو فيديو أو ملف بالأمر .عرض.'});return true;}
 const quoted={key:{remoteJid:jid,id:ctx.stanzaId,participant:ctx.participant||m.key.participant,fromMe:false},message:ctx.quotedMessage};
 try {
  const buffer=await downloadMediaMessage(quoted,'buffer',{}, {logger:sock.logger||console,reuploadRequest:sock.updateMediaMessage});
  const q=ctx.quotedMessage;
  if(q.imageMessage) await sock.sendMessage(jid,{image:buffer,caption:q.imageMessage.caption||''});
  else if(q.videoMessage) await sock.sendMessage(jid,{video:buffer,caption:q.videoMessage.caption||''});
  else if(q.audioMessage) await sock.sendMessage(jid,{audio:buffer,mimetype:q.audioMessage.mimetype||'audio/ogg; codecs=opus',ptt:!!q.audioMessage.ptt});
  else if(q.stickerMessage) await sock.sendMessage(jid,{sticker:buffer});
  else if(q.documentMessage) await sock.sendMessage(jid,{document:buffer,fileName:q.documentMessage.fileName||'file',mimetype:q.documentMessage.mimetype||'application/octet-stream'});
  else {await sock.sendMessage(jid,{text:'نوع الوسائط ده مش مدعوم في .عرض.'});return true;}
  return true;
 } catch(error) {console.error('Show media:',error);await sock.sendMessage(jid,{text:'❌ مقدرتش أعيد إرسال الوسائط. ممكن تكون الرسالة قديمة أو غير متاحة.'});return true;}
}
