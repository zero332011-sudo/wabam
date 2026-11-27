import { getDB, saveDB, getUser } from '../database/db.js';
import { getMentioned } from '../utils/helpers.js';
import { isDeveloper } from '../utils/permissions.js';

export async function economyCommand(sock, m, text) {
  const jid = m.key.remoteJid, sender = m.key.participant || jid;
  const parts = text.trim().split(/\s+/), cmd = parts[0];
  const user = getUser(sender);
  const infinite = isDeveloper(sender);
  if (cmd === '.محفظه' || cmd === '.محفظة') {
    await sock.sendMessage(jid, { text: `💵 محفظتك الحالية: ${infinite ? '∞' : user.wallet} ج\n🏦 رصيد البنك: ${infinite ? '∞' : user.bank} ج` });
    return true;
  }
  if (cmd === '.تحويل' || text.trim().startsWith('.تحويل مبلغ-')) {
    const target = getMentioned(m)[0];
    const amountToken = parts.find(x => /^\d+$/.test(x));
    const amount = Number(amountToken || text.match(/-(\d+)$/)?.[1]);
    if (!target || !Number.isSafeInteger(amount) || amount <= 0) {
      await sock.sendMessage(jid, { text: '💸 الاستخدام: .تحويل مبلغ-@شخص (اكتب المبلغ مع المنشن).' });
      return true;
    }
    if (target === sender) {
      await sock.sendMessage(jid, { text: '⛔ لا يمكنك تحويل الأموال لنفسك.' });
      return true;
    }
    const db = getDB();
    db.users[sender] ||= user;
    db.users[target] ||= { jid: target, nickname: 'عضو جديد', rank: 1, bank: 40, wallet: 0, hearts: 3, warnings: 0 };
    if (!infinite && db.users[sender].wallet < amount) {
      await sock.sendMessage(jid, { text: `❌ رصيد محفظتك غير كافٍ.\n💵 رصيدك: ${db.users[sender].wallet} ج\n💸 المطلوب: ${amount} ج` });
      return true;
    }
    if (!infinite) db.users[sender].wallet -= amount;
    db.users[target].wallet += amount;
    db.transfers.push({ from: sender, to: target, amount, at: Date.now() });
    saveDB(db);
    await sock.sendMessage(jid, {
      text: `✅ تمت عملية التحويل بنجاح!\n👤 المستلم: @${target.split('@')[0]}\n💸 المبلغ: ${amount} ج\n💵 محفظتك المتبقية: ${infinite ? '∞' : db.users[sender].wallet} ج`,
      mentions: [target]
    });
    return true;
  }
  return false;
}
