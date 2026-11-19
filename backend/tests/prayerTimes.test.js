const test = require('node:test');
const assert = require('node:assert/strict');
const { jerusalemDateTimeToUtc } = require('../utils/timeZone');
const {
  buildPrayerBlockedRanges,
  findPrayerConflict,
  BLOCK_BEFORE_MINUTES,
  BLOCK_AFTER_MINUTES,
  ENABLED_PRAYERS
} = require('../utils/prayerTimes');

test('builds five prayer blocks with the configured margins', () => {
  const timings = {
    Fajr: '05:00 (IST)',
    Dhuhr: '12:00 (IST)',
    Asr: '15:00 (IST)',
    Maghrib: '17:00 (IST)',
    Isha: '18:30 (IST)'
  };
  const date = '2026-11-19';
  const ranges = buildPrayerBlockedRanges(date, timings);
  assert.equal(ranges.length, 5);
  assert.deepEqual(ranges.map((range) => range.prayer), ENABLED_PRAYERS);

  const dhuhr = ranges.find((range) => range.prayer === 'Dhuhr');
  const prayerInstant = jerusalemDateTimeToUtc(date, '12:00');
  assert.equal(dhuhr.start.getTime(), prayerInstant.getTime() - BLOCK_BEFORE_MINUTES * 60000);
  assert.equal(dhuhr.end.getTime(), prayerInstant.getTime() + BLOCK_AFTER_MINUTES * 60000);
});

test('detects a service that overlaps a prayer block, including its service duration', () => {
  const date = '2026-11-19';
  const ranges = buildPrayerBlockedRanges(date, {
    Fajr: '05:00', Dhuhr: '12:00', Asr: '15:00', Maghrib: '17:00', Isha: '18:30'
  });
  const start = jerusalemDateTimeToUtc(date, '11:50');
  const end = new Date(start.getTime() + 30 * 60000);
  assert.equal(findPrayerConflict(ranges, start, end).prayer, 'Dhuhr');
});

test('allows an appointment fully outside prayer blocks', () => {
  const date = '2026-11-19';
  const ranges = buildPrayerBlockedRanges(date, {
    Fajr: '05:00', Dhuhr: '12:00', Asr: '15:00', Maghrib: '17:00', Isha: '18:30'
  });
  const start = jerusalemDateTimeToUtc(date, '13:00');
  const end = new Date(start.getTime() + 30 * 60000);
  assert.equal(findPrayerConflict(ranges, start, end), null);
});
