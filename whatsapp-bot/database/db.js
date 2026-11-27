import fs from 'node:fs';
import path from 'node:path';

const dataRoot = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || '.';
const dir = path.join(dataRoot, 'database');
const file = path.join(dir, 'data.json');
const defaults = () => ({
  users: {}, groups: {}, developers: [], ownerJids: [], botName: '', messageStats: {},
  communityAwards: { lastDailyRun: '', lastWeeklyRun: '' }, muted: {}, blockedWords: [],
  blockedEmojis: [], blockedStickers: [], anime: {}, games: {}, marriages: {}, transfers: []
});

fs.mkdirSync(dir, { recursive: true });
if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(defaults(), null, 2));

let cache = null;

function normalize(data = {}) {
  const base = defaults();
  return {
    ...base, ...data,
    users: data.users || {}, groups: data.groups || {},
    developers: data.developers || [], ownerJids: data.ownerJids || [],
    botName: data.botName || '', messageStats: data.messageStats || {},
    communityAwards: { ...base.communityAwards, ...(data.communityAwards || {}) },
    muted: data.muted || {}, anime: data.anime || {}, games: data.games || {},
    blockedWords: data.blockedWords || [], blockedEmojis: data.blockedEmojis || [],
    blockedStickers: data.blockedStickers || [], marriages: data.marriages || {},
    transfers: data.transfers || []
  };
}

export function getDB() {
  if (cache) return cache;
  try {
    cache = normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
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
    const owner = !!normalizedOwner && numberOf(jid) === normalizedOwner;
    const developer = owner || db.developers.some(x => numberOf(x) === numberOf(jid));
    db.users[jid] = {
      jid, nickname: 'عضو جديد', rank: 17,
      bank: developer ? 100 : 40, wallet: 0, hearts: 3, warnings: 0
    };
    saveDB(db);
  }
  return db.users[jid];
}
