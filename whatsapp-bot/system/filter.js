import { getDB } from '../database/db.js';
import { isDeveloper } from '../utils/permissions.js';
import { addWarning, isMuted } from './warnings.js';

const DEFAULT_BLOCKED_WORDS = [
  'كسمك','كس امك','كسم امك','كسختك','كس اختك','ابن المتناكة','ابن المتناكه',
  'ابن الشرموطة','ابن الشرموطه','شرموط','شرموطة','شرموطه','متناك','متناكه',
  'قحبة','قحبه','يا عرص','عرص','يلعن دينك','يلعن ابوك','يلعن امك','خول',
  'منيوك','منيوكه','طيز','زب','كس','نيك','احا','خرا','وسخ',
  'يا غبي','غبي','حمار','حقير','تافه','قذر','يا فاشل','فاشل','اهبل','متخلف','يا كذاب','كذاب'
];
const normalize = value => String(value || '').toLowerCase().normalize('NFKC')
  .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[ًٌٍَُِّْـ]/g, '').replace(/[\u200B-\u200F\uFEFF]/g, '')
  .replace(/[\s\p{P}\p{S}_]+/gu, '');

function normalizedTokens(value) {
  return String(value || '').toLowerCase().normalize('NFKC')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[ًٌٍَُِّْـ]/g, '').replace(/[\u200B-\u200F\uFEFF]/g, '')
    .split(/[^\p{L}\p{N}]+/u).map(normalize).filter(Boolean);
}

export async function filterMessage(sock, m, text) {
  const jid = m.key.remoteJid, sender = m.key.participant || jid;
  if (!jid.endsWith('@g.us') || isDeveloper(sender)) return false;
  if (isMuted(sender, jid)) return true;
  const db = getDB(), tokens = normalizedTokens(text), compact = tokens.join('');
  const sticker = m.message?.stickerMessage;
  const hash = sticker?.fileSha256 ? Buffer.from(sticker.fileSha256).toString('base64') : null;
  const blocked = [...DEFAULT_BLOCKED_WORDS, ...(db.blockedWords || [])].map(normalize).filter(Boolean);
  const badWord = blocked.some(word => word.length <= 3 ? tokens.includes(word) : compact.includes(word));
  const badEmoji = (db.blockedEmojis || []).some(e => e && String(text || '').includes(e));
  const badSticker = !!hash && (db.blockedStickers || []).includes(hash);
  if (!badWord && !badEmoji && !badSticker) return false;
  const result = addWarning(jid, sender);
  await sock.sendMessage(jid, {
    text: result.muted
      ? `🔇 @${sender.split('@')[0]} تم كتمه 30 دقيقة بعد 3 إنذارات.`
      : `⚠️ @${sender.split('@')[0]} ممنوع استخدام الشتائم أو المحتوى المحظور. الإنذار ${result.warnings}/3`,
    mentions: [sender]
  });
  return true;
}
