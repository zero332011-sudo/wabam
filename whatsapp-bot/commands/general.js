import { getDB, getUser, saveDB } from '../database/db.js';
import { getTargetJid } from '../utils/helpers.js';
import { ranks, config } from '../config/settings.js';
import { isDeveloper, hasRankPermission, isOwner } from '../utils/permissions.js';
import { showMedia } from '../system/media.js';

function cairoDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const p = Object.fromEntries(parts.filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

const mainMenu = name => [
  `🌌 ${name}`,
  '📋 القائمة الرئيسية — أوامر الأعضاء',
  '',
  '👤 .معلومات — عرض بطاقة العضو',
  '🏷️ .لقب — تغيير لقب العضو',
  '💍 .زواج — اختيار عضوين للزواج الترفيهي',
  '💔 .طلاق — اختيار عضوين للطلاق الترفيهي',
  '📊 .احصائيات — عرض إحصائيات المجموعة',
  '🕒 .وقت — عرض الوقت',
  '🌅 .مواقيت الصلاة — عرض مواقيت الصلاة',
  '🍥 .انمي — فتح مكتبة الأنمي',
  '🏅 .ترقيه — ترقية عضو باستخدام رقم الرتبة',
  '',
  '🎮 .الألعاب — قائمة الألعاب',
  '🏦 .بنك — قائمة البنك والمحفظة'
].join('\n');

const gamesMenu = [
  '🎮 قائمة الألعاب',
  '',
  '🎯 .خمن — تخمين شخصية أنمي خلال 30 ثانية',
  '❎ .xo — لعبة إكس أو بين عضوين',
  '',
  '🏆 جائزة الفوز في كل لعبة: 20 ج',
  '✋ المشاركة بإرسال «تم» أو بالمنشن/الرد',
  '❤️ القلوب خاصة بلعبة التخمين فقط'
].join('\n');

export async function generalCommand(sock, m, text) {
  const jid = m.key.remoteJid;
  const sender = m.key.participant || jid;
  const trimmed = text.trim();
  const cmd = trimmed.split(/\s+/)[0];
  const db = getDB();
  const botName = db.botName || config.name;

  if (['.رئيسية', '.اكتب الأوامر', '.اكتب_الأوامر', '.الاوامر', '.اوامر'].includes(trimmed)) {
    await sock.sendMessage(jid, { text: mainMenu(botName) });
    return true;
  }
  if (trimmed === '.الألعاب' || trimmed === '.الالعاب') {
    await sock.sendMessage(jid, { text: gamesMenu });
    return true;
  }
  if (trimmed === '.بنك') {
    const user = getUser(sender);
    await sock.sendMessage(jid, {
      text: [
        '🏦 قائمة البنك والمحفظة',
        '',
        '🏦 .بنك — عرض البنك وقائمة الخدمات',
        '💵 .محفظه — عرض رصيد المحفظة',
        '💸 .تحويل مبلغ-@شخص — تحويل الأموال',
        '',
        '💰 رصيدك الحالي',
        `🏦 البنك: ${user.bank} ج`,
        `💵 المحفظة: ${user.wallet} ج`,
        `💎 الإجمالي: ${Number(user.bank || 0) + Number(user.wallet || 0)} ج`
      ].join('\n')
    });
    return true;
  }

  if (text.replace(/\s+/g, ' ') === '.اوامر المطور') {
    if (!hasRankPermission(sender)) {
      await sock.sendMessage(jid, { text: '⛔ هذه القائمة للرتب من 17 إلى 20 والمطورين فقط.' });
      return true;
    }
    const lines = [
      '👑 قائمة أوامر الإدارة',
      '👨‍💻 .اضافه مطور @عضو',
      '🚫 .اضافه كلمه كلمة | .حذف كلمه كلمة',
      '😀 .اضافه ايموجي 😀 | .حذف ايموجي 😀',
      '🏷️ .اضافه ملصق | .حذف ملصق (بالرد على الملصق)',
      '🔇 .كتم-@عضو | 🔊 .فك كتم-@عضو | 🚪 .طرد-@عضو',
      '🔒 .كتمل الجروب | 🔓 .فك الجروب'
    ];
    if (isDeveloper(sender)) lines.push('🖼️ .عرض', '✏️ .اسم الاسم الجديد');
    await sock.sendMessage(jid, { text: lines.join('\n') });
    return true;
  }

  if (cmd === '.وقت' || cmd === '.التاريخ') {
    const now = new Date().toLocaleString('ar-EG', { timeZone: config.timezone });
    await sock.sendMessage(jid, { text: '🕒 الوقت الحالي: ' + now });
    return true;
  }
  if (cmd === '.حاله') {
    await sock.sendMessage(jid, { text: '🟢 البوت يعمل\n⏱️ مدة التشغيل: ' + Math.floor(process.uptime()) + ' ثانية' });
    return true;
  }
  if (cmd === '.عرض') return showMedia(sock, m);

  if (cmd === '.احصائيات') {
    if (!hasRankPermission(sender)) {
      await sock.sendMessage(jid, { text: '⛔ صلاحية الإحصائيات للرتب من 17 إلى 20 والمطورين فقط.' });
      return true;
    }
    if (!jid.endsWith('@g.us')) {
      await sock.sendMessage(jid, { text: '📊 الإحصائيات متاحة داخل المجموعات فقط.' });
      return true;
    }
    const stats = db.messageStats?.[jid] || { total: 0, members: {}, daily: {} };
    const today = stats.daily?.[cairoDateKey()] || { total: 0, members: {} };
    const top = Object.entries(today.members || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const lines = top.length
      ? top.map(([id, count], index) => `${['🥇','🥈','🥉'][index]} @${id.split('@')[0]} — ${count} رسالة`).join('\n')
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
    const rank = ranks[Number(user.rank)] || 'غير محددة';
    const caption = `👤 بطاقة العضو\n🏷️ اللقب: ${user.nickname}\n📱 الرقم: ${target.split('@')[0]}\n👑 الرتبة: ${rank} (${user.rank}/20)\n🏦 البنك: ${user.bank} ج\n💵 المحفظة: ${user.wallet} ج\n⚠️ الإنذارات: ${user.warnings || 0}`;
    try {
      const url = await sock.profilePictureUrl(target, 'image');
      await sock.sendMessage(jid, { image: { url }, caption, mentions: [target] });
    } catch {
      await sock.sendMessage(jid, { text: caption, mentions: [target] });
    }
    return true;
  }

  if ((cmd === '.تفعيل' || cmd === '.ايقاف') && trimmed.includes('الصلاة')) {
    if (!isDeveloper(sender)) {
      await sock.sendMessage(jid, { text: '⛔ للمطورين فقط.' });
      return true;
    }
    if (!jid.endsWith('@g.us')) {
      await sock.sendMessage(jid, { text: '🕌 الأمر داخل المجموعة فقط.' });
      return true;
    }
    const group = getDB();
    group.groups[jid] ||= {};
    group.groups[jid].prayerEnabled = cmd === '.تفعيل';
    saveDB(group);
    await sock.sendMessage(jid, { text: cmd === '.تفعيل' ? '🕌 تم تفعيل تنبيهات الصلاة للمجموعة.' : '🔕 تم إيقاف تنبيهات الصلاة.' });
    return true;
  }
  return false;
}
