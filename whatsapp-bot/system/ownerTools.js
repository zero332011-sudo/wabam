import { getDB, saveDB } from '../database/db.js';
import { isOwner, isBotManager, isDeveloper } from '../utils/permissions.js';

export async function ownerTools(sock, m, text) {
  const jid = m.key.remoteJid, sender = m.key.participant || jid;
  const trimmed = text.trim();
  const rename = trimmed.startsWith('.اسم');
  if (rename) {
    if (!isDeveloper(sender)) {
      await sock.sendMessage(jid, { text: '⛔ تغيير اسم البوت للمطور الأساسي فقط.' });
      return true;
    }
    const name = trimmed.slice('.اسم'.length).trim();
    if (!name) {
      await sock.sendMessage(jid, { text: '✏️ اكتب الاسم الجديد: .اسم اسم البوت' });
      return true;
    }
    const db = getDB(); db.botName = name.slice(0, 40); saveDB(db);
    await sock.sendMessage(jid, { text: '✅ تم تغيير اسم البوت إلى: ' + db.botName });
    return true;
  }
  const commands = ['.اضافه ايموجي', '.اضافه ملصق', '.حذف ايموجي', '.حذف ملصق', '.اضافه كلمه', '.حذف كلمه'];
  const cmd = commands.find(x => trimmed.startsWith(x));
  if (!cmd) return false;
  if (!isBotManager(sender)) {
    await sock.sendMessage(jid, { text: '⛔ الصلاحية للرتب من 17 إلى 20 والمطورين فقط.' });
    return true;
  }
  const db = getDB(), ctx = m.message?.extendedTextMessage?.contextInfo, val = trimmed.slice(cmd.length).trim();
  if (cmd.includes('ملصق')) {
    const sticker = ctx?.quotedMessage?.stickerMessage;
    if (!sticker?.fileSha256) {
      await sock.sendMessage(jid, { text: '🏷️ رد على الملصق نفسه بالأمر حتى أحفظ بصمته.' });
      return true;
    }
    const hash = Buffer.from(sticker.fileSha256).toString('base64');
    db.blockedStickers ||= [];
    if (cmd.startsWith('.اضافه')) {
      if (!db.blockedStickers.includes(hash)) db.blockedStickers.push(hash);
    } else db.blockedStickers = db.blockedStickers.filter(x => x !== hash);
  } else if (cmd.includes('كلمه')) {
    if (!val) {
      await sock.sendMessage(jid, { text: '🚫 اكتب الكلمة بعد الأمر.' });
      return true;
    }
    db.blockedWords ||= [];
    const word = val.toLowerCase();
    if (cmd.startsWith('.اضافه')) {
      if (!db.blockedWords.includes(word)) db.blockedWords.push(word);
    } else db.blockedWords = db.blockedWords.filter(x => x !== word);
  } else {
    if (!val) {
      await sock.sendMessage(jid, { text: '😀 اكتب الإيموجي بعد الأمر.' });
      return true;
    }
    db.blockedEmojis ||= [];
    if (cmd.startsWith('.اضافه')) {
      if (!db.blockedEmojis.includes(val)) db.blockedEmojis.push(val);
    } else db.blockedEmojis = db.blockedEmojis.filter(x => x !== val);
  }
  saveDB(db);
  await sock.sendMessage(jid, { text: '✅ تم تحديث قائمة المحظورات.' });
  return true;
}
