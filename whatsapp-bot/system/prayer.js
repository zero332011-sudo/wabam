import { getDB } from '../database/db.js';
import { config } from '../config/settings.js';

const sent = new Set();
function formatClock(value) {
  const [h, m] = String(value).split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'مساءً' : 'صباحًا'}`;
}
const names = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };
const timingsUrl = new URL('https://api.aladhan.com/v1/timingsByCity');
timingsUrl.search = new URLSearchParams({
  city: config.prayerCity,
  country: config.prayerCountry,
  method: '5'
}).toString();

let interval = null;
let timingsCache = null;
let timingsFetchedAt = 0;
let checking = false;

async function getTimings() {
  const twelveHours = 12 * 60 * 60 * 1000;
  if (timingsCache && Date.now() - timingsFetchedAt < twelveHours) return timingsCache;
  const response = await fetch(timingsUrl, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Prayer API returned HTTP ' + response.status);
  const data = await response.json();
  if (!data?.data?.timings || !data?.data?.date?.gregorian?.date) {
    throw new Error('Invalid prayer timings response');
  }
  timingsCache = { timings: data.data.timings, date: data.data.date.gregorian.date };
  timingsFetchedAt = Date.now();
  return timingsCache;
}

export async function getPrayerSchedule() { return getTimings(); }

export async function checkPrayer(sock) {
  if (checking) return;
  checking = true;
  try {
    const { timings, date } = await getTimings();
    const now = new Intl.DateTimeFormat('en-GB', {
      timeZone: config.timezone, hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date());
    const prayer = Object.entries(names).find(([key]) => String(timings[key]).slice(0, 5) === now);
    const sentKey = date + (prayer?.[0] || '');
    if (!prayer || sent.has(sentKey)) return;
    const db = getDB();
    for (const [jid] of Object.entries(db.groups)) {
      try {
        const meta = await sock.groupMetadata(jid);
        const mentions = meta.participants.map(x => x.id);
        await sock.sendMessage(jid, {
          text: '🕌 حان الآن موعد صلاة ' + prayer[1] + ' بتوقيت ' + config.prayerCityLabel + '، الساعة ' + formatClock(now) + '. تقبل الله منكم.\n' +
            mentions.map(x => '@' + x.split('@')[0]).join(' '),
          mentions
        });
      } catch (error) {
        console.error('Prayer group:', jid, error?.message || error);
      }
    }
    sent.add(sentKey);
    if (sent.size > 40) sent.clear();
  } catch (error) {
    console.error('Prayer check:', error);
  } finally {
    checking = false;
  }
}

export function startPrayerSystem(sock) {
  if (interval) clearInterval(interval);
  timingsCache = null;
  timingsFetchedAt = 0;
  checkPrayer(sock);
  interval = setInterval(() => checkPrayer(sock), 60000);
  return interval;
}
