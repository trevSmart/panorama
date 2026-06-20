/**
 * Format a duration given in seconds (wait times, KPIs).
 * @param {number} totalSec
 * @param {{ short?: boolean }} [opts] - short omits zero trailing parts
 */
export function formatDurationSec(totalSec, { short = false } = {}) {
  const s = Math.max(0, Math.floor(Number(totalSec) || 0));
  if (s < 60) return `${s}s`;
  if (short) return formatDurationMin(Math.round(s / 60));

  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  if (h >= 24) return formatDays(h * 60 + m);

  if (h > 0) {
    let out = `${h}h`;
    if (m > 0) out += ` ${m}m`;
    if (sec > 0) out += ` ${String(sec).padStart(2, '0')}s`;
    return out;
  }

  return `${m}m ${String(sec).padStart(2, '0')}s`;
}

/** Active work timer: m:ss below 1 hour, human format above. */
export function formatWorkTimer(totalSec) {
  const s = Math.max(0, Math.floor(Number(totalSec) || 0));
  if (s >= 3600) return formatDurationSec(s, { short: true });
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Format a duration given in minutes (login time, work age, etc.). */
export function formatDurationMin(totalMin) {
  const m = Math.max(0, Math.floor(Number(totalMin) || 0));
  if (m < 60) return `${m}m`;
  if (m >= 24 * 60) return formatDays(m);
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

/**
 * Format a duration given in minutes as days + hours + minutes once it reaches
 * a full day. Seconds are dropped at this scale (e.g. 163h -> "6d 19h").
 * @param {number} totalMin
 */
function formatDays(totalMin) {
  const d = Math.floor(totalMin / (24 * 60));
  const h = Math.floor((totalMin % (24 * 60)) / 60);
  const m = totalMin % 60;
  let out = `${d}d`;
  if (h > 0) out += ` ${h}h`;
  if (m > 0) out += ` ${m}m`;
  return out;
}
