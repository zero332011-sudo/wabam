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
  name: process.env.BOT_NAME || 'WABAM',
  developerId: String(process.env.DEVELOPER_ID || '69033026138303').replace(/\\D/g, ''),
  contactNumber: process.env.CONTACT_NUMBER || '01032219184',
  owner: normalizeEgyptianNumber(process.env.OWNER_NUMBER),
  pairingNumber: normalizeEgyptianNumber(process.env.PAIRING_NUMBER),
  timezone: process.env.TIMEZONE || 'Africa/Cairo',
  prayerCity: process.env.PRAYER_CITY || 'Sohag',
  prayerCityLabel: 'سوهاج',
  prayerCountry: process.env.PRAYER_COUNTRY || 'Egypt',
  prefix: '.'
};

// الرقم 20 هو الإمبراطور، والرقم 1 هو أقل رتبة.
// كل مستويين: نائب ثم القائد.
export const ranks = [
  null,
  'نائب المبتدئ',
  'المبتدئ',
  'نائب النينجا',
  'النينجا',
  'نائب الفارس',
  'الفارس',
  'نائب المحارب',
  'المحارب',
  'نائب الكابتن',
  'الكابتن',
  'نائب الجنرال',
  'الجنرال',
  'نائب القائد',
  'القائد',
  'نائب القائد الأعلى',
  'القائد الأعلى',
  'نائب الإمبراطور المساعد',
  'الإمبراطور المساعد',
  'نائب الإمبراطور',
  'الإمبراطور'
];

export const canPromote = rank => Number(rank) >= 17 && Number(rank) <= 20;
