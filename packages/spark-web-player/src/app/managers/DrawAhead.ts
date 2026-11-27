import type { DrawAheadPicture } from "@impower/spark-engine/src/game/modules/assets/classes/messages/DrawAheadMessage";
import type { MorphLayer, MorphPlayback } from "../morph/MorphPlayback";

export interface DrawAheadHost {
  overlay(): HTMLElement | undefined;
  morphs(): MorphPlayback | undefined;
  busy(): boolean;
  seconds(): number;
  mount(picture: DrawAheadPicture): MorphLayer[];
  unmount(layers: MorphLayer[]): void;
}

export interface DrawAheadReach {
  zoom: number;
  scale: number;
}

const BUSY_RETRY_MS = 100;

const reachKey = (target: string, background: string) => `${target}\n${background}`;

const moving = (animation: Animation): boolean => {
  if (animation.playState !== "running") return false;
  const end = animation.effect?.getComputedTiming?.().endTime;
  return typeof end === "number" && Number.isFinite(end);
};

export class DrawAhead {
  protected queue: DrawAheadPicture[] = [];
  protected reaches = new Map<string, DrawAheadReach>();
  protected run = 0;
  protected current?: MorphLayer[];
  protected abort?: { run: number; stopped: Promise<void>; stop: () => void };
  protected unlisten?: () => void;

  constructor(protected host: DrawAheadHost) {}

  receive(pictures: DrawAheadPicture[]) {
    this.halt();
    this.reaches = new Map(pictures.map((picture) => [reachKey(picture.target, picture.content.background), { zoom: picture.zoom, scale: picture.scale }]));
    this.host.morphs()?.beginForecast();
    this.queue = [...pictures].sort((a, b) => a.distance - b.distance);
    if (this.queue.length === 0) {
      this.host.morphs()?.endForecast();
      return;
    }
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
    if (this.current) {
      this.host.unmount(this.current);
      this.current = undefined;
    }
    this.unlisten?.();
    this.unlisten = undefined;
  }

  dispose() {
    this.halt();
    this.reaches.clear();
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
      const layers = this.host.mount(picture);
      if (layers.length === 0) continue;
      this.current = layers;
      const seconds = this.host.seconds();
      const timer = seconds > 0 ? this.timer(seconds * 1000) : undefined;
      await Promise.race([
        Promise.all(layers.map((layer) => layer.whenDrawn())),
        this.stopped(run),
        ...(timer ? [timer.done] : []),
      ]);
      timer?.cancel();
      if (run !== this.run) return;
      this.current = undefined;
      this.host.unmount(layers);
      await this.wait(0, run);
    }
    if (run !== this.run) return;
    this.unlisten?.();
    this.unlisten = undefined;
    this.host.morphs()?.endForecast();
  }
}
