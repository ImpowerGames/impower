const SERVER_EPOCH = new Date(2021, 1, 1);

/**
 * Calculate age of a post relative to oldest possible post on the server.
 *
 * @param date The date the post was created
 * @param unit The unit that the result should be returned in (e.g. s = seconds, m = minutes, H = hours, D = days, W = weeks, M = months)
 * @param round Should the result be rounded to the nearest integer?
 * @param epoch The date of the oldest possible post. (This date must match the epoch specified on the server)
 *
 * @returns Age since server epoch in specified unit. (If round is true, result will be rounded).
 */
const getAge = (
  date: Date,
  unit: "ms" | "s" | "m" | "h" | "d" | "w" | "mo" | "yr" = "ms",
  round?: boolean,
  epoch = SERVER_EPOCH
): number => {
  const ms = date.getTime() - epoch.getTime();
  const s = ms / 1000; // 1s = 1000 ms
  if (unit === "s") {
    return round ? Math.trunc(s) : s;
  }
  const m = s / 60; // 1m = 60s
  if (unit === "m") {
    return round ? Math.trunc(m) : m;
  }
  const h = m / 60; // 1H = 60m
  if (unit === "h") {
    return round ? Math.trunc(h) : h;
  }
  const d = h / 24; // 1D = 24H
  if (unit === "d") {
    return round ? Math.trunc(d) : d;
  }
  const w = d / 7; // 1W = 7D
  if (unit === "w") {
    return round ? Math.trunc(w) : w;
  }
  const mo = w / 5; // 1M = ~5W (rounded up)
  if (unit === "mo") {
    return round ? Math.trunc(mo) : mo;
  }
  const yr = mo / 12; // 1yr = ~12M
  if (unit === "yr") {
    return round ? Math.trunc(yr) : yr;
  }
  return round ? Math.trunc(ms) : ms;
};

export default getAge;
