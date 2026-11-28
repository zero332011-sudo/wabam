import { bot } from './bot.js';
import { config } from './config.js';
import { restoreWhatsApp } from './process-manager.js';

console.log('WABAM starting...');
restoreWhatsApp(config)
  .then(count => console.log('WhatsApp linked numbers restored:', count))
  .catch(error => console.error('WhatsApp restore error:', error?.stack || error));
bot.start({ onStart: info => console.log('WABAM started as @' + info.username) });
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
