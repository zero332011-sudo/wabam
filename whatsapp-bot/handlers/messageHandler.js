import { getText } from '../utils/helpers.js';
import { commandHandler } from './commandHandler.js';
import { filterMessage } from '../system/filter.js';
import { guessMessage } from '../games/guess.js';
import { xoMessage } from '../games/xo.js';
import { getDB, saveDB } from '../database/db.js';
import { rememberOwnerIdentity } from '../utils/permissions.js';
import { animeMessage } from '../commands/anime.js';

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
  for (const m of update.messages || []) {
    if (!m.message || m.key.fromMe || m.key.remoteJid === 'status@broadcast') continue;
    const jid = m.key.remoteJid;
    const text = getText(m);
    rememberOwnerIdentity(m);

    try {
      const db = getDB();
      if (jid.endsWith('@g.us')) {
        const sender = m.key.participant || jid;
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
