import { Bot, InlineKeyboard } from 'grammy';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { getStatus, getLogs, setPairingNotifier, startWhatsApp, stopWhatsApp, restartWhatsApp } from './process-manager.js';

const bot = new Bot(config.token);
const waitingForNumber = new Set();
const pendingInput = new Map();
const libraryFile = path.resolve(config.dataDir, 'shared', 'anime-library.json');
const whatsappDbFile = path.resolve(config.dataDir, 'whatsapp', 'database', 'data.json');

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
function readWhatsAppDb() {
  try { return JSON.parse(fs.readFileSync(whatsappDbFile, 'utf8')); }
  catch { return null; }
}
function currentWeekKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const p = Object.fromEntries(parts.filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  const start = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 1) % 7));
  return start.toISOString().slice(0, 10);
}
async function showWeeklyStats(ctx) {
  if (!ownerOnly(ctx)) return ownerDeny(ctx);
  const db = readWhatsAppDb();
  if (!db?.messageStats) return ctx.reply('📊 لا توجد قاعدة بيانات إحصائيات واتساب متاحة حاليًا.');
  const week = currentWeekKey();
  const rows = Object.entries(db.messageStats).map(([id, stats]) => {
    const bucket = stats?.weekly?.[week] || { total: 0, members: {} };
    const top = Object.entries(bucket.members || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const label = db.groups?.[id]?.subject || db.groups?.[id]?.name || id.split('@')[0];
    return { label, total: Number(bucket.total || 0), top };
  }).sort((a, b) => b.total - a.total);
  if (!rows.length) return ctx.reply('📊 لا توجد مجموعات مسجلة في الإحصائيات بعد.');
  const message = ['📊 إحصائيات WABAM الأسبوعية', '🗓️ بداية الأسبوع: ' + week, '🏘️ جميع الجروبات المسجلة', '',
    ...rows.map((g, i) => {
      const medal = ['🥇', '🥈', '🥉'][i] || '▫️';
      const members = g.top.length ? g.top.map((x, n) => '   ' + (n + 1) + ') ' + x[0].split('@')[0] + ' — ' + x[1]).join('\n') : '   لا يوجد نشاط مسجل';
      return medal + ' ' + g.label + '\n   💬 الرسائل: ' + g.total + '\n' + members;
    })
  ].join('\n');
  for (let i = 0; i < message.length; i += 3500) await ctx.reply(message.slice(i, i + 3500));
}
function getEpisodes(section) {
  if (Array.isArray(section)) return section;
  return Array.isArray(section?.episodes) ? section.episodes : [];
}
function normalizeSection(section) {
  if (Array.isArray(section)) return { image: null, episodes: section };
  return { ...(section || {}), image: section?.image || null, episodes: getEpisodes(section) };
}
function extractTelegramMedia(message) {
  if (message?.photo?.length) {
    const photo = message.photo[message.photo.length - 1];
    return { type: 'photo', fileId: photo.file_id, fileUniqueId: photo.file_unique_id };
  }
  for (const type of ['video', 'document', 'audio', 'animation', 'voice']) {
    const item = message?.[type];
    if (item?.file_id) return { type, fileId: item.file_id, fileUniqueId: item.file_unique_id, mimeType: item.mime_type || '', fileName: item.file_name || '' };
  }
  return null;
}
async function sendTelegramMedia(ctx, media, caption) {
  if (!media?.fileId) throw new Error('ملف الوسائط غير موجود.');
  if (media.type === 'photo') return ctx.replyWithPhoto(media.fileId, { caption });
  if (media.type === 'video') return ctx.replyWithVideo(media.fileId, { caption });
  if (media.type === 'animation') return ctx.replyWithAnimation(media.fileId, { caption });
  if (media.type === 'voice') return ctx.replyWithVoice(media.fileId, { caption });
  if (media.type === 'audio') return ctx.replyWithAudio(media.fileId, { caption });
  return ctx.replyWithDocument(media.fileId, { caption });
}
const ownerOnly = ctx => ctx.from?.id === config.ownerId;
const mainKeyboard = () => new InlineKeyboard()
  .text('🍥 مكتبة الأنمي', 'library:home').row()
  .text('⚙️ لوحة الإدارة', 'admin:home');
const adminKeyboard = () => new InlineKeyboard()
  .text('1️⃣ إدارة الأنمي', 'admin:anime').row()
  .text('2️⃣ إدارة الواتساب', 'admin:whatsapp').row()
  .text('📊 إحصائيات الأسبوع لكل الجروبات', 'admin:weekly').row()
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
  .text('🎬 إضافة حلقة', 'anime:episode').row()
  .text('🗑️ حذف أنمي', 'anime:delete').row()
  .text('↩️ لوحة الإدارة', 'admin:home');
function animePicker(prefix) {
  const anime = entries(readLibrary());
  const kb = new InlineKeyboard();
  anime.forEach(([name], i) => kb.text('🍥 ' + name, prefix + i).row());
  kb.text('↩️ إدارة الأنمي', 'admin:anime');
  return { anime, keyboard: kb };
}
const ownerDeny = async ctx => {
  if (ctx.callbackQuery) {
    try { await ctx.answerCallbackQuery({ text: 'هذه الوظيفة للمالك فقط.' }); } catch {}
  }
  await ctx.reply('⛔ هذه الوظيفة للمالك فقط.');
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
  const caption = '🍥 ' + anime[0] + '\nاختر القسم:';
  if (anime[1].image?.fileId) return ctx.replyWithPhoto(anime[1].image.fileId, { caption, reply_markup: kb });
  return ctx.reply(caption, { reply_markup: kb });
}
async function showSection(ctx, animeIndex, sectionIndex) {
  const anime = entries(readLibrary())[animeIndex];
  const section = anime && entries(anime[1].sections)[sectionIndex];
  if (!section) return ctx.reply('❌ القسم غير موجود.');
  const data = normalizeSection(section[1]);
  if (!data.episodes.length) return ctx.reply('🎬 لا توجد حلقات في هذا القسم.');
  const kb = new InlineKeyboard();
  data.episodes.forEach((episode, i) => kb.text('▶️ الحلقة ' + episode.number, 'lib:e:' + animeIndex + ':' + sectionIndex + ':' + i).row());
  kb.text('↩️ الأقسام', 'lib:a:' + animeIndex);
  const caption = '📺 ' + anime[0] + ' — ' + section[0] + '\nاختر رقم الحلقة:';
  if (data.image?.fileId) return ctx.replyWithPhoto(data.image.fileId, { caption, reply_markup: kb });
  return ctx.reply(caption, { reply_markup: kb });
}
async function sendEpisode(ctx, animeIndex, sectionIndex, episodeIndex) {
  const anime = entries(readLibrary())[animeIndex];
  const section = anime && entries(anime[1].sections)[sectionIndex];
  const data = section && normalizeSection(section[1]);
  const episode = data && data.episodes[episodeIndex];
  if (!episode) return ctx.reply('❌ الحلقة غير متاحة.');
  const caption = '🍥 ' + anime[0] + ' — ' + section[0] + '\n🎬 الحلقة ' + episode.number;
  if (episode.media?.fileId) return sendTelegramMedia(ctx, episode.media, caption);
  if (/^https?:\/\//i.test(String(episode.url || ''))) return ctx.replyWithVideo(episode.url, { caption });
  return ctx.reply('⚠️ الحلقة لا تحتوي على ملف وسائط.');
}
async function requestInput(ctx, type, prompt) {
  if (!ownerOnly(ctx)) return ownerDeny(ctx);
  pendingInput.set(ctx.from.id, { step: type });
  await ctx.reply(prompt + '\n\nأرسل البيانات في رسالة واحدة. اكتب /cancel للإلغاء.');
}
async function showAnimeAdmin(ctx) {
  if (!ownerOnly(ctx)) return ownerDeny(ctx);
  await ctx.reply('🍥 إدارة مكتبة الأنمي\nكل أنمي وقسم له صورة، والحلقات تُحفظ كوسائط فعلية وليس كرابط.', { reply_markup: animeAdminKeyboard() });
}
async function handleAdminInput(ctx, value) {
  const state = pendingInput.get(ctx.from.id);
  if (!state) return false;
  if (value === '/cancel') {
    pendingInput.delete(ctx.from.id);
    await ctx.reply('↩️ تم إلغاء العملية.');
    return true;
  }
  const library = readLibrary();
  const fields = value.split('|').map(x => x.trim());
  if (state.step === 'anime-name') {
    const name = value.trim();
    if (!name || name.length > 80) return ctx.reply('❌ اكتب اسم أنمي صحيحًا لا يتجاوز 80 حرفًا.');
    pendingInput.set(ctx.from.id, { step: 'anime-photo', name });
    return ctx.reply('🖼️ صورة الأنمي اختيارية. ابعتها الآن أو اضغط تخطي.', {
      reply_markup: new InlineKeyboard().text('⏭️ تخطي الصورة', 'anime:skip-photo')
    });
  }
  if (state.step === 'section-name') {
    const sectionName = value.trim();
    if (!sectionName || sectionName.length > 80) return ctx.reply('❌ اكتب اسم قسم صحيحًا لا يتجاوز 80 حرفًا.');
    pendingInput.set(ctx.from.id, { step: 'section-photo', animeName: state.animeName, sectionName });
    return ctx.reply('🖼️ صورة القسم اختيارية. ابعتها الآن أو اضغط تخطي.', {
      reply_markup: new InlineKeyboard().text('⏭️ تخطي الصورة', 'anime:skip-section-photo')
    });
  }
  if (state.step === 'episode-number') {
    const episodeNo = value.trim();
    if (!/^\d{1,5}$/.test(episodeNo)) return ctx.reply('❌ اكتب رقم الحلقة بالأرقام فقط.');
    pendingInput.set(ctx.from.id, { step: 'episode-media', animeName: state.animeName, sectionName: state.sectionName, episodeNo });
    return ctx.reply('🎬 ابعت ملف الحلقة الآن: فيديو أو صورة أو صوت أو مستند.');
  }
  if (state.step === 'section-details') {
    const [animeName, sectionName] = fields;
    if (!animeName || !sectionName || !library[animeName]) return ctx.reply('❌ الصيغة: اسم الأنمي | اسم القسم، وتأكد أن الأنمي موجود.');
    pendingInput.set(ctx.from.id, { step: 'section-photo', animeName, sectionName });
    return ctx.reply('🖼️ ابعت صورة القسم الآن.');
  }
  if (state.step === 'episode-details') {
    const [animeName, sectionName, episodeNo] = fields;
    const section = library[animeName]?.sections?.[sectionName];
    if (!section || !episodeNo) return ctx.reply('❌ الصيغة: اسم الأنمي | اسم القسم | رقم الحلقة، وتأكد من وجود القسم.');
    pendingInput.set(ctx.from.id, { step: 'episode-media', animeName, sectionName, episodeNo });
    return ctx.reply('🎬 ابعت ملف الحلقة الآن: فيديو أو صورة أو صوت أو مستند.');
  }
  if (state.step === 'delete') {
    const name = value.trim();
    if (!library[name]) return ctx.reply('❌ الأنمي غير موجود.');
    delete library[name];
    writeLibrary(library);
    pendingInput.delete(ctx.from.id);
    return ctx.reply('🗑️ تم حذف الأنمي وأقسامه وحلقاته.', { reply_markup: animeAdminKeyboard() });
  }
  return false;
}
async function handleAdminMedia(ctx) {
  const state = pendingInput.get(ctx.from.id);
  if (!state) return false;
  const media = extractTelegramMedia(ctx.message);
  if (!media) return ctx.reply('⚠️ ابعت صورة أو فيديو أو ملف وسائط مدعوم.');
  const library = readLibrary();
  if (state.step === 'anime-photo') {
    library[state.name] ||= { sections: {} };
    library[state.name].image = media;
    library[state.name].sections ||= {};
    writeLibrary(library);
    pendingInput.delete(ctx.from.id);
    return ctx.reply('✅ تمت إضافة الأنمي وصورته: ' + state.name, { reply_markup: animeAdminKeyboard() });
  }
  if (state.step === 'section-photo') {
    const anime = library[state.animeName];
    if (!anime) return ctx.reply('❌ الأنمي لم يعد موجودًا.');
    anime.sections ||= {};
    const section = normalizeSection(anime.sections[state.sectionName]);
    section.image = media;
    anime.sections[state.sectionName] = section;
    writeLibrary(library);
    pendingInput.delete(ctx.from.id);
    return ctx.reply('✅ تمت إضافة القسم وصورته: ' + state.sectionName, { reply_markup: animeAdminKeyboard() });
  }
  if (state.step === 'episode-media') {
    const anime = library[state.animeName];
    const section = anime && normalizeSection(anime.sections?.[state.sectionName]);
    if (!section) return ctx.reply('❌ القسم لم يعد موجودًا.');
    const episode = { number: state.episodeNo, media };
    const index = section.episodes.findIndex(item => String(item.number) === String(state.episodeNo));
    if (index >= 0) section.episodes[index] = episode;
    else section.episodes.push(episode);
    section.episodes.sort((a, b) => Number(a.number) - Number(b.number));
    anime.sections[state.sectionName] = section;
    writeLibrary(library);
    pendingInput.delete(ctx.from.id);
    return ctx.reply('✅ تم حفظ الحلقة ' + state.episodeNo + ' كوسائط فعلية.', { reply_markup: animeAdminKeyboard() });
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
bot.callbackQuery('admin:weekly', async ctx => { await ctx.answerCallbackQuery(); await showWeeklyStats(ctx); });
bot.callbackQuery('admin:general', async ctx => {
  if (!ownerOnly(ctx)) return ownerDeny(ctx);
  await ctx.answerCallbackQuery();
  await ctx.reply('⚙️ الإدارة العامة\n• إدارة المطورين تتم من إعدادات المالك.\n• الكلمات والإيموجيات والملصقات المحظورة تدار من أوامر المطور في واتساب.\n• الجوائز والإحصائيات تعمل تلقائيًا وفق إعدادات الاستضافة.', { reply_markup: adminKeyboard() });
});
bot.callbackQuery('anime:add', async ctx => { await ctx.answerCallbackQuery(); await requestInput(ctx, 'anime-name', '➕ اكتب اسم الأنمي الجديد.'); });
bot.callbackQuery('anime:section', async ctx => {
  await ctx.answerCallbackQuery();
  const picker = animePicker('anime:section:pick:');
  if (!picker.anime.length) return ctx.reply('لا توجد أنميات بعد. أضف أنمي أولًا.', { reply_markup: picker.keyboard });
  await ctx.reply('📁 اختر الأنمي الذي تريد إضافة القسم بداخله:', { reply_markup: picker.keyboard });
});
bot.callbackQuery(/^anime:section:pick:(\d+)$/, async ctx => {
  if (!ownerOnly(ctx)) return ownerDeny(ctx);
  await ctx.answerCallbackQuery();
  const item = entries(readLibrary())[Number(ctx.match[1])];
  if (!item) return ctx.reply('❌ الأنمي غير موجود.');
  pendingInput.set(ctx.from.id, { step: 'section-name', animeName: item[0] });
  await ctx.reply('📁 اكتب اسم القسم الجديد داخل: ' + item[0]);
});
bot.callbackQuery('anime:episode', async ctx => {
  await ctx.answerCallbackQuery();
  const picker = animePicker('anime:episode:anime:');
  if (!picker.anime.length) return ctx.reply('لا توجد أنميات بعد. أضف أنمي وقسمًا أولًا.', { reply_markup: picker.keyboard });
  await ctx.reply('🎬 اختر الأنمي:', { reply_markup: picker.keyboard });
});
bot.callbackQuery(/^anime:episode:anime:(\d+)$/, async ctx => {
  if (!ownerOnly(ctx)) return ownerDeny(ctx);
  await ctx.answerCallbackQuery();
  const anime = entries(readLibrary())[Number(ctx.match[1])];
  if (!anime) return ctx.reply('❌ الأنمي غير موجود.');
  const sections = entries(anime[1].sections);
  if (!sections.length) return ctx.reply('📁 هذا الأنمي ليس لديه أقسام بعد.');
  const kb = new InlineKeyboard();
  sections.forEach(([name], i) => kb.text('📁 ' + name, 'anime:episode:section:' + ctx.match[1] + ':' + i).row());
  kb.text('↩️ إدارة الأنمي', 'admin:anime');
  await ctx.reply('📁 اختر القسم:', { reply_markup: kb });
});
bot.callbackQuery(/^anime:episode:section:(\d+):(\d+)$/, async ctx => {
  if (!ownerOnly(ctx)) return ownerDeny(ctx);
  await ctx.answerCallbackQuery();
  const anime = entries(readLibrary())[Number(ctx.match[1])];
  const section = anime && entries(anime[1].sections)[Number(ctx.match[2])];
  if (!section) return ctx.reply('❌ القسم غير موجود.');
  pendingInput.set(ctx.from.id, { step: 'episode-number', animeName: anime[0], sectionName: section[0] });
  await ctx.reply('🔢 اكتب رقم الحلقة التي تريد إضافتها إلى ' + anime[0] + ' — ' + section[0]);
});
bot.callbackQuery('anime:skip-photo', async ctx => {
  if (!ownerOnly(ctx)) return ownerDeny(ctx);
  await ctx.answerCallbackQuery();
  const state = pendingInput.get(ctx.from.id);
  if (state?.step !== 'anime-photo') return ctx.reply('لا توجد صورة مطلوبة حاليًا.');
  const library = readLibrary();
  library[state.name] ||= { sections: {} };
  library[state.name].sections ||= {};
  writeLibrary(library);
  pendingInput.delete(ctx.from.id);
  await ctx.reply('✅ تمت إضافة الأنمي بدون صورة: ' + state.name, { reply_markup: animeAdminKeyboard() });
});
bot.callbackQuery('anime:skip-section-photo', async ctx => {
  if (!ownerOnly(ctx)) return ownerDeny(ctx);
  await ctx.answerCallbackQuery();
  const state = pendingInput.get(ctx.from.id);
  if (state?.step !== 'section-photo') return ctx.reply('لا توجد صورة مطلوبة حاليًا.');
  const library = readLibrary();
  const anime = library[state.animeName];
  if (!anime) return ctx.reply('❌ الأنمي لم يعد موجودًا.');
  anime.sections ||= {};
  const section = normalizeSection(anime.sections[state.sectionName]);
  section.image = null;
  anime.sections[state.sectionName] = section;
  writeLibrary(library);
  pendingInput.delete(ctx.from.id);
  await ctx.reply('✅ تمت إضافة القسم بدون صورة: ' + state.sectionName, { reply_markup: animeAdminKeyboard() });
});

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

bot.on('message', async ctx => {
  if (!ownerOnly(ctx)) {
    if (pendingInput.has(ctx.from.id) || waitingForNumber.has(ctx.from.id)) return ownerDeny(ctx);
    return;
  }
  if (pendingInput.has(ctx.from.id)) {
    const state = pendingInput.get(ctx.from.id);
    if (['anime-photo', 'section-photo', 'episode-media'].includes(state.step)) return handleAdminMedia(ctx);
    if (ctx.message.text) return handleAdminInput(ctx, ctx.message.text.trim());
    return ctx.reply('⚠️ أرسل البيانات النصية أو الوسائط المطلوبة حسب الخطوة الحالية.');
  }
  if (!waitingForNumber.has(ctx.from.id)) return;
  const value = ctx.message.text?.trim() || '';
  if (!/^\+?[0-9\s()-]{10,22}$/.test(value)) return ctx.reply('❌ الرقم غير صحيح. أرسله مع مفتاح الدولة.');
  waitingForNumber.delete(ctx.from.id);
  try {
    await startWhatsApp(value, ctx.chat.id, config);
    await ctx.reply('⏳ بدأ تشغيل بوت واتساب. سأرسل رمز الربط هنا فور ظهوره.');
  } catch (err) { await ctx.reply('❌ ' + err.message); }
});

bot.catch(err => console.error('Telegram error:', err));
export { bot };
