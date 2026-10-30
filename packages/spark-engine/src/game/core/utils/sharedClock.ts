export const sharedNow = (): number =>
  performance.timeOrigin + performance.now();

export const BEAT_LEAD_MS = 20;
