import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import {
  type SceneAssets,
  type SceneBeat,
} from "@impower/sparkdown/src/compiler/types/SceneAssets";
import { Module } from "../../../core/classes/Module";
import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import { type LoadInstruction } from "../../../core/types/Instruction";
import { type Instructions } from "../../../core/types/Instructions";
import { getTimeValue } from "../../../core/utils/getTimeValue";
import {
  assetsBuiltinDefinitions,
  type AssetsBuiltins,
  type AssetsConfig,
} from "../assetsBuiltinDefinitions";
import { assetItemKey, type AssetItem } from "../types/AssetItem";
import { type LoadAssetsResult } from "../types/LoadAssetsResult";
import { beatIndexIn, previewWindow } from "../utils/previewWindow";
import { AssetsProgressMessage } from "./messages/AssetsProgressMessage";
import { ConfigureAssetsMessage } from "./messages/ConfigureAssetsMessage";
import {
  LoadAssetsMessage,
  type LoadAssetsMessageMap,
} from "./messages/LoadAssetsMessage";
import { PrefetchAssetsMessage } from "./messages/PrefetchAssetsMessage";
import { ReleaseAssetsMessage } from "./messages/ReleaseAssetsMessage";

export interface AssetsState {}

export type AssetsMessageMap = LoadAssetsMessageMap;

const MEGABYTE = 1024 * 1024;

const MAX_PREDICTED_FLOWS = 16;

const EMPTY_RESULT: LoadAssetsResult = { loaded: [], failed: [], pinned: [] };

export class AssetModule extends Module<
  AssetsState,
  AssetsMessageMap,
  AssetsBuiltins
> {
  protected _loadPins = new Set<string>();

  protected _layoutPins = new Set<string>();

  protected _retiringPins = new Set<string>();

  protected _retiredLayouts = 0;

  protected _pendingBeatPins = new Set<string>();

  protected _restorePending = false;

  protected _previewGates = 0;

  protected _previewPins = new Set<string>();

  protected _abandonedPins = new Set<string>();

  protected _fontNamesByLayout = new Map<string, string[]>();

  protected _previewWindow: { flow: string; index: number } | null = null;

  protected _progress = new Map<
    string,
    { loaded: number; failed: number; total: number }
  >();

  protected _activeLoadPins: string[] | null = null;

  protected _warned = new Set<string>();

  protected _beatIndex?: {
    program: object;
    byFlow: Map<string, Map<ProgramAddress, number>>;
  };

  protected _destroyed = false;

  override getBuiltins() {
    return assetsBuiltinDefinitions();
  }

  override getStored() {
    return [];
  }

  get config(): AssetsConfig {
    const defaults = assetsBuiltinDefinitions().config.assets;
    const authored = (this.context.config?.["assets"] ?? {}) as Partial<
      Record<keyof AssetsConfig, unknown>
    >;
    const count = (key: keyof AssetsConfig, fallback: number) => {
      const v = authored[key];
      return typeof v === "number" && Number.isFinite(v) && v >= 0
        ? v
        : fallback;
    };
    const seconds = (key: keyof AssetsConfig, fallback: number) => {
      const v = authored[key];
      const parsed =
        typeof v === "number" || typeof v === "string"
          ? getTimeValue(v)
          : undefined;
      return parsed != null && Number.isFinite(parsed) && parsed >= 0
        ? parsed
        : fallback;
    };
    const transition = authored["loading_transition"];
    return {
      predict_distance: count("predict_distance", defaults.predict_distance),
      predict_cache_size: count(
        "predict_cache_size",
        defaults.predict_cache_size,
      ),
      load_cache_size: count("load_cache_size", defaults.load_cache_size),
      load_distance: count("load_distance", defaults.load_distance),
      beat_timeout: seconds("beat_timeout", defaults.beat_timeout),
      restore_timeout: seconds("restore_timeout", defaults.restore_timeout),
      load_timeout: seconds("load_timeout", defaults.load_timeout),
      loading_min: seconds("loading_min", defaults.loading_min),
      loading_transition:
        typeof transition === "string" && transition
          ? transition
          : defaults.loading_transition,
    };
  }

  protected get silent(): boolean {
    return (
      this._destroyed ||
      this._game.simulation === "simulating" ||
      Boolean(this.context.system.simulating)
    );
  }

  protected get previewing(): boolean {
    return Boolean(this.context.system.previewing);
  }

  protected get timed(): boolean {
    return !this.previewing;
  }

  protected get anchorAddress(): ProgramAddress | null | undefined {
    const previewing = this.context.system.previewing;
    return typeof previewing === "number"
      ? previewing
      : this._game.executingAddress;
  }

  protected previewAnchorIn(scene: string): ProgramAddress | undefined {
    const anchor = this.anchorAddress;
    return anchor != null && this._game.sceneOf(anchor) === scene
      ? anchor
      : undefined;
  }

  resolveImageItems(names: Iterable<string>): AssetItem[] {
    const items: AssetItem[] = [];
    const seen = new Set<string>();
    const ui = this._game.module.ui;
    const videos = (this.context as Record<string, any>)?.["video"];
    for (const name of names) {
      if (!name || name === "none") {
        continue;
      }
      const srcs = ui.getImageSrcsByName(name);
      if (srcs) {
        for (const src of srcs) {
          if (
            typeof src === "string" &&
            src &&
            !src.startsWith("data:") &&
            !seen.has(src)
          ) {
            seen.add(src);
            items.push({ kind: "image", src });
          }
        }
        continue;
      }
      const src = videos?.[name]?.src;
      if (typeof src === "string" && src && !seen.has(src)) {
        seen.add(src);
        items.push({ kind: "video", src });
      }
    }
    return items;
  }

  resolveAudioItems(names: Iterable<string>): AssetItem[] {
    const items: AssetItem[] = [];
    const seen = new Set<string>();
    const list = [...names].filter((n) => n && n !== "none");
    if (list.length === 0) {
      return items;
    }
    for (const params of this._game.module.audio.resolveLoadParams(
      "sound",
      list,
    )) {
      if (params.synth || !params.src || seen.has(params.key)) {
        continue;
      }
      seen.add(params.key);
      items.push({ kind: "audio", params });
    }
    return items;
  }

  resolveFontItems(layoutNames: Iterable<string>): AssetItem[] {
    const items: AssetItem[] = [];
    const seen = new Set<string>();
    const fonts = (this.context as Record<string, any>)?.["font"];
    if (!fonts) {
      return items;
    }
    const ui = this._game.module.ui;
    for (const layoutName of layoutNames) {
      let fontNames = this._fontNamesByLayout.get(layoutName);
      if (!fontNames) {
        fontNames = ui.getFontNamesForLayout(layoutName);
        this._fontNamesByLayout.set(layoutName, fontNames);
      }
      for (const fontName of fontNames) {
        const font = fonts[fontName];
        const src = font?.src;
        const family = font?.font_family || fontName;
        if (typeof src !== "string" || !src || typeof family !== "string") {
          continue;
        }
        const item: AssetItem = {
          kind: "font",
          src,
          family,
          weight: font.font_weight || undefined,
          style: font.font_style || undefined,
          stretch: font.font_stretch || undefined,
          display: font.font_display || undefined,
          unicodeRange: font.unicode_range || undefined,
        };
        const key = assetItemKey(item);
        if (!seen.has(key)) {
          seen.add(key);
          items.push(item);
        }
      }
    }
    return items;
  }

  protected itemsForBeats(beats: Iterable<SceneBeat>): AssetItem[] {
    const images: string[] = [];
    const layouts: string[] = [];
    const audios: string[] = [];
    for (const beat of beats) {
      if (beat.image) {
        images.push(...beat.image);
      }
      if (beat.layouts) {
        layouts.push(...beat.layouts);
      }
      if (beat.audio) {
        audios.push(...beat.audio);
      }
    }
    const timed = this.timed;
    const items = [
      ...this.resolveImageItems(images),
      ...this.resolveFontItems(layouts),
      ...(timed ? this.resolveAudioItems(audios) : []),
    ];
    const seen = new Set<string>();
    return items.filter((item) => {
      if (!timed && item.kind === "video") {
        return false;
      }
      const key = assetItemKey(item);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  protected request(
    items: AssetItem[],
    priority: 0 | 1,
    pin: string,
  ): Promise<LoadAssetsResult> {
    if (items.length === 0 || this._destroyed) {
      return Promise.resolve(EMPTY_RESULT);
    }
    return this.emit(LoadAssetsMessage.type.request({ items, priority, pin }));
  }

  protected releaseAbandoned(pins?: string[]): void {
    const going = (pins ?? [...this._abandonedPins]).filter((pin) =>
      this._abandonedPins.delete(pin),
    );
    if (going.length > 0) {
      this.release(going, false);
    }
  }

  releaseAbandonedGates(): void {
    this.releaseAbandoned();
  }

  protected prefetch(items: AssetItem[], priority: 2 | 3): void {
    if (items.length === 0 || this._destroyed) {
      return;
    }
    this.emit(PrefetchAssetsMessage.type.notification({ items, priority }));
  }

  protected release(pins: string[], drop: boolean): void {
    if (pins.length === 0 || this._destroyed) {
      return;
    }
    for (const pin of pins) {
      this._progress.delete(pin);
    }
    this.emit(ReleaseAssetsMessage.type.notification({ pins, drop }));
  }

  protected warnOnce(key: string, message: string): void {
    if (this._warned.has(key)) {
      return;
    }
    this._warned.add(key);
    console.warn(`spark-engine: ${message}`);
  }

  protected ensureResident(
    items: AssetItem[],
    priority: 0 | 1,
    pin: string,
    timeoutSeconds: number,
    what: string,
    wanted: () => boolean = () => true,
  ): Promise<{ timedOut: boolean; result: LoadAssetsResult | null }> {
    if (items.length === 0 || this._destroyed) {
      return Promise.resolve({ timedOut: false, result: EMPTY_RESULT });
    }
    return new Promise((resolve) => {
      let settled = false;
      this.request(items, priority, pin).then(
        (result) => {
          if (settled) {
            return;
          }
          settled = true;
          if (result.failed.length > 0) {
            this.warnOnce(
              `failed:${result.failed.join(",")}`,
              `${what}: could not load ${result.failed.join(", ")}`,
            );
          }
          resolve({ timedOut: false, result });
        },
        () => {
          if (settled) {
            return;
          }
          settled = true;
          resolve({ timedOut: false, result: null });
        },
      );
      if (timeoutSeconds > 0) {
        this.context.system.setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          if (!this._destroyed && wanted()) {
            console.warn(
              `spark-engine: ${what} timed out after ${timeoutSeconds}s waiting for ${items
                .map(assetItemKey)
                .join(", ")}`,
            );
          }
          resolve({ timedOut: true, result: null });
        }, timeoutSeconds * 1000);
      }
    });
  }

  protected imageNamesOf(instructions: Instructions): string[] {
    const names: string[] =
      this._game.module.ui.clearedPictureNames(instructions);
    for (const events of Object.values(instructions.image ?? {})) {
      for (const event of events) {
        if (event.control !== "hide" && event.assets?.length) {
          names.push(...event.assets);
        }
      }
    }
    if (this.timed) {
      for (const cutscene of instructions.cutscene ?? []) {
        names.push(cutscene.name);
      }
    }
    return names;
  }

  prepareBeat(instructions: Instructions): number | null {
    if (this.silent) {
      return null;
    }
    const names = this.imageNamesOf(instructions);
    const items = this.resolveImageItems(names);
    if (items.length === 0) {
      this.releaseAbandoned();
      return null;
    }
    const id = this.nextTriggerId();
    const pin = `beat:${id}`;
    this._pendingBeatPins.add(pin);
    this.ensureResident(
      items,
      0,
      pin,
      this.config.beat_timeout,
      "a line's images",
    ).then(() => {
      this.enableTrigger(id);
    });
    this.releaseAbandoned();
    return id;
  }

  prepareLayout(name: string): Promise<void> | undefined {
    if (this.silent || !name) {
      return undefined;
    }
    const items = this.resolveFontItems([name]);
    if (items.length === 0) {
      return undefined;
    }
    this._layoutPins.add(name);
    return this.ensureResident(
      items,
      0,
      `layout:${name}`,
      this.config.restore_timeout,
      `layout "${name}" fonts`,
    ).then(() => undefined);
  }

  releaseLayout(name: string): void {
    if (this._layoutPins.delete(name)) {
      this.release([`layout:${name}`], false);
    }
  }

  retireLayout(name: string): string | undefined {
    if (!this._layoutPins.delete(name)) {
      return undefined;
    }
    this._retiredLayouts += 1;
    const pin = `layout:${name}:retiring:${this._retiredLayouts}`;
    this._retiringPins.add(pin);
    void this.request(this.resolveFontItems([name]), 0, pin).catch(() => {});
    this.release([`layout:${name}`], false);
    return pin;
  }

  releaseRetiredLayout(pin: string): void {
    if (this._retiringPins.delete(pin)) {
      this.release([pin], false);
    }
  }

  notice(kind: "image" | "audio", names: string[]): void {
    if (this.silent || names.length === 0) {
      return;
    }
    if (kind === "image") {
      if (this._game.holdingFlush) {
        return;
      }
      const items = this.resolveImageItems(names).filter(
        (item) => this.timed || item.kind !== "video",
      );
      this.prefetch(items, 2);
    } else if (this.timed) {
      this.prefetch(this.resolveAudioItems(names), 2);
    }
  }

  protected beatIndexFor(
    flow: string,
    address: ProgramAddress | null | undefined,
  ): number {
    if (address == null) {
      return -1;
    }
    const program = this._game.program;
    if (!this._beatIndex || this._beatIndex.program !== program) {
      this._beatIndex = { program, byFlow: new Map() };
    }
    let byAddress = this._beatIndex.byFlow.get(flow);
    const beats = program.sceneAssets?.[flow]?.beats ?? [];
    if (!byAddress) {
      byAddress = new Map();
      beats.forEach((beat, index) => byAddress!.set(beat.address, index));
      this._beatIndex.byFlow.set(flow, byAddress);
    }
    const exact = byAddress.get(address);
    if (exact != null) {
      return exact;
    }
    return beatIndexIn(beats, this._game.locator, address);
  }

  protected predictFrom(
    flow: string,
    address: ProgramAddress | null | undefined,
    inclusive: boolean,
  ): void {
    const sceneAssets = this._game.program.sceneAssets;
    const entry = sceneAssets?.[flow];
    if (!sceneAssets || !entry) {
      return;
    }
    const distance = this.config.predict_distance;
    const start = this.beatIndexFor(flow, address) + (inclusive ? 0 : 1);
    let remaining = distance === 0 ? Number.POSITIVE_INFINITY : distance;
    const primary: SceneBeat[] = [];
    for (let i = Math.max(0, start); i < entry.beats.length && remaining > 0; i++) {
      primary.push(entry.beats[i]!);
      remaining--;
    }
    const spill =
      remaining > 0 && distance !== 0 ? this.spillBeats(flow, remaining) : [];
    this.prefetchBeats(primary, 2);
    this.prefetchBeats(spill, 3);
  }

  protected spillBeats(flow: string, remaining: number): SceneBeat[] {
    const sceneAssets = this._game.program.sceneAssets;
    const entry = sceneAssets?.[flow];
    const spill: SceneBeat[] = [];
    if (!sceneAssets || !entry) {
      return spill;
    }
    const visited = new Set<string>([flow]);
    const queue = [...entry.loads, ...entry.successors];
    let flowsVisited = 0;
    while (
      queue.length > 0 &&
      remaining > 0 &&
      flowsVisited < MAX_PREDICTED_FLOWS
    ) {
      const next = queue.shift()!;
      if (visited.has(next)) {
        continue;
      }
      visited.add(next);
      flowsVisited++;
      const nextEntry: SceneAssets | undefined = sceneAssets[next];
      if (!nextEntry) {
        continue;
      }
      for (let i = 0; i < nextEntry.beats.length && remaining > 0; i++) {
        spill.push(nextEntry.beats[i]!);
        remaining--;
      }
      queue.push(...nextEntry.loads, ...nextEntry.successors);
    }
    return spill;
  }

  protected prefetchBeats(beats: SceneBeat[], priority: 2 | 3): void {
    if (beats.length === 0) {
      return;
    }
    const seen = new Set<string>();
    const items = this.itemsForBeats(beats).filter((item) => {
      const key = assetItemKey(item);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    this.prefetch(items, priority);
  }

  protected predictAround(
    flow: string,
    address: ProgramAddress | null | undefined,
    wholeScene: boolean,
  ): void {
    const entry = this._game.program.sceneAssets?.[flow];
    if (!entry) {
      return;
    }
    const distance = this.config.predict_distance;
    const index = Math.max(0, this.beatIndexFor(flow, address));
    const last = this._previewWindow;
    if (
      !wholeScene &&
      last &&
      last.flow === flow &&
      Math.abs(last.index - index) <= Math.floor(distance / 2)
    ) {
      return;
    }
    this._previewWindow = { flow, index };
    const { near, rest } = previewWindow(entry, index, distance);
    this.prefetchBeats(near, 2);
    if (!wholeScene) {
      return;
    }
    this.prefetchBeats(rest, 3);
    if (distance > 0) {
      this.prefetchBeats(this.spillBeats(flow, distance), 3);
    }
  }

  onBeatDisplayed(): void {
    if (this._pendingBeatPins.size > 0) {
      const pins = [...this._pendingBeatPins];
      this._pendingBeatPins.clear();
      this.release(pins, false);
    }
    if (this.silent) {
      return;
    }
    const flow = this._game.sceneTracker.current;
    if (!flow) {
      return;
    }
    if (this.previewing) {
      this.predictAround(flow, this.previewAnchorIn(flow), false);
    } else {
      this.predictFrom(flow, this._game.executingAddress, false);
    }
  }

  runLoad(loads: LoadInstruction[]): number {
    const id = this.nextTriggerId();
    if (this.silent) {
      this.enableTrigger(id);
      return id;
    }
    const config = this.config;
    const sceneAssets = this._game.program.sceneAssets ?? {};
    const worlds = (this.context as Record<string, any>)?.["world"];
    const tasks: Promise<unknown>[] = [];
    const pins: string[] = [];
    const names: string[] = [];
    let transition: string | undefined;
    for (const load of loads) {
      const name = load.name;
      if (!name) {
        continue;
      }
      transition ??= load.with;
      const entry = sceneAssets[name];
      const hasWorld = typeof worlds?.[name]?.src === "string" && worlds[name].src;
      if (!entry && !hasWorld) {
        this.warnOnce(
          `load:${name}`,
          `load: nothing named "${name}" (no scene or world)`,
        );
        continue;
      }
      names.push(name);
      if (entry) {
        const beats =
          config.load_distance > 0
            ? entry.beats.slice(0, config.load_distance)
            : entry.beats;
        const items = this.itemsForBeats(beats);
        if (this.previewing) {
          this.prefetch(items, 2);
        } else if (items.length > 0) {
          const pin = `load:${name}`;
          this._loadPins.add(name);
          pins.push(pin);
          tasks.push(
            this.request(items, 1, pin).then((result) => {
              if (result.pinned.length < result.loaded.length) {
                this.warnOnce(
                  `budget:${name}`,
                  `scene "${name}" exceeds load_cache_size; the rest streams as it is reached`,
                );
              }
              if (result.failed.length > 0) {
                this.warnOnce(
                  `failed:${result.failed.join(",")}`,
                  `load ${name}: could not load ${result.failed.join(", ")}`,
                );
              }
            }),
          );
        }
      }
      if (hasWorld && !this.previewing) {
        tasks.push(this._game.module.world.loadWorld(name));
      }
    }
    if (this.previewing) {
      this.enableTrigger(id);
      return id;
    }
    const ui = this._game.module.ui;
    this._activeLoadPins = pins;
    ui.beginLoading(transition, names[0]);
    let finished = false;
    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      if (this._activeLoadPins === pins) {
        this._activeLoadPins = null;
      }
      if (this._destroyed) {
        return;
      }
      ui.endLoading().then(
        () => this.enableTrigger(id),
        () => this.enableTrigger(id),
      );
    };
    if (tasks.length === 0) {
      finish();
      return id;
    }
    if (config.load_timeout > 0) {
      this.context.system.setTimeout(() => {
        if (!finished) {
          if (!this._destroyed) {
            console.warn(
              `spark-engine: load timed out after ${config.load_timeout}s; continuing`,
            );
          }
          finish();
        }
      }, config.load_timeout * 1000);
    }
    Promise.all(tasks).then(finish, finish);
    return id;
  }

  override async onConnected(): Promise<void> {
    this._destroyed = false;
    if (this.silent) {
      return;
    }
    this.emit(
      ConfigureAssetsMessage.type.notification({
        predictBytes: Math.max(0, this.config.predict_cache_size) * MEGABYTE,
        loadBytes: Math.max(0, this.config.load_cache_size) * MEGABYTE,
      }),
    );
    await this.gateRestore(this._game.module.ui.restoredPictureNames());
  }

  protected async gateRestore(names: string[]): Promise<void> {
    const items = this.resolveImageItems(names).filter(
      (item) => this.timed || item.kind !== "video",
    );
    this._restorePending = true;
    await this.ensureResident(
      items,
      0,
      "restore",
      this.config.restore_timeout,
      "restore",
    );
  }

  async onRedisplay(shown: string[]): Promise<void> {
    this._destroyed = false;
    if (this.silent) {
      return;
    }
    const showing = new Set(shown);
    const names = this._game.module.ui
      .restoredPictureNames()
      .filter((name) => !showing.has(name));
    if (names.length === 0) {
      return;
    }
    await this.gateRestore(names);
  }

  onSceneMapChanged(): void {
    this._previewWindow = null;
  }

  override async onRestore(): Promise<void> {
    if (this._restorePending) {
      this._restorePending = false;
      this.release(["restore"], false);
    }
  }

  gatePreviewBeat(instructions: Instructions | null): {
    settled: Promise<unknown>;
    release: () => void;
    abandon: () => void;
  } | null {
    if (this.silent) {
      return null;
    }
    const items = instructions
      ? this.resolveImageItems(this.imageNamesOf(instructions)).filter(
          (item) => this.timed || item.kind !== "video",
        )
      : [];
    if (items.length === 0) {
      this.releaseAbandoned();
      return null;
    }
    this._previewGates += 1;
    const pin = `preview:${this._previewGates}`;
    this._previewPins.add(pin);
    const settled = this.ensureResident(
      items,
      0,
      pin,
      this.config.restore_timeout,
      "preview",
      () => this._previewPins.has(pin),
    );
    this.releaseAbandoned();
    return {
      settled,
      release: () => {
        if (this._previewPins.delete(pin)) {
          this.release([pin], false);
        }
      },
      abandon: () => {
        if (this._previewPins.delete(pin)) {
          this._abandonedPins.add(pin);
          void settled.then(() => this.releaseAbandoned([pin]));
        }
      },
    };
  }

  override onEnterScene(
    scene: string,
    _previous: string | null,
    stack: string[],
  ): void {
    if (this.silent) {
      return;
    }
    const keep = new Set([scene, ...stack]);
    const drop = [...this._loadPins].filter((flow) => !keep.has(flow));
    if (drop.length > 0) {
      for (const flow of drop) {
        this._loadPins.delete(flow);
      }
      this.release(
        drop.map((flow) => `load:${flow}`),
        true,
      );
    }
    if (this.previewing) {
      this.predictAround(scene, this.previewAnchorIn(scene), true);
    } else {
      this.predictFrom(scene, this._game.executingAddress, true);
    }
  }

  override onProgramUpdate(): void {
    this._beatIndex = undefined;
    this._fontNamesByLayout.clear();
  }

  override onReceiveNotification(msg: NotificationMessage): void {
    if (AssetsProgressMessage.type.isNotification(msg)) {
      const { pin, loaded, failed, total } = msg.params;
      const active = this._activeLoadPins;
      if (!active || !active.includes(pin)) {
        return;
      }
      this._progress.set(pin, { loaded, failed, total });
      if (active && active.includes(pin)) {
        let loadedSum = 0;
        let totalSum = 0;
        for (const p of active) {
          const progress = this._progress.get(p);
          if (progress) {
            loadedSum += progress.loaded + progress.failed;
            totalSum += progress.total;
          }
        }
        this._game.module.ui.updateLoading({
          loaded: loadedSum,
          total: totalSum,
        });
      }
    }
  }

  override onDestroy(): void {
    const pins = [
      ...(this._restorePending ? ["restore"] : []),
      ...this._pendingBeatPins,
      ...this._previewPins,
      ...this._abandonedPins,
      ...[...this._loadPins].map((flow) => `load:${flow}`),
      ...[...this._layoutPins].map((name) => `layout:${name}`),
      ...this._retiringPins,
    ];
    if (pins.length > 0) {
      this.release(pins, false);
    }
    this._restorePending = false;
    this._pendingBeatPins.clear();
    this._previewPins.clear();
    this._abandonedPins.clear();
    this._loadPins.clear();
    this._layoutPins.clear();
    this._retiringPins.clear();
    this._fontNamesByLayout.clear();
    this._previewWindow = null;
    this._progress.clear();
    this._warned.clear();
    this._activeLoadPins = null;
    this._destroyed = true;
  }
}
