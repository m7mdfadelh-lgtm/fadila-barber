const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function getDayKey(dateString) {
  return dayKeys[new Date(`${dateString}T12:00:00Z`).getUTCDay()];
}

function getScheduleForDate(settings, dateString) {
  const override = (settings?.dateOverrides || []).find((item) => item.date === dateString);
  if (override) return override;
  return settings?.workingHours?.[getDayKey(dateString)];
}

module.exports = { getDayKey, getScheduleForDate };
