import { config } from '../config/settings.js';
import { getDB, saveDB, getUser } from '../database/db.js';
import { jidNumber } from './helpers.js';

export function rememberOwnerIdentity(message) {
  const key = message?.key || {};
  const candidates = [key.participant, key.participantAlt, key.participantPn, key.remoteJidAlt]
    .filter(x => typeof x === 'string' && x.includes('@'));
  const ownerNumber = config.owner;
  if (!candidates.some(x => jidNumber(x) === ownerNumber)) return;
  const db = getDB();
  db.ownerJids ||= [];
  for (const id of candidates) if (!db.ownerJids.includes(id)) db.ownerJids.push(id);
  saveDB(db);
}
export function isOwner(jid) {
  const db = getDB();
  return (!!config.owner && jidNumber(jid) === config.owner) || (db.ownerJids || []).includes(jid);
}
export function isDeveloper(jid) {
  const db = getDB();
  return isOwner(jid) || (!!config.developerId && jidNumber(jid) === config.developerId) || (!!config.developerNumber && jidNumber(jid) === config.developerNumber) || db.developers.some(x => jidNumber(x) === jidNumber(jid) || x === jid);
}
export function hasRankPermission(jid) {
  return isDeveloper(jid) || Number(getUser(jid).rank) >= 17;
}
export function isBotManager(jid) {
  return hasRankPermission(jid);
}
