import { getText } from '../utils/helpers.js';
import { commandHandler } from './commandHandler.js';
import { filterMessage } from '../system/filter.js';
import { guessMessage } from '../games/guess.js';
import { xoMessage } from '../games/xo.js';
import { getDB, getUser, saveDB } from '../database/db.js';
import { rememberOwnerIdentity } from '../utils/permissions.js';
import { animeMessage } from '../commands/anime.js';
import { cacheIncomingMedia } from '../system/media.js';

function activityPeriods(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: process.env.TIMEZONE || 'Africa/Cairo',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  const day = `${values.year}-${values.month}-${values.day}`;
  const utc = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  utc.setUTCDate(utc.getUTCDate() - ((utc.getUTCDay() + 1) % 7));
  return { day, week: utc.toISOString().slice(0, 10) };
}

export async function messageHandler(sock, update) {
  // Secondary numbers are relay-only: they do not run WABAM commands or group systems.
  if (process.env.BOT_ROLE === 'relay') {
    const primary = String(process.env.PRIMARY_BOT_NUMBER || '').replace(/\D/g, '');
    for (const m of update.messages || []) {
      if (!m.message || m.key.fromMe || m.key.remoteJid === 'status@broadcast') continue;
      const jid = m.key.remoteJid;
      const text = getText(m).trim();
      if (!text || !/^\.(?:اوامر|الأوامر|رئيسيه|رئيسية|مساعدة|معلومات)$/u.test(text)) continue;
      if (!primary) {
        await sock.sendMessage(jid, { text: '⚠️ لم يتم تحديد رقم البوت الأساسي بعد. تواصل مع الإدارة.' });
        continue;
      }
      await sock.sendMessage(jid, {
        text: '🔁 هذا رقم توجيهي تابع لـ WABAM.\n\n🤖 رقم البوت الأساسي:\n+' + primary +
          '\n\nاضغط الرابط لفتح محادثة البوت الأساسي:\nhttps://wa.me/' + primary
      });
    }
    return;
  }
  for (const m of update.messages || []) {
    if (!m.message || m.key.fromMe || m.key.remoteJid === 'status@broadcast') continue;
    const jid = m.key.remoteJid;
    const text = getText(m);
    rememberOwnerIdentity(m);

    try {
      // Save media immediately, before its temporary WhatsApp media key expires.
      await cacheIncomingMedia(sock, m);

      // Send the private welcome message once per direct chat.
      if (!jid.endsWith('@g.us') && !jid.endsWith('@broadcast') &&
          (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid'))) {
        const privateDb = getDB();
        const privateSender = m.key.participant || jid;
        privateDb.welcomedPrivate ||= [];
        if (!privateDb.welcomedPrivate.includes(privateSender)) {
          privateDb.welcomedPrivate.push(privateSender);
          saveDB(privateDb);
          await sock.sendMessage(jid, {
            text: `🌌 أهلاً بك في WABAM!

مرحبًا بك 👋
للاستفسارات أو التواصل مع إدارة البوت:
📞 ${process.env.CONTACT_NUMBER || '01032219184'}

نتمنى لك تجربة ممتعة مع WABAM 🍥`
          });
        }
      }
      const db = getDB();
      if (jid.endsWith('@g.us')) {
        const sender = m.key.participant || jid;
        // XP grows slowly: one point for every ten group messages, silently.
        const xpUser = getUser(sender);
        xpUser.xpMessageCount = Number(xpUser.xpMessageCount || 0) + 1;
        xpUser.xp = Math.floor(xpUser.xpMessageCount / 10);
        db.users[sender] = xpUser;
        const stats = db.messageStats[jid] ||= { total: 0, members: {}, daily: {}, weekly: {} };
        stats.daily ||= {};
        stats.weekly ||= {};
        stats.total++;
        stats.members[sender] = (stats.members[sender] || 0) + 1;

        const periods = activityPeriods();
        const daily = stats.daily[periods.day] ||= { total: 0, members: {} };
        daily.total++;
        daily.members[sender] = (daily.members[sender] || 0) + 1;
        const weekly = stats.weekly[periods.week] ||= { total: 0, members: {} };
        weekly.total++;
        weekly.members[sender] = (weekly.members[sender] || 0) + 1;

        // Keep only the recent reporting windows to prevent the database growing forever.
        for (const key of Object.keys(stats.daily)) {
          if (key < periods.day) delete stats.daily[key];
        }
        const oldWeeks = Object.keys(stats.weekly).sort();
        while (oldWeeks.length > 3) delete stats.weekly[oldWeeks.shift()];

        if (!db.groups[jid]) db.groups[jid] = { prayerEnabled: true };
        saveDB(db);
      }

      if (await filterMessage(sock, m, text)) continue;
      if (text && await animeMessage(sock, m, text)) continue;
      if (text && await xoMessage(sock, m, text)) continue;
      if (text && await guessMessage(sock, m, text)) continue;
      if (text) await commandHandler(sock, m, text);
    } catch (error) {
      console.error('Message handler:', error);
    }
  }
}
