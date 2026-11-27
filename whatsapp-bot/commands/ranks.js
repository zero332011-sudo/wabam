import { getDB, saveDB, getUser } from '../database/db.js';
import { isDeveloper, hasRankPermission } from '../utils/permissions.js';
import { getTargetJid } from '../utils/helpers.js';
import { ranks } from '../config/settings.js';

export async function rankCommand(sock, m, text) {
  const jid = m.key.remoteJid, sender = m.key.participant || jid;
  const trimmed = text.trim();
  const cmd = trimmed.split(/\s+/)[0];

  if (cmd === '.لقب') {
    const name = trimmed.slice('.لقب'.length).trim();
    if (!name) {
      await sock.sendMessage(jid, { text: '🏷️ اكتب اللقب الجديد: .لقب اللقب (التكلفة 50 ج من المحفظة).' });
      return true;
    }
    const db = getDB();
    const user = getUser(sender);
    if (!isDeveloper(sender) && user.wallet < 50) {
      await sock.sendMessage(jid, { text: '❌ تحتاج إلى 50 ج في المحفظة لتغيير لقبك.' });
      return true;
    }
    if (!isDeveloper(sender)) user.wallet -= 50;
    user.nickname = name.slice(0, 30);
    db.users[sender] = user;
    saveDB(db);
    await sock.sendMessage(jid, { text: `🏷️ تم تغيير لقبك بنجاح إلى: ${user.nickname}\n💰 تكلفة العملية: ${isDeveloper(sender) ? 0 : 50} ج` });
    return true;
  }

  if (cmd === '.ترقيه' || trimmed.startsWith('.ترقيه-')) {
    if (!hasRankPermission(sender)) {
      await sock.sendMessage(jid, { text: '⛔ صلاحية الترقية للرتب من 17 إلى 20 والمطورين فقط.' });
      return true;
    }
    let target = getTargetJid(m);
    let number = NaN;
    const hyphen = trimmed.match(/^\.ترقيه-(?:@[^-]+-)?(\d{1,2})$/);
    if (hyphen) number = Number(hyphen[1]);
    else {
      const tokens = trimmed.split(/\s+/).slice(1);
      const last = tokens[tokens.length - 1];
      if (/^\d{1,2}$/.test(last || '')) number = Number(last);
      if (!target && tokens.length > 1) target = getTargetJid(m);
    }
    if (!target && !Number.isInteger(number)) target = sender;
    if (!target) {
      await sock.sendMessage(jid, { text: '🏅 اعمل منشن أو رد على العضو، ثم اكتب: .ترقيه-20' });
      return true;
    }
    if (!Number.isInteger(number) || number < 0 || number > 20) {
      await sock.sendMessage(jid, { text: '❌ رقم الرتبة يجب أن يكون من 0 إلى 20. مثال: .ترقيه-@شخص-20' });
      return true;
    }
    if (isDeveloper(target)) {
      const db = getDB();
      const user = getUser(target);
      user.rank = 20;
      db.users[target] = user;
      saveDB(db);
      await sock.sendMessage(jid, { text: '👑 المطور رتبته ثابتة: الإمبراطور (20/20).', mentions: [target] });
      return true;
    }
    const db = getDB();
    const user = getUser(target);
    user.rank = number;
    db.users[target] = user;
    saveDB(db);
    await sock.sendMessage(jid, {
      text: number === 0
        ? `🔰 تمت إزالة رتبة @${target.split('@')[0]} وإعادته إلى رتبة البداية.`
        : `🎉 تمت ترقية @${target.split('@')[0]}!\n👑 الرتبة: ${ranks[number]}\n🔢 رقم الرتبة: ${number}/20`,
      mentions: [target]
    });
    return true;
  }
  return false;
}
