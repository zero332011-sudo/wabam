import { getDB, getUser, saveDB } from '../database/db.js';
import { getTargetJid } from '../utils/helpers.js';
import { ranks, config } from '../config/settings.js';
import { isDeveloper, isBotManager, isOwner } from '../utils/permissions.js';
import { showMedia } from '../system/media.js';

function cairoDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const p = Object.fromEntries(parts.filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export async function generalCommand(sock, m, text) {
  const jid = m.key.remoteJid;
  const sender = m.key.participant || jid;
  const cmd = text.trim().split(/\s+/)[0];

  if (['.الاوامر', '.اوامر'].includes(text.trim())) {
    const db = getDB();
    const botName = db.botName || config.name;
    const menu = `🍥 ${botName}

🎮 الألعاب
.خمن | .اكس @خصم | تم | .مشارك @عضو | .لعب رقم | .انسحب | .انهاء

🛡️ إدارة المجموعة
.كتم @عضو | .فك كتم @عضو | .طرد @عضو
.كتم الجروب | .فك الجروب

👤 الأعضاء
.معلومات | .لقب اسم | .احصائيات

💰 الاقتصاد
.بنك | .محفظه | .تحويل @عضو مبلغ

🍥 مكتبة الأنمي
.انمي | .حلقات اسم الأنمي|القسم
.حلقه اسم الأنمي|القسم|رقم

📎 الوسائط
.عرض (بالرد على صورة أو فيديو أو ملف)

💍 الترفيه
.زواج | .طلاق

🕒 عام
.وقت | .التاريخ | .حاله
`;
    await sock.sendMessage(jid, { text: menu });
    return true;
  }

  if (text.trim().replace(/\s+/g, ' ') === '.اوامر المطور') {
    if (!isBotManager(sender)) {
      await sock.sendMessage(jid, { text: '⛔ قائمة أوامر المطور للإمبراطور والرتب من 1 إلى 5 والمطورين.' });
      return true;
    }
    const lines = [
      '👑 قائمة أوامر الإدارة',
      '.اضافه مطور @عضو',
      '.اضافه كلمه كلمة | .حذف كلمه كلمة',
      '.اضافه ايموجي 😀 | .حذف ايموجي 😀',
      '.اضافه ملصق | .حذف ملصق (بالرد على الملصق)',
      '.كتم @عضو | .فك كتم @عضو | .طرد @عضو',
      '.كتم الجروب | .فك الجروب',
      '.احصائيات'
    ];
    if (isDeveloper(sender)) lines.push('.تفعيل الصلاة | .ايقاف الصلاة');
    if (isOwner(sender)) lines.push('.اسم الاسم الجديد');
    await sock.sendMessage(jid, { text: lines.join('\n') });
    return true;
  }

  if (cmd === '.وقت' || cmd === '.التاريخ') {
    const now = new Date().toLocaleString('ar-EG', { timeZone: config.timezone });
    await sock.sendMessage(jid, { text: '🕒 ' + now });
    return true;
  }
  if (cmd === '.حاله') {
    await sock.sendMessage(jid, { text: '🟢 البوت يعمل\n⏱️ مدة التشغيل: ' + Math.floor(process.uptime()) + ' ثانية' });
    return true;
  }
  if (cmd === '.عرض') return showMedia(sock, m);

  if (cmd === '.احصائيات') {
    if (!jid.endsWith('@g.us')) {
      await sock.sendMessage(jid, { text: '📊 الإحصائيات متاحة داخل المجموعات فقط.' });
      return true;
    }
    const db = getDB();
    const stats = db.messageStats?.[jid] || { total: 0, members: {}, daily: {} };
    const today = stats.daily?.[cairoDateKey()] || { total: 0, members: {} };
    const top = Object.entries(today.members || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const lines = top.length
      ? top.map(([id, count], index) => `${index + 1}. @${id.split('@')[0]} — ${count} رسالة`).join('\n')
      : 'لا توجد بيانات نشاط اليوم بعد.';
    const date = new Date().toLocaleDateString('ar-EG', { timeZone: config.timezone });
    await sock.sendMessage(jid, {
      text: `📊 إحصائيات النشاط\n📅 التاريخ: ${date}\n💬 إجمالي رسائل المجموعة: ${stats.total || 0}\n📨 رسائل اليوم: ${today.total || 0}\n🏆 أكثر 3 أعضاء نشاطًا اليوم:\n${lines}`,
      mentions: top.map(([id]) => id)
    });
    return true;
  }

  if (cmd === '.معلومات') {
    const target = getTargetJid(m) || sender;
    const user = getUser(target);
    const caption = `👤 ${user.nickname}
📱 ${target.split('@')[0]}
🆔 ${target}
👑 ${ranks[user.rank] || 'غير محددة'}
🏦 البنك: ${user.bank} جنيه
👛 المحفظة: ${user.wallet} جنيه
❤️ القلوب: ${user.hearts ?? 3}
⚠️ الإنذارات: ${user.warnings || 0}`;
    try {
      const url = await sock.profilePictureUrl(target, 'image');
      await sock.sendMessage(jid, { image: { url }, caption, mentions: [target] });
    } catch {
      await sock.sendMessage(jid, { text: caption, mentions: [target] });
    }
    return true;
  }

  if ((cmd === '.تفعيل' || cmd === '.ايقاف') && text.includes('الصلاة')) {
    if (!isDeveloper(sender)) {
      await sock.sendMessage(jid, { text: '⛔ للمطورين فقط.' });
      return true;
    }
    if (!jid.endsWith('@g.us')) {
      await sock.sendMessage(jid, { text: 'الأمر داخل المجموعة فقط.' });
      return true;
    }
    const db = getDB();
    db.groups[jid] ||= {};
    db.groups[jid].prayerEnabled = cmd === '.تفعيل';
    saveDB(db);
    await sock.sendMessage(jid, { text: cmd === '.تفعيل' ? '🕌 تم تفعيل تنبيهات الصلاة للمجموعة.' : 'تم إيقاف تنبيهات الصلاة.' });
    return true;
  }
  return false;
}
