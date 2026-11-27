import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';
import path from 'node:path';
import 'dotenv/config';
import { messageHandler } from './handlers/messageHandler.js';
import { config } from './config/settings.js';
import { startPrayerSystem } from './system/prayer.js';
import { startCommunityAwards } from './system/communityAwards.js';

const PAIRING_DELAY_MS = 5_000;
const PAIRING_RETRY_DELAY_MS = 10_000;
const MAX_PAIRING_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 30_000;

let starting = false;
let prayerStarted = false;
let stopCommunityAwards = null;

async function startBot() {
  if (starting) return;
  starting = true;

  try {
    const phoneNumber = String(config.pairingNumber || '').replace(/\D/g, '');
    if (!phoneNumber || phoneNumber.length < 10) {
      throw new Error('رقم الربط غير مضبوط. أضف PAIRING_NUMBER في متغيرات الاستضافة بصيغة دولية وأرقام فقط.');
    }

    const dataRoot = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || '.';
    const authDir = path.join(dataRoot, 'auth_info_baileys');
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'warn' }),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 30_000
    });

    let pairingCodeRequested = false;
    let pairingInProgress = false;
    let pairingAttempts = 0;
    let socketClosed = false;

    const requestPairingCode = async () => {
      if (socketClosed || state.creds.registered || pairingCodeRequested || pairingInProgress) return;
      if (pairingAttempts >= MAX_PAIRING_ATTEMPTS) {
        console.error('❌ لم ينجح طلب رمز الربط بعد عدة محاولات. أعد تشغيل الخدمة بعد التأكد من الرقم والاتصال.');
        return;
      }
      pairingInProgress = true;
      pairingAttempts++;
      try {
        console.log(`📲 محاولة طلب رمز الربط ${pairingAttempts}/${MAX_PAIRING_ATTEMPTS}...`);
        console.log('📞 رقم واتساب: +' + phoneNumber);
        await new Promise(resolve => setTimeout(resolve, PAIRING_DELAY_MS));
        if (socketClosed || state.creds.registered) return;
        const pairingCode = await sock.requestPairingCode(phoneNumber);
        pairingCodeRequested = true;
        console.log('\n========================================');
        console.log('🔐 رمز ربط واتساب: ' + pairingCode);
        console.log('افتح واتساب > الأجهزة المرتبطة > ربط جهاز > الربط باستخدام رقم الهاتف.');
        console.log('أدخل الرمز الظاهر هنا كما هو.');
        console.log('⚠️ الرمز مؤقت وسري، ولا تشاركه مع أي شخص.');
        console.log('========================================\n');
      } catch (error) {
        console.error('❌ فشل طلب رمز الربط:', {
          message: error?.message,
          statusCode: error?.output?.statusCode
        });
        if (!socketClosed && !state.creds.registered && pairingAttempts < MAX_PAIRING_ATTEMPTS) {
          setTimeout(() => requestPairingCode().catch(err => console.error('Pairing retry:', err?.message || err)), PAIRING_RETRY_DELAY_MS);
        }
      } finally {
        pairingInProgress = false;
      }
    };

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('messages.upsert', update => {
      messageHandler(sock, update).catch(error => {
        console.error('خطأ في معالجة الرسالة:', error?.stack || error);
      });
    });

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      console.log('حالة اتصال واتساب:', connection || (qr ? 'QR/جاهز لطلب الرمز' : 'تحديث'));
      if ((connection === 'connecting' || qr) && !state.creds.registered) {
        requestPairingCode().catch(error => console.error('Pairing code:', error?.message || error));
      }

      if (connection === 'open') {
        starting = false;
        console.log('✅ تم الاتصال بواتساب بنجاح');
        if (!prayerStarted) {
          prayerStarted = true;
          startPrayerSystem(sock);
        }
        if (!stopCommunityAwards) stopCommunityAwards = startCommunityAwards(sock);
      }

      if (connection === 'close') {
        socketClosed = true;
        starting = false;
        prayerStarted = false;
        if (stopCommunityAwards) {
          stopCommunityAwards();
          stopCommunityAwards = null;
        }
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.error('⚠️ اتصال واتساب اتقفل:', {
          statusCode,
          message: lastDisconnect?.error?.message || 'لا توجد تفاصيل إضافية'
        });
        if (statusCode !== DisconnectReason.loggedOut) {
          console.log('🔁 ستتم محاولة الاتصال من جديد بعد 30 ثانية...');
          setTimeout(() => {
            startBot().catch(error => {
              starting = false;
              console.error('فشل إعادة الاتصال:', error?.stack || error);
            });
          }, RECONNECT_DELAY_MS);
        } else {
          console.error('❌ تم تسجيل الخروج من واتساب. لا تحذف ملفات الجلسة إلا إذا تأكدت أنها تالفة؛ أعد ربط الجهاز من جديد عند الحاجة.');
        }
      }
    });

    console.log(state.creds.registered
      ? '🔄 جلسة واتساب محفوظة؛ جاري الاتصال...'
      : '⏳ جاري الاتصال بواتساب لطلب رمز الربط...');
  } catch (error) {
    starting = false;
    console.error('❌ تعذر تشغيل البوت:', error?.stack || error);
    throw error;
  }
}

startBot().catch(error => {
  console.error('توقف تشغيل البوت:', error);
  process.exitCode = 1;
});
