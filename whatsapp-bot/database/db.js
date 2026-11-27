import fs from 'node:fs';
import path from 'node:path';

const dataRoot = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || '.';
const dir = path.join(dataRoot, 'database');
const file = path.join(dir, 'data.json');
const defaults = () => ({
  schemaVersion: 2,
  users: {}, groups: {}, developers: [], ownerJids: [], botName: '', messageStats: {}, welcomedPrivate: [],
  communityAwards: { lastDailyRun: '', lastWeeklyRun: '', dailySent: {}, weeklySent: {} },
  muted: {}, blockedWords: [], blockedEmojis: [], blockedStickers: [], anime: {},
  games: {}, marriages: {}, transfers: [], mediaCache: {}
});

fs.mkdirSync(dir, { recursive: true });
if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(defaults(), null, 2));
let cache = null;

function normalize(data = {}) {
  const base = defaults();
  const users = data.users || {};
  // ترحيل الرتب القديمة مرة واحدة: في النسخة السابقة كان 0 أعلى رتبة و17 أقلها.
  if (Number(data.schemaVersion || 1) < 2) {
    for (const user of Object.values(users)) {
      const oldRank = Number(user?.rank);
      if (Number.isInteger(oldRank) && oldRank >= 0 && oldRank <= 17) user.rank = oldRank === 17 ? 1 : oldRank === 16 ? 2 : 20 - oldRank;
      else user.rank = 1;
    }
  }
  return {
    ...base, ...data, schemaVersion: 2,
    users, groups: data.groups || {},
    developers: data.developers || [], ownerJids: data.ownerJids || [],
    botName: data.botName || '', messageStats: data.messageStats || {}, welcomedPrivate: data.welcomedPrivate || [],
    communityAwards: { ...base.communityAwards, ...(data.communityAwards || {}) },
    muted: data.muted || {}, anime: data.anime || {}, games: data.games || {},
    blockedWords: data.blockedWords || [], blockedEmojis: data.blockedEmojis || [],
    blockedStickers: data.blockedStickers || [], marriages: data.marriages || {},
    transfers: data.transfers || [], mediaCache: data.mediaCache || {}
  };
}

export function getDB() {
  if (cache) return cache;
  try {
    cache = normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
    if (cache.schemaVersion === 2) {
      fs.writeFileSync(file, JSON.stringify(cache, null, 2));
    }
  } catch (error) {
    console.error('تعذر قراءة قاعدة البيانات، سيتم استخدام بيانات افتراضية:', error);
    cache = defaults();
  }
  return cache;
}

export function saveDB(data) {
  cache = normalize(data);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, file);
}

function numberOf(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

export function getUser(jid) {
  const db = getDB();
  if (!db.users[jid]) {
    const ownerNumber = String(process.env.OWNER_NUMBER || '').replace(/\D/g, '');
    let normalizedOwner = ownerNumber;
    if (normalizedOwner.startsWith('0020')) normalizedOwner = normalizedOwner.slice(2);
    else if (normalizedOwner.startsWith('0')) normalizedOwner = '20' + normalizedOwner.slice(1);
    else if (normalizedOwner && !normalizedOwner.startsWith('20')) normalizedOwner = '20' + normalizedOwner;
    const owner = (!!normalizedOwner && numberOf(jid) === normalizedOwner) || (db.ownerJids || []).includes(jid);
    const developer = owner || db.developers.some(x => numberOf(x) === numberOf(jid));
    db.users[jid] = {
      jid, nickname: 'عضو جديد', rank: owner ? 20 : developer ? 17 : 1,
      bank: developer ? 100 : 40, wallet: 0, hearts: 3, warnings: 0
    };
    saveDB(db);
  }
  return db.users[jid];
}
