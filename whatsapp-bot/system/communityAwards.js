import { getDB, saveDB } from '../database/db.js';

const TIME_ZONE = process.env.TIMEZONE || 'Africa/Cairo';
const DAILY_HOUR = Number(process.env.AWARD_DAILY_HOUR ?? 23);
const DAILY_MINUTE = Number(process.env.AWARD_DAILY_MINUTE ?? 59);
const WEEKLY_DAY = Number(process.env.AWARD_WEEKLY_DAY ?? 5);
const WEEKLY_HOUR = Number(process.env.AWARD_WEEKLY_HOUR ?? 23);
const WEEKLY_MINUTE = Number(process.env.AWARD_WEEKLY_MINUTE ?? 59);
const TICK_MS = 30_000;

function localParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
}
function dateKey(p) { return `${p.year}-${p.month}-${p.day}`; }
function weekKey(p) {
  const date = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 1) % 7));
  return date.toISOString().slice(0, 10);
}
function weekdayNumber(day) {
  return ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 })[day] || 0;
}
function sortMembers(bucket) {
  return Object.entries(bucket?.members || {}).sort((a, b) => b[1] - a[1]);
}
function mentionLabel(jid) { return '@' + String(jid).split('@')[0].split(':')[0]; }

async function sendMemberList(sock, groupJid, heading, rows, extraLines = []) {
  const pageSize = 18;
  const pages = [];
  for (let i = 0; i < rows.length; i += pageSize) pages.push(rows.slice(i, i + pageSize));
  if (!pages.length) pages.push([]);
  for (let page = 0; page < pages.length; page++) {
    const current = pages[page];
    const lines = current.map(([jid, count], index) =>
      `${page * pageSize + index + 1}. ${mentionLabel(jid)} — ${count} رسالة`);
    const message = [
      heading, ...extraLines,
      current.length ? lines.join('\n') : 'لا توجد رسائل مسجلة خلال الفترة.',
      pages.length > 1 ? `صفحة ${page + 1} من ${pages.length}` : ''
    ].filter(Boolean).join('\n');
    await sock.sendMessage(groupJid, { text: message, mentions: current.map(([jid]) => jid) });
  }
}

async function participatingCommunityGroups(sock) {
  const all = await sock.groupFetchAllParticipating();
  const groups = Object.values(all || {});
  const communityIds = new Set(groups.filter(g => g.isCommunity).map(g => g.id));
  return groups.filter(g => g.id?.endsWith('@g.us') && g.linkedParent &&
    (communityIds.size === 0 || communityIds.has(g.linkedParent)));
}

async function sendDailyAwards(sock, groups, day, state) {
  let complete = true;
  for (const group of groups) {
    if (state.dailySent[group.id] === day) continue;
    const ranking = sortMembers(getDB().messageStats?.[group.id]?.daily?.[day]);
    if (!ranking.length) {
      state.dailySent[group.id] = day;
      saveDB(getDB());
      continue;
    }
    const [winner, count] = ranking[0];
    try {
      await sock.sendMessage(group.id, {
        text: [
          '🏅 نتيجة نشاط اليوم',
          `👥 المجموعة: ${group.subject || group.id}`,
          `🥇 الفائز: ${mentionLabel(winner)}`,
          `💬 عدد رسائله: ${count}`,
          '🎁 الجائزة المعلنة: 100 جنيه',
          '📌 يتولى المطور ترتيب تسليم الجائزة.'
        ].join('\n'),
        mentions: [winner]
      });
      state.dailySent[group.id] = day;
      saveDB(getDB());
    } catch (error) {
      complete = false;
      console.error(`تعذر إرسال نتيجة اليوم إلى ${group.id}:`, error?.message || error);
    }
  }
  return complete;
}

async function sendWeeklyCommunityReports(sock, groups, week, state) {
  let complete = true;
  const byCommunity = new Map();
  for (const group of groups) {
    if (!byCommunity.has(group.linkedParent)) byCommunity.set(group.linkedParent, []);
    byCommunity.get(group.linkedParent).push(group);
  }
  for (const [communityJid, communityGroups] of byCommunity) {
    const totals = communityGroups.map(group => ({
      group,
      bucket: getDB().messageStats?.[group.id]?.weekly?.[week] || { total: 0, members: {} }
    })).sort((a, b) => (b.bucket.total || 0) - (a.bucket.total || 0));
    const winner = totals.find(x => x.bucket.total > 0);
    const winnerName = winner?.group.subject || winner?.group.id || 'لا يوجد فائز';
    const ranking = [
      '📈 ترتيب مجموعات المجتمع:',
      ...totals.map((entry, index) =>
        `${index + 1}. ${entry.group.subject || entry.group.id} — ${entry.bucket.total || 0} رسالة`)
    ];
    for (const item of totals) {
      if (state.weeklySent[week]?.[item.group.id]) continue;
      const extra = [
        `🏘️ المجتمع: ${communityJid}`,
        ...ranking,
        `📊 إجمالي رسائل هذه المجموعة: ${item.bucket.total || 0}`,
        winner ? `🏆 المجموعة الفائزة: ${winnerName} — ${winner.bucket.total} رسالة`
          : 'لم يتم تسجيل نشاط كافٍ لتحديد مجموعة فائزة.',
        winner ? '💰 جائزة المجتمع: 10,000 جنيه للمجموعة الفائزة، والمطور يتولى توزيعها بين أعضائها.' : ''
      ].filter(Boolean);
      try {
        await sendMemberList(sock, item.group.id,
          `📅 التقرير الأسبوعي — ${item.group.subject || item.group.id}`,
          sortMembers(item.bucket), extra);
        state.weeklySent[week] ||= {};
        state.weeklySent[week][item.group.id] = true;
        saveDB(getDB());
      } catch (error) {
        complete = false;
        console.error(`تعذر إرسال التقرير إلى ${item.group.id}:`, error?.message || error);
      }
    }
  }
  return complete;
}

export function startCommunityAwards(sock) {
  let running = false;
  const tick = async () => {
    if (running) return;
    const now = localParts();
    const today = dateKey(now);
    const thisWeek = weekKey(now);
    const minuteOfDay = Number(now.hour) * 60 + Number(now.minute);
    const dailyTarget = DAILY_HOUR * 60 + DAILY_MINUTE;
    const weeklyTarget = WEEKLY_HOUR * 60 + WEEKLY_MINUTE;
    const db = getDB();
    db.communityAwards ||= {};
    db.communityAwards.dailySent ||= {};
    db.communityAwards.weeklySent ||= {};
    const state = db.communityAwards;
    const dailyDue = minuteOfDay >= dailyTarget && state.lastDailyRun !== today;
    const weeklyDue = weekdayNumber(now.weekday) === WEEKLY_DAY &&
      minuteOfDay >= weeklyTarget && state.lastWeeklyRun !== thisWeek;
    if (!dailyDue && !weeklyDue) return;

    running = true;
    try {
      const groups = await participatingCommunityGroups(sock);
      if (!groups.length) {
        console.warn('لم يتم العثور على مجموعات مرتبطة بمجتمع؛ ستتم إعادة المحاولة لاحقًا.');
        return;
      }
      if (dailyDue && await sendDailyAwards(sock, groups, today, state)) state.lastDailyRun = today;
      if (weeklyDue && await sendWeeklyCommunityReports(sock, groups, thisWeek, state)) state.lastWeeklyRun = thisWeek;
      saveDB(db);
    } catch (error) {
      console.error('تعذر إرسال تقارير وجوائز المجتمع:', error?.stack || error);
    } finally {
      running = false;
    }
  };
  tick().catch(error => console.error('Community awards scheduler:', error));
  const timer = setInterval(() => tick().catch(error =>
    console.error('Community awards scheduler:', error)), TICK_MS);
  timer.unref?.();
  console.log(`🏆 نظام جوائز المجتمع جاهز — يومي ${String(DAILY_HOUR).padStart(2, '0')}:${String(DAILY_MINUTE).padStart(2, '0')}، أسبوعي ${WEEKLY_DAY} ${String(WEEKLY_HOUR).padStart(2, '0')}:${String(WEEKLY_MINUTE).padStart(2, '0')} (${TIME_ZONE})`);
  return () => clearInterval(timer);
}
