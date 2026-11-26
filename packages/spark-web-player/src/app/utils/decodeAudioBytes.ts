import {
  finishOggOpus,
  isOggOpus,
  type FinishedOpus,
  type OpusAnswer,
} from "./opusFallback";
import OPUS_FALLBACK_WORKER_SOURCE from "./opusFallback.worker";

const OPUS_RATE = 48000;
const COPY_STEP_SAMPLES = 1 << 18;
const WORKER_ANSWER_DEADLINE_MS = 15_000;
const WORKER_IDLE_RETIREMENT_MS = 30_000;

interface PendingDecode {
  resolve: (finished: FinishedOpus) => void;
  reject: (reason: unknown) => void;
  deadline: ReturnType<typeof setTimeout>;
}

interface FallbackWorker {
  worker: Worker;
  pending: Map<number, PendingDecode>;
  queue: Promise<unknown>;
  waiting: number;
  idle?: ReturnType<typeof setTimeout>;
}

let fallbackWorker: FallbackWorker | undefined;
let workerUnavailable = false;
let nextRequest = 0;

const abandonWorker = (reason: unknown) => {
  workerUnavailable = true;
  const abandoned = fallbackWorker;
  fallbackWorker = undefined;
  if (!abandoned) {
    return;
  }
  clearTimeout(abandoned.idle);
  abandoned.worker.terminate();
  for (const { reject, deadline } of abandoned.pending.values()) {
    clearTimeout(deadline);
    reject(reason);
  }
  abandoned.pending.clear();
};

const retireWhenIdle = (current: FallbackWorker) => {
  clearTimeout(current.idle);
  if (current.waiting > 0 || fallbackWorker !== current) {
    return;
  }
  current.idle = setTimeout(() => {
    if (current.waiting === 0 && fallbackWorker === current) {
      fallbackWorker = undefined;
      current.worker.terminate();
    }
  }, WORKER_IDLE_RETIREMENT_MS);
};

const startWorker = (): FallbackWorker | undefined => {
  if (fallbackWorker || workerUnavailable) {
    return fallbackWorker;
  }
  if (
    !OPUS_FALLBACK_WORKER_SOURCE ||
    typeof Worker !== "function" ||
    typeof Blob !== "function" ||
    typeof URL?.createObjectURL !== "function"
  ) {
    workerUnavailable = true;
    return undefined;
  }
  const url = URL.createObjectURL(
    new Blob([OPUS_FALLBACK_WORKER_SOURCE], { type: "text/javascript" }),
  );
  let worker: Worker;
  try {
    worker = new Worker(url);
  } catch {
    workerUnavailable = true;
    return undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
  const current: FallbackWorker = {
    worker,
    pending: new Map(),
    queue: Promise.resolve(),
    waiting: 0,
  };
  worker.onerror = (event: ErrorEvent) =>
    abandonWorker(event.error ?? new Error("Opus decoder worker failed"));
  worker.onmessageerror = () =>
    abandonWorker(new Error("Opus decoder worker could not read a message"));
  worker.onmessage = ({ data }: MessageEvent<OpusAnswer>) => {
    const request = current.pending.get(data.id);
    if (!request) {
      return;
    }
    current.pending.delete(data.id);
    clearTimeout(request.deadline);
    if ("failed" in data) {
      request.reject(new Error(data.failed));
    } else {
      request.resolve(data);
    }
  };
  fallbackWorker = current;
  return current;
};

const finishInWorker = (current: FallbackWorker, bytes: Uint8Array) => {
  clearTimeout(current.idle);
  current.waiting++;
  const turn = current.queue.then(
    () =>
      new Promise<FinishedOpus>((resolve, reject) => {
        if (fallbackWorker !== current) {
          reject(new Error("Opus decoder worker was abandoned"));
          return;
        }
        const id = nextRequest++;
        const deadline = setTimeout(
          () => abandonWorker(new Error("Opus decoder worker did not answer")),
          WORKER_ANSWER_DEADLINE_MS,
        );
        current.pending.set(id, { resolve, reject, deadline });
        current.worker.postMessage({ id, bytes: bytes.buffer });
      }),
  );
  current.queue = turn.catch(() => undefined);
  return turn.finally(() => {
    current.waiting--;
    retireWhenIdle(current);
  });
};

const finishOffThisThread = async (bytes: Uint8Array): Promise<FinishedOpus> => {
  const current = startWorker();
  if (current) {
    try {
      return await finishInWorker(current, bytes);
    } catch {
      return finishOggOpus(bytes);
    }
  }
  return finishOggOpus(bytes);
};

const nextTask = (): Promise<void> => {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } })
    .scheduler;
  if (typeof scheduler?.yield === "function") {
    return scheduler.yield();
  }
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => {
      port1.close();
      resolve();
    };
    port2.postMessage(null);
  });
};

const fillBuffer = async (
  context: BaseAudioContext,
  channels: Float32Array[],
): Promise<AudioBuffer> => {
  const length = channels[0]!.length;
  const buffer = context.createBuffer(channels.length, length, OPUS_RATE);
  let first = true;
  for (let channel = 0; channel < channels.length; channel++) {
    for (let start = 0; start < length; start += COPY_STEP_SAMPLES) {
      if (!first) {
        await nextTask();
      }
      first = false;
      buffer.copyToChannel(
        channels[channel]!.subarray(start, start + COPY_STEP_SAMPLES) as Float32Array<ArrayBuffer>,
        channel,
        start,
      );
    }
  }
  return buffer;
};

export const decodeAudioBytes = async (
  context: BaseAudioContext,
  bytes: ArrayBuffer,
): Promise<AudioBuffer> => {
  const opus = isOggOpus(new Uint8Array(bytes))
    ? new Uint8Array(bytes.slice(0))
    : null;
  try {
    return await context.decodeAudioData(bytes);
  } catch (error) {
    if (!opus) {
      throw error;
    }
    const finished = await finishOffThisThread(opus);
    if (finished.links === 0) {
      throw error;
    }
    if (finished.channels.length === 0) {
      throw new DOMException("Unable to decode audio data", "EncodingError");
    }
    return fillBuffer(context, finished.channels);
  }
};
