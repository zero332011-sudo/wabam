import 'dotenv/config';

const digits = value => String(value || '').replace(/\D/g, '');

function normalizeEgyptianNumber(value) {
  let number = digits(value);
  if (!number) return '';
  if (number.startsWith('0020')) number = number.slice(2);
  else if (number.startsWith('0')) number = '20' + number.slice(1);
  else if (!number.startsWith('20')) number = '20' + number;
  return number;
}

export const config = {
  name: process.env.BOT_NAME || 'Anime Bot',
  owner: normalizeEgyptianNumber(process.env.OWNER_NUMBER),
  pairingNumber: normalizeEgyptianNumber(process.env.PAIRING_NUMBER),
  timezone: process.env.TIMEZONE || 'Africa/Cairo',
  prayerCity: process.env.PRAYER_CITY || 'Sohag',
  prayerCountry: process.env.PRAYER_COUNTRY || 'Egypt',
  prefix: '.'
};

export const ranks = [
  'الإمبراطور','نائب الإمبراطور','الإمبراطور الأعلى','الإمبراطور الأعظم',
  'الإمبراطور الأسطوري','الإمبراطور الملكي','الإمبراطور الذهبي','الأسطورة',
  'الملك','الأمير','القائد','الجنرال','المحارب','الفارس','النخبة','المحترف','الخبير','المبتدئ'
];
