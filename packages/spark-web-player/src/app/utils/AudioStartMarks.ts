const PLAY_STARTED = "play started";

const timeline = (): Performance | undefined =>
  typeof performance !== "undefined" &&
  typeof performance.mark === "function" &&
  typeof performance.measure === "function" &&
  typeof performance.clearMarks === "function" &&
  typeof performance.clearMeasures === "function"
    ? performance
    : undefined;

let started = new Map<string, number>();
let playStartedAt: number | undefined;

const clearSound = (perf: Performance, sound: string) => {
  perf.clearMarks(`audio started ${sound}`);
  perf.clearMeasures(`play to audio ${sound}`);
};

const forget = (perf: Performance) => {
  for (const sound of started.keys()) {
    clearSound(perf, sound);
  }
  perf.clearMarks(PLAY_STARTED);
  started = new Map();
};

export const markPlayStarted = (): void => {
  const perf = timeline();
  if (!perf) {
    return;
  }
  forget(perf);
  playStartedAt = perf.mark(PLAY_STARTED)?.startTime ?? perf.now();
};

export const markAudioStarted = (sound: string, delayMs: number): void => {
  const perf = timeline();
  if (!perf) {
    return;
  }
  const at = perf.now() + Math.max(0, delayMs);
  const earlier = started.get(sound);
  if (earlier !== undefined && earlier <= at) {
    return;
  }
  if (earlier !== undefined) {
    clearSound(perf, sound);
  }
  started.set(sound, at);
  perf.mark(`audio started ${sound}`, { startTime: at });
  if (playStartedAt !== undefined && playStartedAt <= at) {
    perf.measure(`play to audio ${sound}`, { start: playStartedAt, end: at });
  }
};
