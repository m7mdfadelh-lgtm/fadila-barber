const BUSINESS_TIME_ZONE = 'Asia/Jerusalem';

function getTimeZoneOffsetMs(date, timeZone = BUSINESS_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
  );

  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );

  return asUtc - date.getTime();
}

function jerusalemDateTimeToUtc(dateString, timeString) {
  const [year, month, day] = String(dateString).split('-').map(Number);
  const [hour, minute] = String(timeString).split(':').map(Number);

  if (![year, month, day, hour, minute].every(Number.isFinite)) {
    return new Date(NaN);
  }

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  let offset = getTimeZoneOffsetMs(utcGuess);
  let result = new Date(utcGuess.getTime() - offset);

  // Recalculate once to handle daylight-saving transitions correctly.
  const correctedOffset = getTimeZoneOffsetMs(result);
  if (correctedOffset !== offset) {
    result = new Date(utcGuess.getTime() - correctedOffset);
  }

  return result;
}

function getJerusalemDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function getAppointmentInstant(appointment) {
  const dateString = getJerusalemDateString(new Date(appointment.date));
  return jerusalemDateTimeToUtc(dateString, appointment.time);
}

function formatJerusalemDate(date) {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

module.exports = {
  BUSINESS_TIME_ZONE,
  jerusalemDateTimeToUtc,
  getJerusalemDateString,
  getAppointmentInstant,
  formatJerusalemDate
};