# Deployment checklist

- [ ] Node.js 20 or newer
- [ ] Persistent volume mounted and WABAM_DATA_DIR points to it
- [ ] BOT_TOKEN configured
- [ ] OWNER_TELEGRAM_ID configured
- [ ] WA_OWNER_NUMBER configured if the developer number differs from the linked number
- [ ] npm install completed from repository root
- [ ] npm run check passes
- [ ] Telegram bot responds to /start
- [ ] Pairing code is delivered only to the configured owner
