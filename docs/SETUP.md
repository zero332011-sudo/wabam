# WABAM setup

WABAM is a Telegram control panel that runs the WhatsApp Anime Bot on the same host.

## Deploy
1. Use a host with Node.js 20+, child-process support, and persistent storage.
2. Set BOT_TOKEN (from BotFather), OWNER_TELEGRAM_ID (your numeric Telegram ID), WA_OWNER_NUMBER (developer WhatsApp number), and WABAM_DATA_DIR (persistent mount path such as /data).
3. Run `npm install` and `npm start`.
4. Open the Telegram bot and send `/start`.
5. Tap the pairing button, send the WhatsApp number in international format, and wait for the pairing code in Telegram.
6. In WhatsApp, open Linked devices > Link a device > Link with phone number and enter the code.

## Security
- Only OWNER_TELEGRAM_ID can use WABAM.
- WhatsApp session files live in WABAM_DATA_DIR and must never be committed.
- Never publish .env, auth_info_baileys, database files, logs, or tokens.
- Use persistent storage or the WhatsApp session will be lost when the host is replaced.
- Keep the Telegram bot private and do not share pairing codes.
