import type { BeatParams } from "@impower/spark-engine/src/game/modules/ui/classes/messages/BeatMessage";

export interface BeatEntries {
  received: string;
  ready: string;
  fired: string;
  wait: string;
  receivedAt: number;
}

const scriptName = (uri: string): string => {
  const last = uri.split(/[\\/]/).pop() || uri;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
};

const timeline = (): Performance | undefined =>
  typeof performance !== "undefined" &&
  typeof performance.mark === "function" &&
  typeof performance.measure === "function"
    ? performance
    : undefined;

const markAt = (perf: Performance, name: string): number =>
  perf.mark(name)?.startTime ?? perf.now();

export class BeatMarks {
  protected _count = 0;

  protected _beats = new WeakMap<BeatParams, BeatEntries>();

  protected _fired: BeatEntries[] = [];

  received(params: BeatParams): void {
    const source = params.source;
    const perf = timeline();
    if (!source || !perf) {
      return;
    }
    this._count += 1;
    const label = `${scriptName(source.uri)}:${source.range.start.line + 1} #${this._count}`;
    const received = `beat received ${label}`;
    this._beats.set(params, {
      received,
      ready: `beat ready ${label}`,
      fired: `beat fired ${label}`,
      wait: `beat wait ${label}`,
      receivedAt: markAt(perf, received),
    });
  }

  ready(params: BeatParams): void {
    const entries = this._beats.get(params);
    const perf = timeline();
    if (entries && perf) {
      perf.mark(entries.ready);
    }
  }

  fired(params: BeatParams): void {
    const entries = this._beats.get(params);
    const perf = timeline();
    if (!entries || !perf) {
      return;
    }
    this._beats.delete(params);
    const end = markAt(perf, entries.fired);
    perf.measure(entries.wait, { start: entries.receivedAt, end });
    this.clear();
    this._fired.push(entries);
  }

  dropped(params: BeatParams): void {
    const entries = this._beats.get(params);
    if (entries) {
      this._beats.delete(params);
      this.forget(entries);
    }
  }

  clear(): void {
    for (const passed of this._fired.splice(0)) {
      this.forget(passed);
    }
  }

  protected forget(entries: BeatEntries): void {
    const perf = timeline();
    if (!perf) {
      return;
    }
    perf.clearMarks(entries.received);
    perf.clearMarks(entries.ready);
    perf.clearMarks(entries.fired);
    perf.clearMeasures(entries.wait);
  }
}
