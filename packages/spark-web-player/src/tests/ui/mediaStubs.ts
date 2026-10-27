// Stand-ins for what jsdom lacks for the page's movies: media playback and
// Web Audio.

/** jsdom loads and plays no media: a stand-in that records what the page
 *  asked of each element, and keeps the state a browser would report. */
export function stubMedia(overlay: HTMLElement) {
  const win = overlay.ownerDocument.defaultView as any;
  const proto = win.HTMLMediaElement.prototype;
  const calls: { method: string; el: HTMLVideoElement }[] = [];
  const define = (name: string, get: (el: any) => unknown, set?: (el: any, v: any) => void) =>
    Object.defineProperty(proto, name, {
      configurable: true,
      get() {
        return get(this);
      },
      set: set
        ? function (this: any, v: any) {
            set(this, v);
          }
        : undefined,
    });
  define("paused", (el) => el.__paused ?? true);
  define("ended", (el) => el.__ended ?? false);
  define("duration", (el) => el.__duration ?? NaN);
  // A browser keeps a position within the movie it knows: no earlier than
  // its start, and no later than its duration once it has one.
  define(
    "currentTime",
    (el) => el.__time ?? 0,
    (el, v) => {
      const d = el.__duration;
      const end = Number.isFinite(d) && d > 0 ? d : Infinity;
      el.__time = Math.min(Math.max(0, v), end);
    },
  );
  proto.play = function (this: any) {
    calls.push({ method: "play", el: this });
    this.__paused = false;
    return Promise.resolve();
  };
  proto.pause = function (this: any) {
    calls.push({ method: "pause", el: this });
    this.__paused = true;
  };
  proto.load = function (this: any) {
    calls.push({ method: "load", el: this });
  };
  return {
    calls,
    of: (el: Element | null | undefined, method: string) =>
      calls.filter((c) => c.el === el && c.method === method).length,
  };
}

/** An audio graph that records what is built and connected: jsdom has no
 *  Web Audio. */
export function fakeAudioContext() {
  const node = (kind: string, extra: Record<string, unknown> = {}) => {
    const n: any = {
      kind,
      outputs: [] as unknown[],
      connect(to: unknown) {
        n.outputs.push(to);
        return to;
      },
      disconnect() {
        n.outputs.length = 0;
      },
      ...extra,
    };
    return n;
  };
  const sources: any[] = [];
  const context: any = {
    state: "running",
    currentTime: 0,
    destination: node("destination"),
    createGain: () => node("gain", { gain: { value: 1 } }),
    createAnalyser: () => node("analyser", { fftSize: 0 }),
    createMediaElementSource: (mediaElement: HTMLMediaElement) => {
      if (sources.some((s) => s.mediaElement === mediaElement)) {
        // As a browser does: an element has one source for its whole life.
        throw new Error("InvalidStateError: already connected");
      }
      const source = node("media", { mediaElement, context });
      sources.push(source);
      return source;
    },
  };
  return { context, sources };
}
