export async function marriageCommand(sock, m, cmd) {
  if (!['زواج', 'طلاق'].includes(cmd)) return false;
  const jid = m.key.remoteJid;
  if (!jid.endsWith('@g.us')) { await sock.sendMessage(jid, { text: '💍 الأمر متاح في المجموعات فقط.' }); return true; }
  let members;
  try { members = (await sock.groupMetadata(jid)).participants.map(x => x.id).filter(x => x !== (m.key.participant || jid)); }
  catch { await sock.sendMessage(jid, { text: '❌ لم أستطع جلب أعضاء المجموعة.' }); return true; }
  if (members.length < 2) { await sock.sendMessage(jid, { text: 'لا يوجد عدد كافٍ لاختيار شخصين.' }); return true; }
  const first = Math.floor(Math.random() * members.length);
  let second = Math.floor(Math.random() * (members.length - 1));
  if (second >= first) second++;
  const couple = [members[first], members[second]];
  if (cmd === 'زواج') {
    await sock.sendMessage(jid, { text: `╭━━━〔 💍 زواج عشوائي 〕━━━╮\n┃ 🎉 تم اختيار عروسين جديدين!\n┃ 👰 @${couple[0].split('@')[0]}\n┃ 🤵 @${couple[1].split('@')[0]}\n┃ ❤️ ألف مبروك!\n╰━━━━━━━━━━━━━━━━━━━━╯`, mentions: couple });
  } else {
    await sock.sendMessage(jid, { text: `╭━━━〔 💔 طلاق عشوائي 〕━━━╮\n┃ 😂 حدثت كارثة زوجية!\n┃ 💔 @${couple[0].split('@')[0]}\n┃ 💔 @${couple[1].split('@')[0]}\n┃ 🥀 تم الطلاق!\n╰━━━━━━━━━━━━━━━━━━━━╯`, mentions: couple });
  }
  return true;
}
