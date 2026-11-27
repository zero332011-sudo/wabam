import { spawn } from 'node:child_process';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let child = null;
let lastNumber = '';
let chatIdForCode = null;
let logs = [];
let pairingNotifier = async () => {};

function logLine(line) {
  const value = String(line).replace(/\x1b\[[0-9;]*m/g, '').slice(0, 1600);
  logs.push(value);
  if (logs.length > 80) logs.shift();
  console.log('[WhatsApp]', value);
  const match = value.match(/رمز ربط واتساب:\s*([A-Z0-9-]+)/i);
  if (match && chatIdForCode) pairingNotifier(chatIdForCode, match[1]).catch(err => console.error(err));
}

function pipeLines(stream) {
  let pending = '';
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || '';
    lines.forEach(logLine);
  });
  stream.on('end', () => { if (pending) logLine(pending); });
}

export function setPairingNotifier(fn) { pairingNotifier = fn; }
export function getStatus() {
  return { running: Boolean(child && child.exitCode === null), pid: child?.pid || null, number: lastNumber };
}
export function getLogs() { return logs.slice(-20); }

export async function startWhatsApp(number, chatId, config) {
  if (child && child.exitCode === null) throw new Error('بوت واتساب يعمل بالفعل.');
  const digits = String(number).replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) throw new Error('رقم غير صحيح. أرسله مع مفتاح الدولة.');
  const botDir = path.join(root, 'whatsapp-bot');
  const entry = path.join(botDir, 'index.js');
  const dataDir = path.resolve(config.dataDir, 'whatsapp');
  await mkdir(dataDir, { recursive: true });
  lastNumber = digits;
  chatIdForCode = chatId;
  logs = [];
  child = spawn(process.execPath, [entry], {
    cwd: botDir,
    env: {
      ...process.env,
      PAIRING_NUMBER: digits,
      OWNER_NUMBER: config.whatsappOwnerNumber || digits,
      DATA_DIR: dataDir,
      MEDIA_DIR: path.join(dataDir, 'anime', 'media')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  pipeLines(child.stdout);
  pipeLines(child.stderr);
  child.on('error', err => logLine('تعذر تشغيل بوت واتساب: ' + err.message));
  child.on('exit', (code, signal) => {
    logLine('انتهى بوت واتساب. code=' + code + ', signal=' + signal);
    child = null;
  });
  logLine('تم بدء عملية واتساب. انتظر رمز الربط.');
}

export function stopWhatsApp() {
  if (!child || child.exitCode !== null) { child = null; return false; }
  const running = child;
  running.kill('SIGTERM');
  const timer = setTimeout(() => { if (running.exitCode === null) running.kill('SIGKILL'); }, 7000);
  timer.unref();
  return true;
}

export async function restartWhatsApp(config) {
  if (!lastNumber) throw new Error('لا يوجد رقم واتساب محفوظ لإعادة التشغيل.');
  const number = lastNumber;
  const chatId = chatIdForCode;
  if (child && child.exitCode === null) {
    const running = child;
    await new Promise(resolve => {
      const timer = setTimeout(() => {
        if (running.exitCode === null) running.kill('SIGKILL');
        resolve();
      }, 7000);
      timer.unref();
      running.once('exit', () => { clearTimeout(timer); resolve(); });
      running.kill('SIGTERM');
    });
  }
  await startWhatsApp(number, chatId, config);
}
