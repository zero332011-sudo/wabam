import { downloadMediaMessage } from '@whiskeysockets/baileys';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getDB, saveDB } from '../database/db.js';

const MEDIA_TYPES = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage', 'ptvMessage'];
const WRAPPERS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage'];

function unwrapMessage(message) {
  let current = message || {};
  for (let i = 0; i < 8; i++) {
    const wrapper = WRAPPERS.find(key => current[key]?.message);
    if (!wrapper) break;
    current = current[wrapper].message;
  }
  return current;
}

function getMedia(message) {
  const unwrapped = unwrapMessage(message);
  for (const key of MEDIA_TYPES) {
    if (unwrapped[key]) return { kind: key.replace('Message', ''), value: unwrapped[key] };
  }
  return null;
}

function getContextInfo(message) {
  const unwrapped = unwrapMessage(message);
  for (const key of [
    'extendedTextMessage', 'imageMessage', 'videoMessage',
    'documentMessage', 'audioMessage', 'stickerMessage'
  ]) {
    if (unwrapped[key]?.contextInfo) return unwrapped[key].contextInfo;
  }
  return null;
}

function extensionFor(kind, mimetype = '') {
  const mime = String(mimetype).toLowerCase();
  if (mime.includes('jpeg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('pdf')) return 'pdf';
  if (kind === 'image') return 'jpg';
  if (kind === 'video' || kind === 'ptv') return 'mp4';
  if (kind === 'sticker') return 'webp';
  return 'bin';
}

const cacheKey = (jid, id) => String(jid) + ':' + String(id);
function cacheDirectory() {
  const root = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || '.';
  return path.resolve(process.env.MEDIA_CACHE_DIR || path.join(root, 'media-cache'));
}

async function sendPayload(sock, jid, record, buffer) {
  const caption = record.caption || '';
  if (record.kind === 'image') return sock.sendMessage(jid, { image: buffer, caption });
  if (record.kind === 'video' || record.kind === 'ptv') return sock.sendMessage(jid, { video: buffer, caption });
  if (record.kind === 'audio') return sock.sendMessage(jid, { audio: buffer, mimetype: record.mimetype || 'audio/ogg; codecs=opus', ptt: !!record.ptt });
  if (record.kind === 'sticker') return sock.sendMessage(jid, { sticker: buffer });
  if (record.kind === 'document') return sock.sendMessage(jid, { document: buffer, fileName: record.fileName || 'file', mimetype: record.mimetype || 'application/octet-stream', caption });
  return false;
}

// Save each media message immediately, while its temporary WhatsApp media key is valid.
export async function cacheIncomingMedia(sock, message) {
  const jid = message?.key?.remoteJid;
  const id = message?.key?.id;
  const found = getMedia(message?.message);
  if (!jid || !id || !found) return false;

  const key = cacheKey(jid, id);
  const db = getDB();
  db.mediaCache ||= {};
  if (db.mediaCache[key]?.filePath) {
    try {
      await fs.access(db.mediaCache[key].filePath);
      return true;
    } catch {
      // The database entry may outlive a temporary container file; rebuild it now.
      delete db.mediaCache[key];
    }
  }

  try {
    const downloaded = await downloadMediaMessage(message, 'buffer', {}, {
      logger: sock.logger || console,
      reuploadRequest: sock.updateMediaMessage
    });
    const buffer = Buffer.isBuffer(downloaded) ? downloaded : Buffer.from(downloaded);
    const dir = cacheDirectory();
    await fs.mkdir(dir, { recursive: true });
    const hash = createHash('sha256').update(key).digest('hex');
    const filePath = path.join(dir, hash + '.' + extensionFor(found.kind, found.value.mimetype));
    await fs.writeFile(filePath + '.tmp', buffer);
    await fs.rename(filePath + '.tmp', filePath);

    db.mediaCache[key] = {
      filePath,
      kind: found.kind,
      caption: found.value.caption || '',
      mimetype: found.value.mimetype || '',
      fileName: found.value.fileName || '',
      ptt: !!found.value.ptt,
      createdAt: Date.now()
    };

    const entries = Object.entries(db.mediaCache).sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
    while (entries.length > 500) {
      const [oldKey, oldRecord] = entries.shift();
      delete db.mediaCache[oldKey];
      if (oldRecord?.filePath) await fs.unlink(oldRecord.filePath).catch(() => {});
    }
    saveDB(db);
    return true;
  } catch (error) {
    console.error('Media cache:', error?.message || error);
    return false;
  }
}

export async function showMedia(sock, message) {
  const jid = message.key.remoteJid;
  const ctx = getContextInfo(message.message);
  if (!ctx?.quotedMessage || !ctx?.stanzaId) {
    await sock.sendMessage(jid, { text: '📎 رد على صورة أو فيديو أو ملف بالأمر .عرض.' });
    return true;
  }

  const cached = getDB().mediaCache?.[cacheKey(jid, ctx.stanzaId)];
  if (cached?.filePath) {
    try {
      const buffer = await fs.readFile(cached.filePath);
      await sendPayload(sock, jid, cached, buffer);
      return true;
    } catch (error) {
      console.error('Cached media read:', error?.message || error);
    }
  }

  // Try the old download route for messages received before caching was enabled.
  const quoted = {
    key: {
      remoteJid: jid,
      id: ctx.stanzaId,
      participant: ctx.participant || ctx.participantPn || ctx.participantAlt || message.key.participant,
      fromMe: !!ctx.fromMe
    },
    message: ctx.quotedMessage,
    messageTimestamp: message.messageTimestamp
  };
  try {
    const buffer = await downloadMediaMessage(quoted, 'buffer', {}, {
      logger: sock.logger || console,
      reuploadRequest: sock.updateMediaMessage
    });
    const found = getMedia(ctx.quotedMessage);
    if (!found) {
      await sock.sendMessage(jid, { text: '⚠️ نوع الوسائط ده مش مدعوم في .عرض.' });
      return true;
    }
    const record = {
      kind: found.kind,
      caption: found.value.caption || '',
      mimetype: found.value.mimetype || '',
      fileName: found.value.fileName || '',
      ptt: !!found.value.ptt
    };
    // Save a successful fallback download for future .عرض requests.
    try {
      const dir = cacheDirectory();
      await fs.mkdir(dir, { recursive: true });
      const hash = createHash('sha256').update(cacheKey(jid, ctx.stanzaId)).digest('hex');
      const filePath = path.join(dir, hash + '.' + extensionFor(record.kind, record.mimetype));
      await fs.writeFile(filePath + '.tmp', buffer);
      await fs.rename(filePath + '.tmp', filePath);
      const db = getDB();
      db.mediaCache ||= {};
      db.mediaCache[cacheKey(jid, ctx.stanzaId)] = { ...record, filePath, createdAt: Date.now() };
      saveDB(db);
    } catch (cacheError) {
      console.error('Persist quoted media:', cacheError?.message || cacheError);
    }
    await sendPayload(sock, jid, record, buffer);
    return true;
  } catch (error) {
    console.error('Show media:', error?.message || error);
    await sock.sendMessage(jid, { text: '❌ الوسائط دي وصلت قبل تفعيل الحفظ أو لم تعد متاحة. الوسائط الجديدة هتتحفظ تلقائيًا.' });
    return true;
  }
}
