# WABAM setup

WABAM runs a Telegram bot and a WhatsApp bot from the same Node.js host.

## Deploy
1. Use a host with Node.js 20+, child-process support, and persistent storage.
2. Set `BOT_TOKEN`, `OWNER_TELEGRAM_ID`, `WA_OWNER_NUMBER`, and `WABAM_DATA_DIR` in the host Environment Variables.
3. Run `npm install` and `npm start` from the repository root.
4. Open the Telegram bot and send `/start` for the public anime library.
5. Send `/admin` as the owner to open administration. WhatsApp pairing and process controls are only inside Admin > WhatsApp.
6. Add anime, sections, and episodes using direct video URLs in Admin > Anime.

## Persistent data and WhatsApp session
- WhatsApp authentication is stored below `WABAM_DATA_DIR/whatsapp/auth_info_baileys`.
- WhatsApp database is stored below `WABAM_DATA_DIR/whatsapp/database`.
- Shared anime library is stored below `WABAM_DATA_DIR/shared/anime-library.json`.
- Keep `WABAM_DATA_DIR` on a persistent volume. Do not delete or replace the WhatsApp auth folder during code updates; preserving it normally avoids pairing again.

## Security
- Only `OWNER_TELEGRAM_ID` can open the admin panel or pair/control WhatsApp.
- Never commit `.env`, auth files, database files, logs, tokens, or pairing codes.
- Episode URLs must be direct video links accessible from both Telegram and the WhatsApp host.
