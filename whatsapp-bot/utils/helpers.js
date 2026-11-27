export function getText(message) {
  let m = message.message || {};
  for (const key of ['ephemeralMessage','viewOnceMessage','viewOnceMessageV2','viewOnceMessageV2Extension']) {
    if (m[key]?.message) m = m[key].message;
  }
  return (m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption ||
    m.videoMessage?.caption || m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId || '').trim();
}
export const getSender = m => m.key.participant || m.key.remoteJid;
export function getMentioned(m) {
  const message = m.message || {};
  const context = message.extendedTextMessage?.contextInfo ||
    message.imageMessage?.contextInfo || message.videoMessage?.contextInfo ||
    message.documentMessage?.contextInfo || {};
  return context.mentionedJid || [];
}
export function getRepliedJid(m) {
  const message = m.message || {};
  const ctx = message.extendedTextMessage?.contextInfo ||
    message.imageMessage?.contextInfo || message.videoMessage?.contextInfo ||
    message.documentMessage?.contextInfo || {};
  return ctx.participant || ctx.participantPn || ctx.participantAlt || null;
}
export function getTargetJid(m) { return getMentioned(m)[0] || getRepliedJid(m) || null; }
export function normalizeAnswer(s) {
  return String(s || '').normalize('NFKC').toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, '').replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^\p{L}\p{N}]/gu, '');
}
export function normalizeNumber(s) { return String(s||'').replace(/\D/g,''); }
export function jidNumber(jid) { return String(jid||'').split('@')[0].split(':')[0].replace(/\D/g,''); }
