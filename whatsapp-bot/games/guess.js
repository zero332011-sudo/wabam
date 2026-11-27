import fs from 'node:fs';
import path from 'node:path';
import { getTargetJid, normalizeAnswer } from '../utils/helpers.js';
import { getDB, getUser, saveDB } from '../database/db.js';

const imageRoot = path.resolve('./anime/images');
const games = new Map();
const ROUND_MS = 30_000;
const HEARTS = 3;
const WIN_REWARD = 20;

function loadAliases() {
  const aliasesFile = path.resolve('./anime/guessAliases.json');
  try {
    const aliases = JSON.parse(fs.readFileSync(aliasesFile, 'utf8'));
    return aliases && typeof aliases === 'object' && !Array.isArray(aliases) ? aliases : {};
  } catch { return {}; }
}
function listImages(folder = imageRoot) {
  if (!fs.existsSync(folder)) return [];
  const aliases = loadAliases();
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) return listImages(full);
    const name = path.parse(entry.name).name;
    return /\.(png|jpe?g|webp)$/i.test(entry.name) && Object.hasOwn(aliases, name) ? [full] : [];
  });
}
function answerAliases(file) {
  const name = path.parse(file).name;
  const direct = loadAliases()[name] || [];
  return new Set([normalizeAnswer(name), ...direct.map(normalizeAnswer)].filter(Boolean));
}
function heartsLine(game) {
  return [...game.participants].map(id => {
    const n = Math.max(0, game.hearts[id] || 0);
    return '@' + id.split('@')[0] + ' ' + '❤️'.repeat(n) + '🖤'.repeat(HEARTS - n);
  }).join('\n');
}
async function finish(sock, jid, game, winner) {
  clearTimeout(game.timer);
  games.delete(jid);
  const remaining = game.hearts[winner] || 0;
  await sock.sendMessage(jid, {
    text: `╭━━━〔 🏆 بطل التخمين 〕━━━╮\n┃ 👑 الفائز: @${winner.split('@')[0]}\n┃ ❤️ القلوب المتبقية: ${remaining}\n┃ 🎉 أنت آخر ناجٍ!\n╰━━━━━━━━━━━━━━━━━━━━╯`,
    mentions: [winner]
  });
}
async function nextRound(sock, jid, game) {
  if (games.get(jid) !== game) return;
  game.resolving = false;
  if (game.round > 0 && game.everHadOpponent && game.participants.size <= 1) {
    const winner = [...game.participants][0];
    if (winner) return finish(sock, jid, game, winner);
    clearTimeout(game.timer); games.delete(jid);
    await sock.sendMessage(jid, { text: '☠️ خرج جميع المشاركين. انتهت اللعبة بلا فائز.' });
    return;
  }
  const files = listImages();
  if (!files.length) {
    games.delete(jid);
    await sock.sendMessage(jid, { text: '❌ لا توجد صور مدعومة بأسماء موجودة في anime/guessAliases.json.' });
    return;
  }
  let choices = files.filter(file => !game.used.has(file));
  if (!choices.length) { game.used.clear(); choices = files; }
  const file = choices[Math.floor(Math.random() * choices.length)];
  game.used.add(file);
  game.answer = answerAliases(file);
  game.answerName = loadAliases()[path.parse(file).name]?.[0] || path.parse(file).name;
  game.round++;
  await sock.sendMessage(jid, {
    image: fs.readFileSync(file),
    caption: `🎯 خمن اسم شخصية الأنمي!\n⏳ الوقت: 30 ثانية\n❤️ القلوب:\n${heartsLine(game)}\n\n✍️ أول إجابة صحيحة تكسب الجولة!`,
    mentions: [...game.participants]
  });
  clearTimeout(game.timer);
  game.timer = setTimeout(async () => {
    if (games.get(jid) !== game) return;
    await sock.sendMessage(jid, {
      text: `⏰ انتهى الوقت!\n✅ الإجابة: *${game.answerName}*\nلم يخسر أي مشارك قلبًا؛ لم توجد إجابة صحيحة هذه الجولة.\n❤️ القلوب:\n${heartsLine(game)}`,
      mentions: [...game.participants]
    });
    await nextRound(sock, jid, game);
  }, ROUND_MS);
}

export async function startGuess(sock, m, opponent) {
  const jid = m.key.remoteJid;
  if (!jid.endsWith('@g.us')) { await sock.sendMessage(jid, { text: '🎯 لعبة خمن متاحة في المجموعات فقط.' }); return true; }
  if (games.has(jid)) { await sock.sendMessage(jid, { text: '🎯 توجد دعوة أو لعبة خمن جارية بالفعل.' }); return true; }
  const owner = m.key.participant || jid;
  if (!opponent || opponent === owner) {
    await sock.sendMessage(jid, { text: '🎯 لتحدي عضو، اكتب .خمن مع منشنه أو بالرد على رسالته.\n✋ العضو المتحدّى يكتب «تم» لقبول التحدي وبدء اللعبة.' });
    return true;
  }
  const game = { owner, invited: opponent, active: false, participants: new Set([owner]), eliminated: new Set(), everHadOpponent: false, hearts: { [owner]: HEARTS }, used: new Set(), round: 0, answer: new Set(), timer: null, resolving: false };
  games.set(jid, game);
  await sock.sendMessage(jid, {
    text: `🎯 تحدي لعبة خمن\n👤 المتحدّي: @${owner.split('@')[0]}\n⚔️ التحدي موجّه إلى: @${opponent.split('@')[0]}\n✋ لقبول التحدي وبدء اللعبة، اكتب «تم».`,
    mentions: [owner, opponent]
  });
  return true;
}

export async function guessMessage(sock, m, text) {
  const jid = m.key.remoteJid, game = games.get(jid), who = m.key.participant || jid;
  if (!game || !text || text.startsWith('.')) return false;
  if (!game.active) {
    if (text.trim() !== 'تم') return false;
    if (who !== game.invited) return false;
    game.participants.add(who);
    game.hearts[who] = HEARTS;
    game.everHadOpponent = true;
    game.active = true;
    await sock.sendMessage(jid, { text: `✅ @${who.split('@')[0]} قبل التحدي!\n🚀 بدأت لعبة خمن.`, mentions: [who] });
    await nextRound(sock, jid, game);
    return true;
  }
  if (game.resolving) return true;
  if (text.trim() === 'تم') {
    if (!game.participants.has(who)) {
      if (game.eliminated.has(who)) {
        await sock.sendMessage(jid, { text: '⛔ خرجت من هذه اللعبة ولا يمكنك الانضمام مرة أخرى.' });
        return true;
      }
      game.participants.add(who);
      game.everHadOpponent = true;
      game.hearts[who] = HEARTS;
      await sock.sendMessage(jid, { text: `✅ @${who.split('@')[0]} انضم للعبة! ❤️❤️❤️`, mentions: [who] });
    }
    return true;
  }
  if (who === game.owner) {
    const target = getTargetJid(m);
    if (target && !game.participants.has(target)) {
      if (game.eliminated.has(target)) {
        await sock.sendMessage(jid, { text: '⛔ هذا العضو خرج من اللعبة ولا يمكنه العودة.' });
        return true;
      }
      game.participants.add(target); game.everHadOpponent = true; game.hearts[target] = HEARTS;
      await sock.sendMessage(jid, { text: `✅ تمت إضافة @${target.split('@')[0]} للمشاركين. ❤️❤️❤️`, mentions: [target] });
      return true;
    }
  }
  if (!game.participants.has(who)) return false;
  if (game.answer.has(normalizeAnswer(text))) {
    game.resolving = true;
    clearTimeout(game.timer);
    const candidates = [...game.participants].filter(id => id !== who);
    const selected = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
    if (selected) {
      game.hearts[selected] = Math.max(0, (game.hearts[selected] ?? HEARTS) - 1);
      if (game.hearts[selected] <= 0) {
        game.participants.delete(selected);
        game.eliminated.add(selected);
      }
    }
    const db = getDB();
    const winnerUser = getUser(who);
    winnerUser.wallet = (Number(winnerUser.wallet) || 0) + WIN_REWARD;
    db.users[who] = winnerUser;
    saveDB(db);
    await sock.sendMessage(jid, {
      text: `🏆 إجابة صحيحة يا @${who.split('@')[0]}!\n🎯 الإجابة: ${game.answerName}\n💰 حصلت على ${WIN_REWARD} ج في محفظتك.\n${selected ? `🎯 تم اختيار @${selected.split('@')[0]} عشوائيًا ليخسر قلبًا واحدًا.` : 'لا يوجد مشارك آخر ليخسر قلبًا.'}\n\n❤️ القلوب:\n${heartsLine(game)}`,
      mentions: [...new Set([...game.participants, ...(selected ? [selected] : [])])]
    });
    await nextRound(sock, jid, game);
    return true;
  }
  await sock.sendMessage(jid, { text: `❌ إجابة غير صحيحة يا @${who.split('@')[0]}، حاول مرة أخرى قبل انتهاء الوقت.`, mentions: [who] });
  return true;
}
export async function leaveGuess(sock, m) {
  const jid = m.key.remoteJid, game = games.get(jid), who = m.key.participant || jid;
  if (!game || !game.participants.has(who)) return false;
  game.participants.delete(who); game.eliminated.add(who); delete game.hearts[who];
  await sock.sendMessage(jid, { text: `🚪 @${who.split('@')[0]} انسحب من لعبة خمن.`, mentions: [who] });
  if (game.participants.size <= 1) await nextRound(sock, jid, game);
  return true;
}
export async function stopGuess(sock, m) {
  const jid = m.key.remoteJid, game = games.get(jid), who = m.key.participant || jid;
  if (!game) return false;
  if (who !== game.owner) { await sock.sendMessage(jid, { text: 'صاحب اللعبة فقط يقدر ينهي الجولة.' }); return true; }
  clearTimeout(game.timer); games.delete(jid);
  await sock.sendMessage(jid, { text: '🛑 صاحب اللعبة أنهى لعبة خمن.' }); return true;
}
export async function addGuessParticipant(sock, m, target) {
  const jid = m.key.remoteJid, game = games.get(jid), sender = m.key.participant || jid;
  if (!game) return false;
  if (sender !== game.owner) { await sock.sendMessage(jid, { text: 'صاحب اللعبة فقط يقدر يضيف مشاركين.' }); return true; }
  if (!target) { await sock.sendMessage(jid, { text: 'اعمل منشن للعضو أو رد على رسالته بالأمر .مشارك' }); return true; }
  if (game.eliminated.has(target)) { await sock.sendMessage(jid, { text: '⛔ هذا العضو خرج من اللعبة ولا يمكنه العودة.' }); return true; }
  if (!game.participants.has(target)) { game.participants.add(target); game.everHadOpponent = true; game.hearts[target] = HEARTS; }
  await sock.sendMessage(jid, { text: `✅ @${target.split('@')[0]} بقى مشارك في اللعبة. ❤️❤️❤️`, mentions: [target] });
  return true;
}
export function endGuess(jid) { const game = games.get(jid); if (game) clearTimeout(game.timer); return games.delete(jid); }
