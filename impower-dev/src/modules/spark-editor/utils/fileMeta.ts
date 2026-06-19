// Pure, dependency-free formatters for the file list's "Modified … | size"
// caption — reimplemented from the legacy engine (impower-config's abbreviateAge
// + impower-storage's getFileSizeDisplayValue) so the display reads identically.

/**
 * Short relative age of `value`: "Now" (<1m), "5m" (<1h), "3h" (<1d), "2d"
 * (<30d), "4mo" (<1y), "2y". Empty string for a missing/invalid date.
 */
export const abbreviateAge = (value: Date | undefined): string => {
  if (!value || Number.isNaN(value.getTime())) {
    return "";
  }
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;
  const year = 365 * day;
  const difference = Date.now() - value.getTime();
  if (difference < minute) {
    return "Now";
  }
  if (difference < hour) {
    return `${Math.round(difference / minute)}m`;
  }
  if (difference < day) {
    return `${Math.round(difference / hour)}h`;
  }
  if (difference < month) {
    return `${Math.round(difference / day)}d`;
  }
  if (difference < year) {
    return `${Math.round(difference / month)}mo`;
  }
  return `${Math.round(difference / year)}y`;
};

/**
 * Human-readable file size: "512 B", "1.5 kB", "211.3 kB", "3.2 MB". Binary
 * thresholds (1024) with decimal-style unit labels, matching the legacy engine.
 * Empty string for a non-finite size.
 */
export const getFileSizeDisplayValue = (
  bytes: number | undefined,
  si = false,
  dp = 1,
): string => {
  if (bytes == null || !Number.isFinite(bytes)) {
    return "";
  }
  const thresh = si ? 1000 : 1024;
  if (Math.abs(bytes) < thresh) {
    return `${bytes} B`;
  }
  const units = ["kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  let u = -1;
  const r = 10 ** dp;
  let value = bytes;
  do {
    value /= thresh;
    u += 1;
  } while (
    Math.round(Math.abs(value) * r) / r >= thresh &&
    u < units.length - 1
  );
  return `${Number(value.toFixed(dp))} ${units[u]}`;
};

/** "Modified Now" / "Modified 5m"; empty string when there's no timestamp. */
export const formatModified = (modified: number | undefined): string => {
  if (!modified) {
    return "";
  }
  const age = abbreviateAge(new Date(modified));
  return age ? `Modified ${age}` : "";
};
