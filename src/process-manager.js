import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = new Map();
const logs = new Map();
const pairingChats = new Map();
let pairingNotifier = async () => {};
let activeConfig = null;

function digits(value) { return String(value || '').replace(/\\D/g, ''); }
function storePath(config = activeConfig) {
  if (!config) throw new Error('إعدادات WABAM غير جاهزة.');
  return path.resolve(config.dataDir, 'whatsapp', 'instances.json');
}
function readStore(config = activeConfig) {
  const file = storePath(config);
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { primaryNumber: digits(value.primaryNumber), instances: value.instances && typeof value.instances === 'object' ? value.instances : {} };
  } catch { return { primaryNumber: '', instances: {} }; }
}
function writeStore(value, config = activeConfig) {
  const file = storePath(config);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}
export function configureWhatsApp(config) { activeConfig = config; }
export function setPairingNotifier(fn) { pairingNotifier = fn; }

function logLine(number, line) {
  const value = String(line).replace(/\\x1b\\[[0-9;]*m/g, '').slice(0, 1600);
  const list = logs.get(number) || [];
  list.push(value);
  if (list.length > 40) list.shift();
  logs.set(number, list);
  console.log('[WhatsApp ' + number + ']', value);
  const match = value.match(/رمز ربط واتساب:\\s*([A-Z0-9-]+)/i);
  const chatId = pairingChats.get(number);
  if (match && chatId) pairingNotifier(chatId, match[1], number).catch(err => console.error(err));
}
function pipeLines(number, stream) {
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    pending += chunk;
    const lines = pending.split(/\\r?\\n/);
    pending = lines.pop() || '';
    lines.forEach(line => logLine(number, line));
  });
  stream.on('end', () => { if (pending) logLine(number, pending); });
}
function isRunning(child) { return Boolean(child && child.exitCode === null && !child.killed); }
async function stopOne(number) {
  const child = children.get(number);
  if (!isRunning(child)) { children.delete(number); return; }
  await new Promise(resolve => {
    const timer = setTimeout(() => {
      if (isRunning(child)) child.kill('SIGKILL');
      resolve();
    }, 7000);
    timer.unref();
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
  children.delete(number);
}
async function spawnOne(number, config) {
  const store = readStore(config);
  const instance = store.instances[number];
  if (!instance || isRunning(children.get(number))) return;
  const role = store.primaryNumber === number ? 'primary' : 'relay';
  const botDir = path.join(root, 'whatsapp-bot');
  const entry = path.join(botDir, 'index.js');
  const dataDir = path.resolve(config.dataDir, 'whatsapp');
  const sharedDir = path.resolve(config.dataDir, 'shared');
  await mkdir(path.join(dataDir, 'instances', number), { recursive: true });
  await mkdir(sharedDir, { recursive: true });
  pairingChats.set(number, instance.chatId || null);
  logs.set(number, []);
  const child = spawn(process.execPath, [entry], {
    cwd: botDir,
    env: {
      ...process.env,
      PAIRING_NUMBER: number,
      INSTANCE_NUMBER: number,
      BOT_ROLE: role,
      PRIMARY_BOT_NUMBER: store.primaryNumber,
      OWNER_NUMBER: config.whatsappOwnerNumber || number,
      DATA_DIR: dataDir,
      MEDIA_DIR: path.join(dataDir, 'anime', 'media'),
      ANIME_LIBRARY_FILE: path.join(sharedDir, 'anime-library.json')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.set(number, child);
  pipeLines(number, child.stdout);
  pipeLines(number, child.stderr);
  child.on('error', err => logLine(number, 'تعذر تشغيل بوت واتساب: ' + err.message));
  child.on('exit', (code, signal) => {
    logLine(number, 'انتهت جلسة واتساب. code=' + code + ', signal=' + signal);
    if (children.get(number) === child) children.delete(number);
  });
  logLine(number, 'بدأ تشغيل الرقم بدور: ' + (role === 'primary' ? 'أساسي' : 'توجيهي'));
}
export function listWhatsAppInstances(config = activeConfig) {
  const store = readStore(config);
  return Object.entries(store.instances).map(([number, item]) => ({
    number,
    primary: store.primaryNumber === number,
    role: store.primaryNumber === number ? 'أساسي' : 'توجيهي',
    running: isRunning(children.get(number)),
    chatId: item?.chatId || null
  }));
}
export function getPrimaryNumber(config = activeConfig) { return readStore(config).primaryNumber; }
export async function startWhatsApp(number, chatId, config = activeConfig) {
  activeConfig = config;
  const value = digits(number);
  if (value.length < 10 || value.length > 15) throw new Error('رقم غير صحيح. أرسله مع مفتاح الدولة.');
  const store = readStore(config);
  if (store.instances[value] && isRunning(children.get(value))) throw new Error('هذا الرقم مرتبط ويعمل بالفعل.');
  store.instances[value] = { ...(store.instances[value] || {}), chatId: chatId || store.instances[value]?.chatId || null, addedAt: store.instances[value]?.addedAt || new Date().toISOString() };
  if (!store.primaryNumber) store.primaryNumber = value;
  writeStore(store, config);
  await spawnOne(value, config);
  return { number: value, primary: store.primaryNumber === value };
}
export async function setPrimaryWhatsApp(number, config = activeConfig) {
  const value = digits(number);
  const store = readStore(config);
  if (!store.instances[value]) throw new Error('الرقم غير موجود ضمن الأرقام المرتبطة.');
  if (store.primaryNumber === value) return listWhatsAppInstances(config);
  store.primaryNumber = value;
  writeStore(store, config);
  const numbers = Object.keys(store.instances);
  await Promise.all(numbers.map(stopOne));
  for (const item of numbers) await spawnOne(item, config);
  return listWhatsAppInstances(config);
}
export function getStatus() {
  const instances = listWhatsAppInstances();
  return { running: instances.some(x => x.running), count: instances.length, primaryNumber: getPrimaryNumber(), instances };
}
export function getLogs(number) {
  if (number) return (logs.get(digits(number)) || []).slice(-20);
  return [...logs.entries()].flatMap(([n, lines]) => lines.slice(-5).map(line => '[' + n + '] ' + line)).slice(-30);
}
export async function stopWhatsApp() {
  const numbers = [...children.keys()];
  await Promise.all(numbers.map(stopOne));
  return numbers.length > 0;
}
export async function restartWhatsApp(config = activeConfig) {
  const store = readStore(config);
  const numbers = Object.keys(store.instances);
  if (!numbers.length) throw new Error('لا توجد أرقام واتساب مرتبطة لإعادة التشغيل.');
  await Promise.all(numbers.map(stopOne));
  for (const number of numbers) await spawnOne(number, config);
  return numbers.length;
}
