import { Bot, InlineKeyboard } from 'grammy';
import { config } from './config.js';
import { getStatus, getLogs, setPairingNotifier, startWhatsApp, stopWhatsApp } from './process-manager.js';

const bot = new Bot(config.token);
const waitingForNumber = new Set();
const keyboard = () => new InlineKeyboard()
  .text('📲 ربط / تشغيل', 'pair').row()
  .text('📊 الحالة', 'status').text('📜 السجلات', 'logs').row()
  .text('⏹ إيقاف', 'stop');
const ownerOnly = ctx => ctx.from?.id === config.ownerId;

async function deny(ctx) {
  if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'غير مصرح لك.' });
  else await ctx.reply('هذا البوت خاص بمالكه فقط.');
}
async function menu(ctx) {
  await ctx.reply('🎛️ WABAM — لوحة إدارة بوت واتساب\nاختر العملية:', { reply_markup: keyboard() });
}
async function requestNumber(ctx) {
  waitingForNumber.add(ctx.from.id);
  await ctx.reply('أرسل رقم واتساب بصيغة دولية مع مفتاح الدولة، أرقام فقط.');
}

setPairingNotifier(async (chatId, code) => {
  await bot.api.sendMessage(chatId, '🔐 رمز ربط واتساب:\n\n' + code + '\n\nافتح واتساب ← الأجهزة المرتبطة ← ربط جهاز ← الربط باستخدام رقم الهاتف. أدخل الرمز كما هو. لا تشاركه مع أحد.');
});

bot.command(['start', 'help'], async ctx => ownerOnly(ctx) ? menu(ctx) : deny(ctx));
bot.callbackQuery('pair', async ctx => {
  if (!ownerOnly(ctx)) return deny(ctx);
  await ctx.answerCallbackQuery();
  await requestNumber(ctx);
});
bot.callbackQuery('status', async ctx => {
  if (!ownerOnly(ctx)) return deny(ctx);
  await ctx.answerCallbackQuery();
  const s = getStatus();
  await ctx.reply('📊 الحالة: ' + (s.running ? 'يعمل' : 'متوقف') + '\nرقم واتساب: ' + (s.number || 'غير محدد') + '\nPID: ' + (s.pid || '—'), { reply_markup: keyboard() });
});
bot.callbackQuery('logs', async ctx => {
  if (!ownerOnly(ctx)) return deny(ctx);
  await ctx.answerCallbackQuery();
  const lines = getLogs();
  await ctx.reply('📜 آخر السجلات:\n\n' + (lines.length ? lines.join('\n') : 'لا توجد سجلات.'), { reply_markup: keyboard() });
});
bot.callbackQuery('stop', async ctx => {
  if (!ownerOnly(ctx)) return deny(ctx);
  await ctx.answerCallbackQuery();
  await ctx.reply(stopWhatsApp() ? '⏹ تم إرسال طلب الإيقاف.' : 'البوت متوقف بالفعل.', { reply_markup: keyboard() });
});
bot.on('message:text', async ctx => {
  if (!ownerOnly(ctx)) return deny(ctx);
  if (!waitingForNumber.has(ctx.from.id)) return;
  const value = ctx.message.text.trim();
  if (!/^\+?[0-9\s()-]{10,22}$/.test(value)) return ctx.reply('الرقم غير صحيح. أرسله مع مفتاح الدولة.');
  waitingForNumber.delete(ctx.from.id);
  try {
    await startWhatsApp(value, ctx.chat.id, config);
    await ctx.reply('⏳ بدأ تشغيل بوت واتساب. سأرسل رمز الربط هنا فور ظهوره.');
  } catch (err) { await ctx.reply('❌ ' + err.message); }
});
bot.catch(err => console.error('Telegram error:', err));
export { bot };
