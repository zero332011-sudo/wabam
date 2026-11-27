import fs from 'node:fs';
import path from 'node:path';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getDB, saveDB } from '../database/db.js';
import { isDeveloper } from '../utils/permissions.js';

const mediaDir = path.resolve(process.env.MEDIA_DIR || path.join(process.env.DATA_DIR || '.', 'anime', 'media'));
const libraryFile = path.resolve(process.env.ANIME_LIBRARY_FILE || path.join(process.env.DATA_DIR || '.', '..', 'shared', 'anime-library.json'));
const selections = new Map();
const safe = s => String(s || '').replace(/[^\p{L}\p{N}_-]/gu, '_').slice(0, 80);
const parsePair = value => String(value || '').split('|').map(x => x.trim());
const readSharedLibrary = () => {
  try {
    const data = JSON.parse(fs.readFileSync(libraryFile, 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch { return {}; }
};
const writeSharedLibrary = data => {
  fs.mkdirSync(path.dirname(libraryFile), { recursive: true });
  fs.writeFileSync(libraryFile + '.tmp', JSON.stringify(data, null, 2));
  fs.renameSync(libraryFile + '.tmp', libraryFile);
};
const getTargetLibrary = () => {
  const shared = readSharedLibrary();
  return Object.keys(shared).length ? shared : getDB().anime;
};
function getEpisodes(section) {
  if (Array.isArray(section)) return section;
  return Array.isArray(section?.episodes) ? section.episodes : [];
}
async function downloadTelegramFile(fileId) {
  const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('رمز بوت التليجرام غير مضبوط في الاستضافة.');
  const infoResponse = await fetch('https://api.telegram.org/bot' + token + '/getFile?file_id=' + encodeURIComponent(fileId));
  const info = await infoResponse.json();
  if (!infoResponse.ok || !info.ok || !info.result?.file_path) throw new Error('تعذر الحصول على ملف الوسائط من التليجرام.');
  const fileResponse = await fetch('https://api.telegram.org/file/bot' + token + '/' + info.result.file_path);
  if (!fileResponse.ok) throw new Error('تعذر تنزيل ملف الوسائط.');
  return Buffer.from(await fileResponse.arrayBuffer());
}
async function sendTelegramMediaToWhatsApp(sock, jid, media, caption) {
  const buffer = await downloadTelegramFile(media.fileId);
  if (media.type === 'photo') return sock.sendMessage(jid, { image: buffer, caption });
  if (media.type === 'video') return sock.sendMessage(jid, { video: buffer, caption });
  if (media.type === 'animation') return sock.sendMessage(jid, { video: buffer, gifPlayback: true, caption });
  if (media.type === 'audio') return sock.sendMessage(jid, { audio: buffer, mimetype: media.mimeType || 'audio/mpeg' });
  if (media.type === 'voice') return sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true });
  return sock.sendMessage(jid, { document: buffer, fileName: media.fileName || 'anime-media', mimetype: media.mimeType || 'application/octet-stream', caption });
}
async function sendLibraryCover(sock, jid, media, caption) {
  if (!media?.fileId) return false;
  await sendTelegramMediaToWhatsApp(sock, jid, media, caption);
  return true;
}


async function sendEpisode(sock, jid, anime, section, episode) {
  const caption = `🍥 ${anime} — ${section}\n🎬 الحلقة ${episode.number}`;
  if (episode.media?.fileId) {
    await sendTelegramMediaToWhatsApp(sock, jid, episode.media, caption);
    return true;
  }
  if (episode.url && /^https?:\/\//i.test(episode.url)) {
    const isVideo = !episode.mimeType || episode.mimeType.startsWith('video/');
    if (isVideo) await sock.sendMessage(jid, { video: { url: episode.url }, caption });
    else await sock.sendMessage(jid, { document: { url: episode.url }, fileName: episode.fileName || `episode-${episode.number}`, mimetype: episode.mimeType, caption });
    return true;
  }
  const file = path.resolve(episode.file || '');
  if (!file || !file.startsWith(mediaDir + path.sep) || !fs.existsSync(file)) return false;
  const buffer = fs.readFileSync(file);
  if (/\.(mp4|mov|webm)$/i.test(file)) await sock.sendMessage(jid, { video: buffer, caption });
  else await sock.sendMessage(jid, { document: buffer, fileName: path.basename(file), mimetype: 'application/octet-stream', caption });
  return true;
}

export async function animeCommand(sock, m, text) {
  const jid = m.key.remoteJid, sender = m.key.participant || jid;
  const parts = text.trim().split(/\s+/), cmd = parts[0], db = getDB();
  if (cmd === '.انمي') {
    const names = Object.keys(getTargetLibrary());
    if (!names.length) {
      await sock.sendMessage(jid, { text: '🍥 مكتبة الأنمي فارغة حاليًا. يمكن للمطور إضافة الأنميات من لوحة إدارة التليجرام.' });
      return true;
    }
    selections.set(jid + ':' + sender, { step: 'anime', animeNames: names });
    await sock.sendMessage(jid, {
      text: '🍥 مكتبة الأنمي\n\n' + names.map((name, i) => `${i + 1}. ${name}`).join('\n') +
        '\n\n🔢 أرسل رقم الأنمي الذي تريده.'
    });
    return true;
  }
  if (cmd === '.حلقات' || cmd === '.حلقه') {
    const [anime, section, episodeNo] = parsePair(parts.slice(1).join(' '));
    const episodes = getEpisodes(getTargetLibrary()[anime]?.sections?.[section] ?? db.anime[anime]?.sections?.[section]);
    if (!episodes) {
      await sock.sendMessage(jid, { text: '❌ الأنمي أو القسم غير موجود. الصيغة: .حلقات اسم الأنمي|اسم القسم' });
      return true;
    }
    if (cmd === '.حلقات') {
      const list = episodes.map(e => typeof e === 'string' ? path.basename(e) : 'الحلقة ' + e.number).join('\n');
      await sock.sendMessage(jid, { text: list ? '📺 حلقات ' + anime + ' - ' + section + '\n' + list : 'لا توجد حلقات مضافة لهذا القسم.' });
      return true;
    }
    const item = episodes.find(e => String(typeof e === 'string' ? path.parse(e).name : e.number) === String(episodeNo));
    if (!episodeNo || !item) {
      await sock.sendMessage(jid, { text: '❌ الحلقة غير موجودة. استخدم: .حلقه الأنمي|القسم|رقم الحلقة' });
      return true;
    }
    const sent = await sendEpisode(sock, jid, anime, section, typeof item === 'string' ? { number: episodeNo, file: item } : item);
    if (!sent) await sock.sendMessage(jid, { text: '❌ ملف الحلقة غير موجود على الاستضافة.' });
    return true;
  }
  if (!['.اضافه', '.حذف'].includes(cmd)) return false;
  if (!isDeveloper(sender)) {
    await sock.sendMessage(jid, { text: '⛔ إدارة مكتبة الأنمي للمطورين فقط.' });
    return true;
  }
  if (parts[1] === 'انمي' && cmd === '.اضافه') {
    const name = parts.slice(2).join(' ').trim();
    if (!name) { await sock.sendMessage(jid, { text: '🍥 اكتب اسم الأنمي.' }); return true; }
    db.anime[name] ||= { sections: {} }; saveDB(db);
    await sock.sendMessage(jid, { text: '✅ تمت إضافة الأنمي محليًا: ' + name });
    return true;
  }
  if (parts[1] === 'قسم' && cmd === '.اضافه') {
    const [anime, section] = parsePair(parts.slice(2).join(' '));
    if (!anime || !section || !db.anime[anime]) {
      await sock.sendMessage(jid, { text: '📁 الاستخدام: .اضافه قسم اسم_الانمي|اسم_القسم' });
      return true;
    }
    db.anime[anime].sections ||= {}; db.anime[anime].sections[section] ||= []; saveDB(db);
    await sock.sendMessage(jid, { text: '✅ تمت إضافة القسم ' + section + ' داخل ' + anime + '.' });
    return true;
  }
  if (parts[1] === 'حلقه' && cmd === '.اضافه') {
    const [anime, section, requestedNo] = parsePair(parts.slice(2).join(' '));
    const episodes = db.anime[anime]?.sections?.[section];
    const media = m.message?.videoMessage || m.message?.documentMessage;
    const filename = String(media?.fileName || media?.title || '');
    const detected = filename.match(/(?:episode|ep|حلقة|الحلقه|e)?\s*0*(\d{1,4})(?!.*\d)/i)?.[1];
    const episodeNo = requestedNo || detected;
    if (!episodes || !media || !episodeNo) {
      await sock.sendMessage(jid, { text: '🎬 أرفق الفيديو واكتب .اضافه حلقه الأنمي|القسم|رقم الحلقة. يمكن ترك الرقم إذا كان اسم الملف يحتوي رقم الحلقة.' });
      return true;
    }
    try {
      fs.mkdirSync(mediaDir, { recursive: true });
      const buffer = await downloadMediaMessage(m, 'buffer', {}, { logger: sock.logger || console });
      const ext = media.mimetype === 'video/mp4' ? '.mp4' : (media.fileName ? path.extname(media.fileName) : '.bin') || '.bin';
      const file = path.join(mediaDir, safe(anime + '_' + section + '_' + episodeNo) + ext);
      fs.writeFileSync(file, buffer);
      const old = episodes.findIndex(e => String(typeof e === 'string' ? path.parse(e).name : e.number) === String(episodeNo));
      const record = { number: String(episodeNo), file };
      if (old >= 0) episodes[old] = record; else episodes.push(record);
      saveDB(db);
      await sock.sendMessage(jid, { text: '✅ تم حفظ الحلقة ' + episodeNo + ' في ' + anime + ' / ' + section + '.' });
    } catch (error) {
      console.error('Anime episode download:', error);
      await sock.sendMessage(jid, { text: '❌ فشل تحميل ملف الحلقة.' });
    }
    return true;
  }
  if (parts[1] === 'قسم' && cmd === '.حذف') {
    const [anime, section] = parsePair(parts.slice(2).join(' '));
    if (!db.anime[anime]?.sections?.[section]) { await sock.sendMessage(jid, { text: '❌ القسم غير موجود.' }); return true; }
    delete db.anime[anime].sections[section]; saveDB(db);
    await sock.sendMessage(jid, { text: '🗑️ تم حذف القسم.' }); return true;
  }
  if (parts[1] === 'انمي' && cmd === '.حذف') {
    const name = parts.slice(2).join(' ').trim();
    if (!db.anime[name]) { await sock.sendMessage(jid, { text: '❌ الأنمي غير موجود.' }); return true; }
    delete db.anime[name]; saveDB(db);
    await sock.sendMessage(jid, { text: '🗑️ تم حذف الأنمي وأقسامه.' }); return true;
  }
  return false;
}

export async function animeMessage(sock, m, text) {
  const jid = m.key.remoteJid, sender = m.key.participant || jid, key = jid + ':' + sender;
  const state = selections.get(key);
  if (!state || !text || text.startsWith('.')) return false;
  if (['الغاء', 'إلغاء', 'cancel'].includes(text.trim().toLowerCase())) {
    selections.delete(key);
    await sock.sendMessage(jid, { text: '↩️ تم إلغاء اختيار الأنمي.' });
    return true;
  }
  const choice = Number(text.trim());
  if (!Number.isInteger(choice) || choice < 1) return false;
  if (state.step === 'anime') {
    const name = state.animeNames[choice - 1];
    if (!name) { await sock.sendMessage(jid, { text: '❌ رقم الأنمي غير صحيح. أرسل رقمًا من القائمة.' }); return true; }
    const sections = Object.entries(getTargetLibrary()[name]?.sections || {});
    if (!sections.length) { selections.delete(key); await sock.sendMessage(jid, { text: '📁 لا توجد أقسام لهذا الأنمي حتى الآن.' }); return true; }
    selections.set(key, { step: 'section', anime: name, sections });
    const caption = '🍥 ' + name + '\n\n' + sections.map(([s], i) => `${i + 1}. 📁 ${s}`).join('\n') + '\n\n🔢 أرسل رقم القسم.';
    const cover = getTargetLibrary()[name]?.image;
    if (cover?.fileId) await sendLibraryCover(sock, jid, cover, caption);
    else await sock.sendMessage(jid, { text: caption });
    return true;
  }
  if (state.step === 'section') {
    const selected = state.sections[choice - 1];
    if (!selected) { await sock.sendMessage(jid, { text: '❌ رقم القسم غير صحيح.' }); return true; }
    const episodes = getEpisodes(selected[1]);
    if (!episodes.length) { selections.delete(key); await sock.sendMessage(jid, { text: '🎬 لا توجد حلقات في هذا القسم.' }); return true; }
    selections.set(key, { step: 'episode', anime: state.anime, section: selected[0], episodes });
    const caption = '📺 ' + state.anime + ' — ' + selected[0] + '\n\n' + episodes.map((e, i) => `${i + 1}. ▶️ الحلقة ${e.number}`).join('\n') + '\n\n🔢 أرسل رقم الحلقة.';
    const sectionData = selected[1];
    if (!Array.isArray(sectionData) && sectionData?.image?.fileId) await sendLibraryCover(sock, jid, sectionData.image, caption);
    else await sock.sendMessage(jid, { text: caption });
    return true;
  }
  if (state.step === 'episode') {
    const episode = state.episodes[choice - 1];
    if (!episode) { await sock.sendMessage(jid, { text: '❌ رقم الحلقة غير صحيح.' }); return true; }
    selections.delete(key);
    try {
      const sent = await sendEpisode(sock, jid, state.anime, state.section, episode);
      if (!sent) await sock.sendMessage(jid, { text: '❌ الحلقة غير متاحة حاليًا.' });
    } catch (error) {
      console.error('Send anime episode:', error);
      await sock.sendMessage(jid, { text: '❌ تعذر إرسال الحلقة. قد يكون رابط الفيديو غير متاح.' });
    }
    return true;
  }
  return false;
}
