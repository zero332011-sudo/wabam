import { getDB, saveDB } from '../database/db.js';
import { isDeveloper } from '../utils/permissions.js';
import { getTargetJid, jidNumber } from '../utils/helpers.js';

async function canManage(sock, jid, sender) {
  if (isDeveloper(sender)) return true;
  try {
    const meta = await sock.groupMetadata(jid);
    return meta.participants.some(p =>
      (p.id === sender || p.lid === sender) && ['admin', 'superadmin'].includes(p.admin)
    );
  } catch { return false; }
}
async function isBotAdmin(sock, jid) {
  try {
    const meta = await sock.groupMetadata(jid);
    const me = sock.user || {};
    const botIds = new Set([me.id, me.lid].filter(Boolean));
    const botNumbers = new Set([jidNumber(me.id), jidNumber(me.lid)].filter(Boolean));
    return meta.participants.some(p => {
      const matchesId = botIds.has(p.id) || botIds.has(p.lid);
      const numbers = [jidNumber(p.id), jidNumber(p.lid), jidNumber(p.phoneNumber)];
      return (matchesId || numbers.some(n => n && botNumbers.has(n))) &&
        ['admin', 'superadmin'].includes(p.admin);
    });
  } catch { return false; }
}

export async function moderationCommand(sock, m, text) {
  const jid = m.key.remoteJid, sender = m.key.participant || jid;
  const normalized = text.trim().replace(/\s+/g, ' ');
  let cmd = normalized.split(' ')[0];
  if (normalized.startsWith('.كتم-')) cmd = '.كتم';
  else if (normalized.startsWith('.فك_كتم-') || normalized.startsWith('.فك-كتم-')) cmd = '.فك كتم';
  else if (normalized.startsWith('.فك كتم')) cmd = '.فك كتم';
  else if (normalized.startsWith('.طرد-')) cmd = '.طرد';
  else if (normalized === '.كتم الجروب' || normalized.startsWith('.كتم الجروب ')) cmd = '.كتم الجروب';
  else if (normalized === '.فك الجروب' || normalized.startsWith('.فك الجروب ')) cmd = '.فك الجروب';
  if (!['.كتم', '.فك', '.فك_كتم', '.فك كتم', '.كتم الجروب', '.فك الجروب', '.طرد'].includes(cmd)) return false;
  if (!jid.endsWith('@g.us')) {
    await sock.sendMessage(jid, { text: '🛡️ هذا الأمر متاح داخل المجموعات فقط.' });
    return true;
  }
  if (!await canManage(sock, jid, sender)) {
    await sock.sendMessage(jid, { text: '⛔ الأمر للمشرفين أو الرتب الإدارية والمطور فقط.' });
    return true;
  }
  if (cmd === '.كتم الجروب' || cmd === '.فك الجروب') {
    if (!await isBotAdmin(sock, jid)) {
      await sock.sendMessage(jid, { text: '❌ يجب أن يكون البوت مشرفًا في المجموعة.' });
      return true;
    }
    try {
      await sock.groupSettingUpdate(jid, cmd === '.كتم الجروب' ? 'announcement' : 'not_announcement');
      await sock.sendMessage(jid, { text: cmd === '.كتم الجروب' ? '🔒 تم إغلاق المجموعة أمام الأعضاء.' : '🔓 تم فتح المجموعة.' });
    } catch {
      await sock.sendMessage(jid, { text: '❌ واتساب رفض تغيير إعدادات المجموعة.' });
    }
    return true;
  }
  const target = getTargetJid(m);
  if (!target) {
    await sock.sendMessage(jid, { text: '👤 اعمل منشن للعضو أو رد على رسالته بالأمر.' });
    return true;
  }
  if (target === sender || isDeveloper(target)) {
    await sock.sendMessage(jid, { text: '⛔ لا يمكن تنفيذ الأمر على نفسك أو على المطور.' });
    return true;
  }
  if (cmd === '.طرد') {
    if (!await isBotAdmin(sock, jid)) {
      await sock.sendMessage(jid, { text: '❌ يجب أن يكون البوت مشرفًا حتى يطرد الأعضاء.' });
      return true;
    }
    try {
      await sock.groupParticipantsUpdate(jid, [target], 'remove');
      await sock.sendMessage(jid, { text: `🚪 تم طرد @${target.split('@')[0]} بنجاح.`, mentions: [target] });
    } catch {
      await sock.sendMessage(jid, { text: '❌ لم أستطع طرد العضو. تأكد من صلاحيات البوت.' });
    }
    return true;
  }
  const db = getDB(), shouldMute = cmd === '.كتم';
  if (shouldMute) db.muted[target] = { until: Date.now() + 30 * 60 * 1000, group: jid };
  else delete db.muted[target];
  saveDB(db);
  await sock.sendMessage(jid, {
    text: shouldMute
      ? '🔇 تم كتم @' + target.split('@')[0] + ' لمدة 30 دقيقة.'
      : '🔊 تم فك كتم @' + target.split('@')[0] + '.',
    mentions: [target]
  });
  return true;
}
