import { bot } from './bot.js';
console.log('WABAM starting...');
bot.start({ onStart: info => console.log('WABAM started as @' + info.username) });
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
