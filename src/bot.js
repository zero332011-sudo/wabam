import { Bot, InlineKeyboard } from 'grammy';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { getStatus, getLogs, setPairingNotifier, startWhatsApp, stopWhatsApp, restartWhatsApp } from './process-manager.js';

const bot = new Bot(config.token);
const waitingForNumber = new Set();
const pendingInput = new Map();
const libraryFile = path.resolve(config.dataDir, 'shared', 'anime-library.json');

function readLibrary() {
  try {
    const value = JSON.parse(fs.readFileSync(libraryFile, 'utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch { return {}; }
}
function writeLibrary(value) {
  fs.mkdirSync(path.dirname(libraryFile), { recursive: true });
  fs.writeFileSync(libraryFile + '.tmp', JSON.stringify(value, null, 2));
  fs.renameSync(libraryFile + '.tmp', libraryFile);
}
function entries(obj) { return Object.entries(obj || {}); }
const ownerOnly = ctx => ctx.from?.id === config.ownerId;
const mainKeyboard = () => new InlineKeyboard()
  .text('🍥 مكتبة الأنمي', 'library:home').row()
  .text('⚙️ لوحة الإدارة', 'admin:home');
const adminKeyboard = () => new InlineKeyboard()
  .text('1️⃣ إدارة الأنمي', 'admin:anime').row()
  .text('2️⃣ إدارة الواتساب', 'admin:whatsapp').row()
  .text('3️⃣ الإدارة العامة', 'admin:general').row()
  .text('↩️ القائمة الرئيسية', 'home');
const whatsappKeyboard = () => new InlineKeyboard()
  .text('📲 ربط / تشغيل', 'wa:pair').row()
  .text('📊 الحالة', 'wa:status').text('📜 السجلات', 'wa:logs').row()
  .text('⏹ إيقاف', 'wa:stop').text('🔄 إعادة تشغيل', 'wa:restart').row()
  .text('↩️ لوحة الإدارة', 'admin:home');
const animeAdminKeyboard = () => new InlineKeyboard()
  .text('➕ إضافة أنمي', 'anime:add').row()
  .text('📁 إضافة قسم', 'anime:section').row()
  .text('🎬 إضافة حلقة برابط', 'anime:episode').row()
  .text('🔗 تعديل رابط حلقة', 'anime:edit').row()
  .text('🗑️ حذف أنمي', 'anime:delete').row()
  .text('↩️ لوحة الإدارة', 'admin:home');
const ownerDeny = async ctx => {
  if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'هذه الوظيفة للمالك فقط.' });
  else await ctx.reply('⛔ هذه الوظيفة للمالك فقط.');
};
async function showHome(ctx) {
  await ctx.reply('🌌 WABAM\nمرحبًا بك! اختر الخدمة:', { reply_markup: mainKeyboard() });
}
async function showAdmin(ctx) {
  if (!ownerOnly(ctx)) return ownerDeny(ctx);
  await ctx.reply('⚙️ لوحة إدارة WABAM\nاختر القسم:', { reply_markup: adminKeyboard() });
}
async function showLibrary(ctx) {
  const anime = entries(readLibrary());
  if (!anime.length) return ctx.reply('🍥 مكتبة الأنمي فارغة حاليًا.');
  const kb = new InlineKeyboard();
  anime.forEach(([name], i) => kb.text('🍥 ' + name, 'lib:a:' + i).row());
  kb.text('↩️ الرئيسية', 'home');
  await ctx.reply('🍥 مكتبة الأنمي\nاختر الأنمي:', { reply_markup: kb });
}
async function showAnime(ctx, animeIndex) {
  const anime = entries(readLibrary())[animeIndex];
  if (!anime) return ctx.reply('❌ الأنمي غير موجود.');
  const sections = entries(anime[1].sections);
  if (!sections.length) return ctx.reply('📁 لا توجد أقسام مضافة لهذا الأنمي.');
  const kb = new InlineKeyboard();
  sections.forEach(([name], i) => kb.text('📁 ' + name, 'lib:s:' + animeIndex + ':' + i).row());
  kb.text('↩️ مكتبة الأنمي', 'library:home');
  await ctx.reply('🍥 ' + anime[0] + '\nاختر القسم:', { reply_markup: kb });
}
async function showSection(ctx, animeIndex, sectionIndex) {
  const anime = entries(readLibrary())[animeIndex];
  const section = anime && entries(anime[1].sections)[sectionIndex];
  if (!section) return ctx.reply('❌ القسم غير موجود.');
  const episodes = Array.isArray(section[1]) ? section[1] : [];
  if (!episodes.length) return ctx.reply('🎬 لا توجد حلقات في هذا القسم.');
  const kb = new InlineKeyboard();
  episodes.forEach((episode, i) => kb.text('▶️ الحلقة ' + episode.number, 'lib:e:' + animeIndex + ':' + sectionIndex + ':' + i).row());
  kb.text('↩️ الأقسام', 'lib:a:' + animeIndex);
  await ctx.reply('📺 ' + anime[0] + ' — ' + section[0] + '\nاختر رقم الحلقة:', { reply_markup: kb });
}
async function sendEpisode(ctx, animeIndex, sectionIndex, episodeIndex) {
  const anime = entries(readLibrary())[animeIndex];
  const section = anime && entries(anime[1].sections)[sectionIndex];
  const episode = section && section[1][episodeIndex];
  if (!episode) return ctx.reply('❌ الحلقة غير متاحة.');
  if (!/^https?:\/\//i.test(String(episode.url || ''))) return ctx.reply('⚠️ رابط الحلقة غير صالح أو غير متاح.');
  await ctx.replyWithVideo(episode.url, { caption: '🍥 ' + anime[0] + ' — ' + section[0] + '\n🎬 الحلقة ' + episode.number });
}
async function requestInput(ctx, type, prompt) {
  if (!ownerOnly(ctx)) return ownerDeny(ctx);
  pendingInput.set(ctx.from.id, type);
  await ctx.reply(prompt + '\n\nأرسل البيانات في رسالة واحدة. اكتب /cancel للإلغاء.');
}
async function showAnimeAdmin(ctx) {
  if (!ownerOnly(ctx)) return ownerDeny(ctx);
  await ctx.reply('🍥 إدارة مكتبة الأنمي\nيمكنك إضافة الأنميات والأقسام والحلقات، وتعديل روابط الحلقات.', { reply_markup: animeAdminKeyboard() });
}
async function handleAdminInput(ctx, value) {
  const type = pendingInput.get(ctx.from.id);
  if (!type) return false;
  if (value === '/cancel') {
    pendingInput.delete(ctx.from.id);
    await ctx.reply('تم إلغاء العملية.');
    return true;
  }
  const library = readLibrary();
  const fields = value.split('|').map(x => x.trim());
  if (type === 'anime') {
    const name = value.trim();
    if (!name || name.length > 80) return ctx.reply('❌ اكتب اسم أنمي صحيحًا لا يتجاوز 80 حرفًا.');
    library[name] ||= { sections: {} };
    writeLibrary(library);
    pendingInput.delete(ctx.from.id);
    await ctx.reply('✅ تمت إضافة الأنمي: ' + name, { reply_markup: animeAdminKeyboard() });
    return true;
  }
  if (type === 'section') {
    const [animeName, sectionName] = fields;
    if (!animeName || !sectionName || !library[animeName]) return ctx.reply('❌ الصيغة: اسم الأنمي | اسم القسم\nوتأكد أن الأنمي موجود.');
    library[animeName].sections ||= {};
    library[animeName].sections[sectionName] ||= [];
    writeLibrary(library);
    pendingInput.delete(ctx.from.id);
    await ctx.reply('✅ تمت إضافة القسم ' + sectionName + ' داخل ' + animeName + '.', { reply_markup: animeAdminKeyboard() });
    return true;
  }
  if (type === 'episode' || type === 'edit') {
    const [animeName, sectionName, episodeNo, url] = fields;
    const episodes = library[animeName]?.sections?.[sectionName];
    if (!episodes || !episodeNo || !/^https?:\/\//i.test(url || '')) {
      return ctx.reply('❌ الصيغة: اسم الأنمي | اسم القسم | رقم الحلقة | رابط فيديو مباشر');
    }
    const index = episodes.findIndex(x => String(x.number) === episodeNo);
    const item = { number: episodeNo, url };
    if (index >= 0) episodes[index] = item;
    else if (type === 'episode') episodes.push(item);
    else return ctx.reply('❌ الحلقة غير موجودة. استخدم إضافة حلقة أولًا.');
    episodes.sort((a, b) => Number(a.number) - Number(b.number));
    writeLibrary(library);
    pendingInput.delete(ctx.from.id);
    await ctx.reply('✅ تم ' + (type === 'edit' ? 'تحديث رابط' : 'إضافة') + ' الحلقة ' + episodeNo + '.', { reply_markup: animeAdminKeyboard() });
    return true;
  }
  if (type === 'delete') {
    const name = value.trim();
    if (!library[name]) return ctx.reply('❌ الأنمي غير موجود.');
    delete library[name];
    writeLibrary(library);
    pendingInput.delete(ctx.from.id);
    await ctx.reply('🗑️ تم حذف الأنمي وأقسامه وحلقاته.', { reply_markup: animeAdminKeyboard() });
    return true;
  }
  return false;
}

setPairingNotifier(async (chatId, code) => {
  await bot.api.sendMessage(chatId, '🔐 رمز ربط واتساب:\n\n' + code + '\n\nافتح واتساب ← الأجهزة المرتبطة ← ربط جهاز ← الربط باستخدام رقم الهاتف. أدخل الرمز كما هو. لا تشاركه مع أحد.');
});

bot.command(['start', 'help'], showHome);
bot.command('admin', showAdmin);
bot.command('cancel', async ctx => {
  pendingInput.delete(ctx.from.id);
  waitingForNumber.delete(ctx.from.id);
  await ctx.reply('تم إلغاء العملية.');
});

bot.callbackQuery('home', async ctx => { await ctx.answerCallbackQuery(); await showHome(ctx); });
bot.callbackQuery('library:home', async ctx => { await ctx.answerCallbackQuery(); await showLibrary(ctx); });
bot.callbackQuery(/^lib:a:(\d+)$/, async ctx => { await ctx.answerCallbackQuery(); await showAnime(ctx, Number(ctx.match[1])); });
bot.callbackQuery(/^lib:s:(\d+):(\d+)$/, async ctx => { await ctx.answerCallbackQuery(); await showSection(ctx, Number(ctx.match[1]), Number(ctx.match[2])); });
bot.callbackQuery(/^lib:e:(\d+):(\d+):(\d+)$/, async ctx => {
  await ctx.answerCallbackQuery();
  try { await sendEpisode(ctx, Number(ctx.match[1]), Number(ctx.match[2]), Number(ctx.match[3])); }
  catch (error) { await ctx.reply('❌ تعذر إرسال الحلقة: ' + (error?.message || 'خطأ غير معروف')); }
});

bot.callbackQuery('admin:home', async ctx => { await ctx.answerCallbackQuery(); await showAdmin(ctx); });
bot.callbackQuery('admin:anime', async ctx => { await ctx.answerCallbackQuery(); await showAnimeAdmin(ctx); });
bot.callbackQuery('admin:whatsapp', async ctx => {
  if (!ownerOnly(ctx)) return ownerDeny(ctx);
  await ctx.answerCallbackQuery();
  await ctx.reply('📱 إدارة خدمة الواتساب — الربط والتحكم من هنا فقط:', { reply_markup: whatsappKeyboard() });
});
bot.callbackQuery('admin:general', async ctx => {
  if (!ownerOnly(ctx)) return ownerDeny(ctx);
  await ctx.answerCallbackQuery();
  await ctx.reply('⚙️ الإدارة العامة\n• إدارة المطورين تتم من إعدادات المالك.\n• الكلمات والإيموجيات والملصقات المحظورة تدار من أوامر المطور في واتساب.\n• الجوائز والإحصائيات تعمل تلقائيًا وفق إعدادات الاستضافة.', { reply_markup: adminKeyboard() });
});
bot.callbackQuery('anime:add', async ctx => { await ctx.answerCallbackQuery(); await requestInput(ctx, 'anime', '➕ أرسل اسم الأنمي الجديد.'); });
bot.callbackQuery('anime:section', async ctx => { await ctx.answerCallbackQuery(); await requestInput(ctx, 'section', '📁 أرسل: اسم الأنمي | اسم القسم'); });
bot.callbackQuery('anime:episode', async ctx => { await ctx.answerCallbackQuery(); await requestInput(ctx, 'episode', '🎬 أرسل: اسم الأنمي | اسم القسم | رقم الحلقة | رابط فيديو مباشر'); });
bot.callbackQuery('anime:edit', async ctx => { await ctx.answerCallbackQuery(); await requestInput(ctx, 'edit', '🔗 أرسل: اسم الأنمي | اسم القسم | رقم الحلقة | رابط الفيديو الجديد'); });
bot.callbackQuery('anime:delete', async ctx => { await ctx.answerCallbackQuery(); await requestInput(ctx, 'delete', '🗑️ أرسل اسم الأنمي المراد حذفه.'); });

bot.callbackQuery('wa:pair', async ctx => {
  if (!ownerOnly(ctx)) return ownerDeny(ctx);
  await ctx.answerCallbackQuery();
  waitingForNumber.add(ctx.from.id);
  await ctx.reply('📲 أرسل رقم واتساب بصيغة دولية مع مفتاح الدولة، أرقام فقط. أرسل /cancel للإلغاء.');
});
bot.callbackQuery('wa:status', async ctx => {
  if (!ownerOnly(ctx)) return ownerDeny(ctx);
  await ctx.answerCallbackQuery();
  const s = getStatus();
  await ctx.reply('📊 حالة واتساب: ' + (s.running ? 'يعمل' : 'متوقف') + '\n📱 الرقم: ' + (s.number || 'غير محدد') + '\n🆔 PID: ' + (s.pid || '—'), { reply_markup: whatsappKeyboard() });
});
bot.callbackQuery('wa:logs', async ctx => {
  if (!ownerOnly(ctx)) return ownerDeny(ctx);
  await ctx.answerCallbackQuery();
  const lines = getLogs();
  await ctx.reply('📜 آخر السجلات:\n\n' + (lines.length ? lines.join('\n') : 'لا توجد سجلات.'), { reply_markup: whatsappKeyboard() });
});
bot.callbackQuery('wa:restart', async ctx => {
  if (!ownerOnly(ctx)) return ownerDeny(ctx);
  await ctx.answerCallbackQuery();
  try { await restartWhatsApp(config); await ctx.reply('🔄 تم طلب إعادة تشغيل بوت واتساب.'); }
  catch (err) { await ctx.reply('❌ ' + err.message); }
});
bot.callbackQuery('wa:stop', async ctx => {
  if (!ownerOnly(ctx)) return ownerDeny(ctx);
  await ctx.answerCallbackQuery();
  await ctx.reply(stopWhatsApp() ? '⏹ تم إرسال طلب الإيقاف.' : 'ℹ️ البوت متوقف بالفعل.', { reply_markup: whatsappKeyboard() });
});

bot.on('message:text', async ctx => {
  if (!ownerOnly(ctx)) {
    if (pendingInput.has(ctx.from.id) || waitingForNumber.has(ctx.from.id)) return ownerDeny(ctx);
    return;
  }
  if (pendingInput.has(ctx.from.id)) return handleAdminInput(ctx, ctx.message.text.trim());
  if (!waitingForNumber.has(ctx.from.id)) return;
  const value = ctx.message.text.trim();
  if (!/^\+?[0-9\s()-]{10,22}$/.test(value)) return ctx.reply('❌ الرقم غير صحيح. أرسله مع مفتاح الدولة.');
  waitingForNumber.delete(ctx.from.id);
  try {
    await startWhatsApp(value, ctx.chat.id, config);
    await ctx.reply('⏳ بدأ تشغيل بوت واتساب. سأرسل رمز الربط هنا فور ظهوره.');
  } catch (err) { await ctx.reply('❌ ' + err.message); }
});

bot.catch(err => console.error('Telegram error:', err));
export { bot };
