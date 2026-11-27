import type { DrawAheadPicture } from "@impower/spark-engine/src/game/modules/assets/classes/messages/DrawAheadMessage";
import type { MorphLayer, MorphPlayback } from "../morph/MorphPlayback";

export interface DrawAheadHost {
  overlay(): HTMLElement | undefined;
  morphs(): MorphPlayback | undefined;
  busy(): boolean;
  seconds(): number;
  box(picture: DrawAheadPicture): string;
  mount(picture: DrawAheadPicture): MorphLayer[];
  unmount(layers: MorphLayer[]): void;
}

export interface DrawAheadReach {
  zoom: number;
  scale: number;
}

const BUSY_RETRY_MS = 100;

const reachKey = (target: string, background: string) => `${target}\n${background}`;

const drawnKey = (picture: DrawAheadPicture) => `${reachKey(picture.target, picture.content.background)}\n${picture.zoom}\n${picture.scale}`;

const moving = (animation: Animation): boolean => {
  if (animation.playState !== "running") return false;
  const end = animation.effect?.getComputedTiming?.().endTime;
  return typeof end === "number" && Number.isFinite(end);
};

export class DrawAhead {
  protected queue: DrawAheadPicture[] = [];
  protected reaches = new Map<string, DrawAheadReach>();
  protected drawn = new Map<string, { keys: string[]; box: string }>();
  protected run = 0;
  protected current?: { picture: DrawAheadPicture; layers: MorphLayer[] };
  protected abort?: { run: number; stopped: Promise<void>; stop: () => void };
  protected unlisten?: () => void;

  constructor(protected host: DrawAheadHost) {}

  receive(pictures: DrawAheadPicture[]) {
    this.halt();
    this.reaches = new Map(pictures.map((picture) => [reachKey(picture.target, picture.content.background), { zoom: picture.zoom, scale: picture.scale }]));
    const listed = new Set(pictures.map(drawnKey));
    for (const key of [...this.drawn.keys()]) if (!listed.has(key)) this.drawn.delete(key);
    this.host.morphs()?.beginForecast();
    const queue = [...pictures].sort((a, b) => a.distance - b.distance);
    if (queue.length === 0) {
      this.host.morphs()?.endForecast();
      return;
    }
    this.start(queue);
  }

  interrupt() {
    if (!this.current) return;
    const queue = [this.current.picture, ...this.queue];
    this.halt();
    this.start(queue);
  }

  protected start(queue: DrawAheadPicture[]) {
    this.queue = queue;
    let stop = () => {};
    const stopped = new Promise<void>((resolve) => (stop = resolve));
    this.abort = { run: this.run, stopped, stop };
    this.listen();
    void this.drawAll(this.run);
  }

  reachOf(target: string, background: string): DrawAheadReach | undefined {
    return this.reaches.get(reachKey(target, background));
  }

  halt() {
    this.run += 1;
    this.queue = [];
    this.abort?.stop();
    this.abort = undefined;
    const morphs = this.host.morphs();
    if (morphs) morphs.recording = undefined;
    if (this.current) {
      this.host.unmount(this.current.layers);
      this.current = undefined;
    }
    this.unlisten?.();
    this.unlisten = undefined;
  }

  dispose() {
    this.halt();
    this.reaches.clear();
    this.drawn.clear();
    this.host.morphs()?.dropForecasts();
  }

  protected listen() {
    const doc = this.host.overlay()?.ownerDocument;
    if (!doc) return;
    const input = () => this.halt();
    const options = { capture: true, passive: true } as const;
    doc.addEventListener("pointerdown", input, options);
    doc.addEventListener("keydown", input, options);
    this.unlisten = () => {
      doc.removeEventListener("pointerdown", input, options);
      doc.removeEventListener("keydown", input, options);
    };
  }

  protected stopped(run: number): Promise<void> {
    return this.abort?.run === run ? this.abort.stopped : Promise.resolve();
  }

  protected timer(ms: number): { done: Promise<void>; cancel: () => void } {
    const view = this.host.overlay()?.ownerDocument.defaultView ?? globalThis;
    let handle: ReturnType<typeof setTimeout> | undefined;
    const done = new Promise<void>((resolve) => (handle = view.setTimeout(resolve, ms)));
    return { done, cancel: () => view.clearTimeout(handle) };
  }

  protected async wait(ms: number, run: number): Promise<void> {
    const timer = this.timer(ms);
    await Promise.race([timer.done, this.stopped(run)]);
    timer.cancel();
  }

  protected async settled(run: number): Promise<boolean> {
    for (;;) {
      if (run !== this.run) return false;
      if (this.host.busy()) {
        await this.wait(BUSY_RETRY_MS, run);
        continue;
      }
      const overlay = this.host.overlay();
      const running = overlay?.getAnimations?.({ subtree: true }).filter(moving) ?? [];
      if (running.length === 0) return true;
      await Promise.race([Promise.all(running.map((animation) => animation.finished.catch(() => undefined))), this.stopped(run)]);
    }
  }

  protected async drawAll(run: number) {
    while (this.queue.length > 0) {
      if (!(await this.settled(run)) || run !== this.run) return;
      const picture = this.queue.shift();
      if (!picture) break;
      const key = drawnKey(picture);
      const box = this.host.box(picture);
      const morphs = this.host.morphs();
      const known = this.drawn.get(key);
      if (known && known.box === box && morphs?.retain(known.keys, picture.distance)) continue;
      const recording = new Set<string>();
      if (morphs) morphs.recording = recording;
      const layers = this.host.mount(picture);
      if (layers.length === 0) {
        if (morphs?.recording === recording) morphs.recording = undefined;
        continue;
      }
      this.current = { picture, layers };
      const seconds = this.host.seconds();
      const timer = seconds > 0 ? this.timer(seconds * 1000) : undefined;
      await Promise.race([
        Promise.all(layers.map((layer) => layer.whenDrawn())),
        this.stopped(run),
        ...(timer ? [timer.done] : []),
      ]);
      timer?.cancel();
      if (run !== this.run) return;
      const finished = layers.every((layer) => layer.drawn);
      this.current = undefined;
      this.host.unmount(layers);
      if (morphs?.recording === recording) morphs.recording = undefined;
      if (finished) this.drawn.set(key, { keys: [...recording], box });
      await this.wait(0, run);
    }
    if (run !== this.run) return;
    this.unlisten?.();
    this.unlisten = undefined;
    this.host.morphs()?.endForecast();
  }
}
