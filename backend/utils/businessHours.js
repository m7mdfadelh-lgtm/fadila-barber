const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function getDayKey(dateString) {
  return dayKeys[new Date(`${dateString}T12:00:00Z`).getUTCDay()];
}

function getScheduleForDate(settings, dateString) {
  const overrides = settings?.dateOverrides || [];
  const exactOverride = overrides.find((item) => item.date === dateString);
  if (exactOverride) return exactOverride;
  const rangeOverride = overrides.find((item) => item.startDate && item.endDate && item.startDate <= dateString && dateString <= item.endDate);
  if (rangeOverride) return rangeOverride;
  return settings?.workingHours?.[getDayKey(dateString)];
}

module.exports = { getDayKey, getScheduleForDate };
