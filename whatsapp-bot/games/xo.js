import { getTargetJid } from '../utils/helpers.js';
import { getDB, getUser, saveDB } from '../database/db.js';
const games = new Map();
const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const WIN_REWARD = 20;
const whoOf = m => m.key.participant || m.key.remoteJid;
const render = b => ` ${b[0]} | ${b[1]} | ${b[2]}\n---+---+---\n ${b[3]} | ${b[4]} | ${b[5]}\n---+---+---\n ${b[6]} | ${b[7]} | ${b[8]}`;
const mention = jid => '@' + jid.split('@')[0];

export async function startXO(sock, m, opponent) {
  const jid = m.key.remoteJid, owner = whoOf(m);
  if (!jid.endsWith('@g.us')) { await sock.sendMessage(jid, { text: '❎ اللعبة متاحة في المجموعات فقط.' }); return true; }
  if (games.has(jid)) { await sock.sendMessage(jid, { text: '⚠️ هناك لعبة جارية بالفعل.' }); return true; }
  if (!opponent || opponent === owner) {
    await sock.sendMessage(jid, { text: '❎ ابدأ اللعبة بمنشن خصمك أو بالرد على رسالته: .xo @الخصم' });
    return true;
  }
  const game = { owner, players: new Set([owner]), invited: opponent, turn: null, board: ['1','2','3','4','5','6','7','8','9'] };
  games.set(jid, game);
  await sock.sendMessage(jid, {
    text: `🎮 دعوة لعبة XO\n❌ ${mention(owner)} تحدّى ⭕ ${mention(opponent)}\n✋ على الخصم كتابة «تم» للانضمام.\n🎯 بعد الانضمام استخدموا .لعب رقم من 1 إلى 9.\n🏆 جائزة الفوز: 20 ج`,
    mentions: [owner, opponent]
  });
  return true;
}
export async function addXOInvite(sock, m, target) {
  const jid = m.key.remoteJid, game = games.get(jid), sender = whoOf(m);
  if (!game) return false;
  if (sender !== game.owner) { await sock.sendMessage(jid, { text: '⛔ صاحب لعبة XO فقط يستطيع دعوة الخصم.' }); return true; }
  if (!target || target === game.owner) { await sock.sendMessage(jid, { text: '👤 اعمل منشن للخصم أو رد على رسالته بالأمر .مشارك.' }); return true; }
  if (game.players.size >= 2) { await sock.sendMessage(jid, { text: '⚠️ اللعبة بدأت بالفعل.' }); return true; }
  game.invited = target;
  await sock.sendMessage(jid, { text: '📩 تمت دعوة ' + mention(target) + ' للعبة XO. يكتب «تم» للانضمام.', mentions: [target] });
  return true;
}
export async function xoMessage(sock, m, text) {
  const jid = m.key.remoteJid, game = games.get(jid), who = whoOf(m);
  if (!game || !text || text.startsWith('.')) return false;
  if (who === game.owner) {
    const target = getTargetJid(m);
    if (target && target !== game.owner && game.players.size < 2) {
      game.invited = target;
      await sock.sendMessage(jid, { text: '📩 تمت دعوة ' + mention(target) + ' للعبة XO. يكتب «تم» للانضمام.', mentions: [target] });
      return true;
    }
  }
  if (text.trim() === 'تم' && who === game.invited && game.players.size < 2) {
    game.players.add(who);
    if (!game.turn) game.turn = game.owner;
    await sock.sendMessage(jid, { text: '✅ ' + mention(who) + ' انضم للعبة XO.\n🎯 الدور الأول على ' + mention(game.turn), mentions: [who, game.turn] });
    return true;
  }
  return false;
}
export async function playXO(sock, m, n) {
  const jid = m.key.remoteJid, game = games.get(jid), who = whoOf(m);
  if (!game) return false;
  if (n === 'انهاء') {
    if (who !== game.owner) { await sock.sendMessage(jid, { text: '⛔ صاحب اللعبة فقط يستطيع إنهاءها.' }); return true; }
    games.delete(jid); await sock.sendMessage(jid, { text: '🛑 انتهت لعبة XO.' }); return true;
  }
  if (n === 'انسحب') {
    if (!game.players.has(who)) { await sock.sendMessage(jid, { text: '⛔ أنت لست مشاركًا.' }); return true; }
    games.delete(jid); await sock.sendMessage(jid, { text: '🚪 ' + mention(who) + ' انسحب، وانتهت اللعبة.', mentions: [who] }); return true;
  }
  if (!game.players.has(who) || !game.turn) return true;
  if (who !== game.turn) return true;
  const i = Number(n) - 1;
  if (!Number.isInteger(i) || i < 0 || i > 8 || !/^([1-9])$/.test(String(game.board[i]))) {
    await sock.sendMessage(jid, { text: '❌ اختر خانة فارغة من 1 إلى 9.' }); return true;
  }
  game.board[i] = who === game.owner ? '❌' : '⭕';
  const won = wins.some(line => line.every(x => game.board[x] === game.board[line[0]]));
  if (won || game.board.every(x => x === '❌' || x === '⭕')) {
    games.delete(jid);
    if (won) {
      const db = getDB(), user = getUser(who);
      user.wallet = (Number(user.wallet) || 0) + WIN_REWARD;
      db.users[who] = user; saveDB(db);
    }
    await sock.sendMessage(jid, {
      text: (won ? '🏆 انتهت اللعبة!' : '🤝 تعادل!') + '\n' + render(game.board) +
        (won ? `\n🥇 الفائز: ${mention(who)}\n💰 الجائزة: ${WIN_REWARD} ج\n✅ تمت إضافة الجائزة إلى محفظته.` : '\nلا توجد جائزة في حالة التعادل.'),
      mentions: won ? [who] : []
    });
  } else {
    game.turn = [...game.players].find(x => x !== who);
    await sock.sendMessage(jid, { text: render(game.board) + '\n🎯 الدور: ' + mention(game.turn) + '\nاكتب .لعب رقم', mentions: [game.turn] });
  }
  return true;
}
export function endXO(jid) { return games.delete(jid); }
