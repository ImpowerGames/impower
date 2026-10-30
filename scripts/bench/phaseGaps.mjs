export function uncovered(window, covered) {
  const gaps = [];
  let at = window[0];
  for (const [start, end] of [...covered].sort((a, b) => a[0] - b[0])) {
    if (end <= at) continue;
    if (start >= window[1]) break;
    if (start > at) gaps.push([at, start]);
    at = Math.max(at, end);
  }
  if (at < window[1]) gaps.push([at, window[1]]);
  return gaps;
}

export const totalLength = (intervals) => intervals.reduce((sum, [start, end]) => sum + (end - start), 0);

export function within(intervals, t) {
  let lo = 0;
  let hi = intervals.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t < intervals[mid][0]) hi = mid - 1;
    else if (t >= intervals[mid][1]) lo = mid + 1;
    else return true;
  }
  return false;
}
