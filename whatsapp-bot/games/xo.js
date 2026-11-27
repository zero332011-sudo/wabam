import { getTargetJid } from '../utils/helpers.js';
import { getDB, getUser, saveDB } from '../database/db.js';

const games = new Map();
const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const WIN_REWARD = 20;
const whoOf = m => m.key.participant || m.key.remoteJid;
const mention = jid => '@' + jid.split('@')[0];

// لوحة ثابتة المقاسات قدر الإمكان لتظهر كحلبة واضحة داخل رسالة واتساب.
const renderBoard = board => [
  '┏━━━━━━━━┳━━━━━━━━┳━━━━━━━━┓',
  `┃   ${board[0]}   ┃   ${board[1]}   ┃   ${board[2]}   ┃`,
  '┣━━━━━━━━╋━━━━━━━━╋━━━━━━━━┫',
  `┃   ${board[3]}   ┃   ${board[4]}   ┃   ${board[5]}   ┃`,
  '┣━━━━━━━━╋━━━━━━━━╋━━━━━━━━┫',
  `┃   ${board[6]}   ┃   ${board[7]}   ┃   ${board[8]}   ┃`,
  '┗━━━━━━━━┻━━━━━━━━┻━━━━━━━━┛'
].join('\n');

const arenaMessage = (game, status) => [
  '🎮 حلبة لعبة XO',
  '━━━━━━━━━━━━━━━━━━',
  renderBoard(game.board),
  '━━━━━━━━━━━━━━━━━━',
  `❌ ${mention(game.owner)}`,
  `⭕ ${mention(game.invited)}`,
  status
].join('\n');

const gameMentions = game => [game.owner, game.invited].filter(Boolean);

export async function startXO(sock, m, opponent) {
  const jid = m.key.remoteJid, owner = whoOf(m);
  if (!jid.endsWith('@g.us')) {
    await sock.sendMessage(jid, { text: '❎ اللعبة متاحة في المجموعات فقط.' });
    return true;
  }
  if (games.has(jid)) {
    await sock.sendMessage(jid, { text: '⚠️ هناك لعبة جارية بالفعل.' });
    return true;
  }
  if (!opponent || opponent === owner) {
    await sock.sendMessage(jid, { text: '❎ ابدأ اللعبة بمنشن خصمك أو بالرد على رسالته: .xo @الخصم' });
    return true;
  }
  const game = {
    owner,
    players: new Set([owner]),
    invited: opponent,
    turn: null,
    board: ['1','2','3','4','5','6','7','8','9']
  };
  games.set(jid, game);
  await sock.sendMessage(jid, {
    text: `🎮 تحدي لعبة XO\n❌ ${mention(owner)} تحدّى ⭕ ${mention(opponent)}\n✋ على الخصم كتابة «تم» لقبول التحدي.\n🏟️ ستظهر الحلبة وتتحدث برسالة جديدة بعد كل حركة.\n🏆 جائزة الفوز: ${WIN_REWARD} ج`,
    mentions: [owner, opponent]
  });
  return true;
}

export async function addXOInvite(sock, m, target) {
  const jid = m.key.remoteJid, game = games.get(jid), sender = whoOf(m);
  if (!game) return false;
  if (sender !== game.owner) {
    await sock.sendMessage(jid, { text: '⛔ صاحب لعبة XO فقط يستطيع دعوة الخصم.' });
    return true;
  }
  if (!target || target === game.owner) {
    await sock.sendMessage(jid, { text: '👤 اعمل منشن للخصم أو رد على رسالته بالأمر .مشارك.' });
    return true;
  }
  if (game.players.size >= 2) {
    await sock.sendMessage(jid, { text: '⚠️ اللعبة بدأت بالفعل.' });
    return true;
  }
  game.invited = target;
  await sock.sendMessage(jid, {
    text: '📩 تمت دعوة ' + mention(target) + ' للعبة XO. يكتب «تم» لقبول التحدي.',
    mentions: [target]
  });
  return true;
}

export async function xoMessage(sock, m, text) {
  const jid = m.key.remoteJid, game = games.get(jid), who = whoOf(m);
  if (!game || !text || text.startsWith('.')) return false;

  if (who === game.owner) {
    const target = getTargetJid(m);
    if (target && target !== game.owner && game.players.size < 2) {
      game.invited = target;
      await sock.sendMessage(jid, {
        text: '📩 تمت دعوة ' + mention(target) + ' للعبة XO. يكتب «تم» لقبول التحدي.',
        mentions: [target]
      });
      return true;
    }
  }

  // لا تبدأ اللعبة إلا بقبول الشخص المدعو نفسه.
  if (text.trim() === 'تم' && who === game.invited && game.players.size < 2) {
    game.players.add(who);
    game.turn = game.owner;
    await sock.sendMessage(jid, {
      text: arenaMessage(game, `🎯 الدور الأول: ❌ ${mention(game.turn)}\nاكتب: .لعب رقم الخانة (1-9)`),
      mentions: gameMentions(game)
    });
    return true;
  }
  return false;
}

export async function playXO(sock, m, n) {
  const jid = m.key.remoteJid, game = games.get(jid), who = whoOf(m);
  if (!game) return false;

  if (n === 'انهاء') {
    if (who !== game.owner) {
      await sock.sendMessage(jid, { text: '⛔ صاحب اللعبة فقط يستطيع إنهاءها.' });
      return true;
    }
    games.delete(jid);
    await sock.sendMessage(jid, { text: '🛑 انتهت لعبة XO.' });
    return true;
  }

  if (n === 'انسحب') {
    if (!game.players.has(who)) {
      await sock.sendMessage(jid, { text: '⛔ أنت لست مشاركًا.' });
      return true;
    }
    games.delete(jid);
    await sock.sendMessage(jid, {
      text: '🚪 ' + mention(who) + ' انسحب، وانتهت اللعبة.',
      mentions: [who]
    });
    return true;
  }

  if (game.players.size < 2 || !game.turn || !game.players.has(who)) {
    if (who === game.owner || who === game.invited) {
      await sock.sendMessage(jid, { text: '✋ اللعبة لم تبدأ بعد. على الخصم المدعو كتابة «تم» أولًا.' });
    }
    return true;
  }
  if (who !== game.turn) return true;

  const i = Number(n) - 1;
  if (!Number.isInteger(i) || i < 0 || i > 8 || !/^([1-9])$/.test(String(game.board[i]))) {
    await sock.sendMessage(jid, { text: '❌ اختر خانة فارغة من 1 إلى 9.' });
    return true;
  }

  game.board[i] = who === game.owner ? '❌' : '⭕';
  const won = wins.some(line => line.every(x => game.board[x] === game.board[line[0]]));
  const draw = !won && game.board.every(x => x === '❌' || x === '⭕');

  if (won || draw) {
    games.delete(jid);
    if (won) {
      const db = getDB(), user = getUser(who);
      user.wallet = (Number(user.wallet) || 0) + WIN_REWARD;
      db.users[who] = user;
      saveDB(db);
    }
    const result = won
      ? `🏆 الفائز: ${mention(who)}\n💰 الجائزة: ${WIN_REWARD} ج\n✅ تمت إضافة الجائزة إلى محفظته.`
      : '🤝 انتهت المباراة بالتعادل!\nلا توجد جائزة في حالة التعادل.';
    await sock.sendMessage(jid, {
      text: arenaMessage(game, result),
      mentions: won ? gameMentions(game) : []
    });
  } else {
    game.turn = [...game.players].find(player => player !== who);
    const symbol = game.turn === game.owner ? '❌' : '⭕';
    await sock.sendMessage(jid, {
      text: arenaMessage(game, `🎯 الدور الآن: ${symbol} ${mention(game.turn)}\nاكتب: .لعب رقم الخانة (1-9)`),
      mentions: gameMentions(game)
    });
  }
  return true;
}

export function endXO(jid) {
  return games.delete(jid);
}
