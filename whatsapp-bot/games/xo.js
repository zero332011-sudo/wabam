import {getTargetJid} from '../utils/helpers.js';
const games = new Map();
const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const whoOf = m => m.key.participant || m.key.remoteJid;
const render = b => ` ${b[0]} | ${b[1]} | ${b[2]}\n---+---+---\n ${b[3]} | ${b[4]} | ${b[5]}\n---+---+---\n ${b[6]} | ${b[7]} | ${b[8]}`;
const mention = jid => '@' + jid.split('@')[0];

export async function startXO(sock, m, opponent) {
  const jid=m.key.remoteJid, owner=whoOf(m);
  if (!jid.endsWith('@g.us')) { await sock.sendMessage(jid,{text:'اللعبة متاحة في المجموعات فقط.'}); return true; }
  if (games.has(jid)) { await sock.sendMessage(jid,{text:'هناك لعبة جارية بالفعل.'}); return true; }
  if (!opponent || opponent===owner) { await sock.sendMessage(jid,{text:'ابدأ اللعبة بمنشن خصمك أو بالرد على رسالته: .اكس @الخصم'}); return true; }
  const game={owner,players:new Set([owner]),invited:opponent,turn:null,board:['1','2','3','4','5','6','7','8','9']};
  games.set(jid,game);
  await sock.sendMessage(jid,{text:`🎮 دعوة لعبة XO\n❌ ${mention(owner)} تحدّى ⭕ ${mention(opponent)}\nعلى الخصم كتابة «تم» للانضمام.\nبعد الانضمام استخدموا .لعب 1 إلى 9`,mentions:[owner,opponent]});
  return true;
}
export async function addXOInvite(sock,m,target) {
  const jid=m.key.remoteJid,g=games.get(jid),sender=whoOf(m);
  if(!g)return false;
  if(sender!==g.owner){await sock.sendMessage(jid,{text:'صاحب لعبة XO فقط يقدر يضيف الخصم.'});return true;}
  if(!target||target===g.owner){await sock.sendMessage(jid,{text:'اعمل منشن للخصم أو رد على رسالته بالأمر .مشارك.'});return true;}
  if(g.players.size>=2){await sock.sendMessage(jid,{text:'اللعبة بدأت بالفعل وبها لاعبان.'});return true;}
  g.invited=target;
  await sock.sendMessage(jid,{text:'📩 تمت دعوة '+mention(target)+' للعبة XO. يكتب «تم» للانضمام.',mentions:[target]});
  return true;
}
export async function xoMessage(sock,m,text) {
  const jid=m.key.remoteJid,g=games.get(jid),who=whoOf(m);
  if(!g||!text||text.startsWith('.')) return false;
  if(who===g.owner) {
    const target=getTargetJid(m);
    if(target && target!==g.owner && g.players.size<2) {
      g.invited=target;
      await sock.sendMessage(jid,{text:'📩 تمت دعوة '+mention(target)+' للعبة XO. يكتب «تم» للانضمام.',mentions:[target]});
      return true;
    }
  }
  if(text.trim()==='تم') {
    if(who===g.invited && g.players.size<2) {
      g.players.add(who);
      if(!g.turn)g.turn=g.owner;
      await sock.sendMessage(jid,{text:'✅ '+mention(who)+' انضم للعبة XO. الدور الأول على '+mention(g.turn),mentions:[who,g.turn]});
      return true;
    }
    return false;
  }
  return false;
}
export async function playXO(sock,m,n) {
  const jid=m.key.remoteJid,g=games.get(jid),who=whoOf(m);
  if(!g)return false;
  if(n==='انهاء') {
    if(who!==g.owner){await sock.sendMessage(jid,{text:'صاحب اللعبة فقط يقدر ينهيها.'});return true;}
    games.delete(jid);await sock.sendMessage(jid,{text:'🛑 صاحب اللعبة أنهى XO.'});return true;
  }
  if(n==='انسحب') {
    if(!g.players.has(who)){await sock.sendMessage(jid,{text:'أنت مش مشارك في اللعبة.'});return true;}
    games.delete(jid);await sock.sendMessage(jid,{text:'🚪 '+mention(who)+' انسحب، وانتهت اللعبة.',mentions:[who]});return true;
  }
  if(!g.players.has(who)||!g.turn)return true;
  if(who!==g.turn)return true;
  const i=Number(n)-1;
  if(!Number.isInteger(i)||i<0||i>8||!/^([1-9])$/.test(String(g.board[i]))) {
    await sock.sendMessage(jid,{text:'اختار خانة فاضية من 1 إلى 9.'});return true;
  }
  g.board[i]=who===g.owner?'X':'O';
  const won=wins.some(line=>line.every(x=>g.board[x]===g.board[line[0]]));
  if(won||g.board.every(x=>x==='X'||x==='O')) {
    games.delete(jid);
    await sock.sendMessage(jid,{text:(won?'🏆 انتهت اللعبة!':'🤝 تعادل!')+'\n'+render(g.board)+'\n'+(won?'الفائز: '+mention(who):''),mentions:[who]});
  } else {
    g.turn=[...g.players].find(x=>x!==who);
    await sock.sendMessage(jid,{text:render(g.board)+'\nالدور: '+mention(g.turn)+'\nاكتب .لعب رقم',mentions:[g.turn]});
  }
  return true;
}
export function endXO(jid){return games.delete(jid);}
