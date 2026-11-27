import { generalCommand } from '../commands/general.js';
import { adminCommand } from '../commands/admin.js';
import { moderationCommand } from '../commands/moderation.js';
import { economyCommand } from '../commands/economy.js';
import { rankCommand } from '../commands/ranks.js';
import { animeCommand } from '../commands/anime.js';
import { gamesCommand } from '../commands/games.js';
import { ownerTools } from '../system/ownerTools.js';
import { marriageCommand } from '../system/marriage.js';

export async function commandHandler(sock, m, text) {
  if (!text.startsWith('.')) return false;
  const cmd = text.trim().split(/\s+/)[0];
  const handlers = [
    () => adminCommand(sock, m, text),
    () => moderationCommand(sock, m, text),
    () => ownerTools(sock, m, text),
    () => economyCommand(sock, m, text),
    () => rankCommand(sock, m, text),
    () => animeCommand(sock, m, text),
    () => gamesCommand(sock, m, text),
    () => marriageCommand(sock, m, cmd.slice(1)),
    () => generalCommand(sock, m, text)
  ];
  for (const handler of handlers) if (await handler()) return true;
  await sock.sendMessage(m.key.remoteJid, { text: '❌ أمر غير معروف. اكتب .الاوامر' });
  return false;
}
