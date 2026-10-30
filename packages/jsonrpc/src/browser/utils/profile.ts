const pending = new Map<string, number[]>();

const MAX_PENDING_PER_NAME = 32;
const MAX_PENDING_NAMES = 256;

const pushStart = (name: string, at: number) => {
  const starts = pending.get(name);
  if (!starts) {
    if (pending.size >= MAX_PENDING_NAMES) {
      const oldest = pending.keys().next().value;
      if (oldest !== undefined) {
        pending.delete(oldest);
      }
    }
    pending.set(name, [at]);
    return;
  }
  starts.push(at);
  if (starts.length > MAX_PENDING_PER_NAME) {
    starts.shift();
  }
};

const takeStart = (name: string) => {
  const starts = pending.get(name);
  if (!starts || starts.length === 0) {
    return undefined;
  }
  const at = starts.pop();
  if (starts.length === 0) {
    pending.delete(name);
  }
  return at;
};

let retainEntries = false;

export const setRetainProfilerEntries = (retain: boolean) => {
  retainEntries = retain;
};

export const profilePhase = (mark: "start" | "end", name: string) => {
  if (mark !== "end") {
    const startMark = `${name} start`;
    performance.mark(startMark);
    if (!retainEntries) {
      performance.clearMarks(startMark);
    }
    pushStart(name, performance.now());
    return;
  }
  const end = performance.now();
  const endMark = `${name} end`;
  performance.mark(endMark);
  if (!retainEntries) {
    performance.clearMarks(endMark);
  }
  const start = takeStart(name);
  if (start === undefined) {
    return;
  }
  performance.measure(name, { start, end });
  if (!retainEntries) {
    performance.clearMeasures(name);
  }
};

export const profile = (
  mark: "start" | "end",
  profilerId: string | undefined,
  method: string,
) => {
  if (!profilerId) {
    return;
  }
  profilePhase(mark, `${profilerId} ${method}`);
};
