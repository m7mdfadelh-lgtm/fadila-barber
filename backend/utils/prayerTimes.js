const { jerusalemDateTimeToUtc } = require('./timeZone');

const PRAYER_LOCATION = Object.freeze({
  latitude: 32.399101,
  longitude: 35.042801,
  timeZone: 'Asia/Jerusalem'
});

// AlAdhan calculation method 3 (Muslim World League), with the standard
// Shafi'i Asr factor. Keep this explicit so the calculation is reproducible.
const CALCULATION_METHOD = 3;
const ASR_SCHOOL = 0;
const BLOCK_BEFORE_MINUTES = 5;
const BLOCK_AFTER_MINUTES = 10;
const ENABLED_PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const ARABIC_PRAYER_NAMES = {
  Fajr: 'الفجر',
  Dhuhr: 'الظهر',
  Asr: 'العصر',
  Maghrib: 'المغرب',
  Isha: 'العشاء'
};
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map();

function parsePrayerTime(value) {
  const match = String(value || '').match(/^(\\d{1,2}):(\\d{2})/);
  if (!match) throw new Error('Invalid prayer time returned by prayer-time provider');
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function buildPrayerBlockedRanges(dateString, timings) {
  return ENABLED_PRAYERS.map((prayer) => {
    const prayerTime = parsePrayerTime(timings[prayer]);
    const prayerInstant = jerusalemDateTimeToUtc(dateString, prayerTime);
    if (Number.isNaN(prayerInstant.getTime())) {
      throw new Error(`Invalid ${prayer} time for ${dateString}`);
    }
    return {
      prayer,
      label: ARABIC_PRAYER_NAMES[prayer],
      prayerTime,
      start: new Date(prayerInstant.getTime() - BLOCK_BEFORE_MINUTES * 60000),
      end: new Date(prayerInstant.getTime() + BLOCK_AFTER_MINUTES * 60000)
    };
  });
}

async function getPrayerBlockedRanges(dateString) {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(dateString))) {
    throw new Error('Invalid date for prayer-time lookup');
  }

  const cached = cache.get(dateString);
  if (cached && cached.expiresAt > Date.now()) return cached.ranges;

  const [year, month, day] = dateString.split('-');
  const providerDate = `${day}-${month}-${year}`;
  const url = new URL(`https://api.aladhan.com/v1/timings/${providerDate}`);
  url.searchParams.set('latitude', String(PRAYER_LOCATION.latitude));
  url.searchParams.set('longitude', String(PRAYER_LOCATION.longitude));
  url.searchParams.set('method', String(CALCULATION_METHOD));
  url.searchParams.set('school', String(ASR_SCHOOL));

  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Prayer-time provider returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.code !== 200 || !payload.data?.timings) {
    throw new Error('Prayer-time provider returned an invalid response');
  }

  const ranges = buildPrayerBlockedRanges(dateString, payload.data.timings);
  cache.set(dateString, { ranges, expiresAt: Date.now() + CACHE_TTL_MS });
  return ranges;
}

function findPrayerConflict(ranges, appointmentStart, appointmentEnd) {
  return ranges.find((range) =>
    appointmentStart < range.end && appointmentEnd > range.start
  ) || null;
}

module.exports = {
  PRAYER_LOCATION,
  BLOCK_BEFORE_MINUTES,
  BLOCK_AFTER_MINUTES,
  ENABLED_PRAYERS,
  buildPrayerBlockedRanges,
  getPrayerBlockedRanges,
  findPrayerConflict
};
