import 'dotenv/config';

const token = process.env.BOT_TOKEN?.trim();
const ownerId = Number(process.env.OWNER_TELEGRAM_ID);
if (!token) throw new Error('BOT_TOKEN is missing.');
if (!Number.isSafeInteger(ownerId) || ownerId <= 0) throw new Error('OWNER_TELEGRAM_ID is missing or invalid.');

export const config = {
  token,
  ownerId,
  dataDir: process.env.WABAM_DATA_DIR || './data',
  whatsappOwnerNumber: String(process.env.WA_OWNER_NUMBER || '').replace(/\\D/g, '')
};
