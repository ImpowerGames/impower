import { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import {
  type SceneAssets,
  type SceneBeat,
} from "@impower/sparkdown/src/compiler/types/SceneAssets";
import { Module } from "../../../core/classes/Module";
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

/** Flows the prediction window may spill into beyond the current one. */
const MAX_PREDICTED_FLOWS = 16;

const EMPTY_RESULT: LoadAssetsResult = { loaded: [], failed: [], pinned: [] };

/**
 * Decides what the page should have resident and when the story must wait for
 * it (docs/engine/asset-preloading-spec.md).
 *
 * The engine owns the decisions — which names, in which order, pinned under
 * which pin, waited for by which beat — and resolves names to URLs with the
 * same resolvers the renderer uses, so a preloaded URL is exactly the URL
 * that will be requested. The page (`AssetManager`) owns fetching, decoding,
 * the cache size, and eviction.
 *
 * Every wait is bounded: a line, a mount, a restore, or a `load` that the
 * page cannot satisfy in time proceeds with a warning rather than hanging.
 */
export class AssetModule extends Module<
  AssetsState,
  AssetsMessageMap,
  AssetsBuiltins
> {
  /** Flows whose explicitly loaded sets are pinned (`load:<flow>`). */
  protected _loadPins = new Set<string>();

  /** Layouts whose fonts are pinned (`layout:<name>`). */
  protected _layoutPins = new Set<string>();

  /** Keys already handed to prediction since the last scene entry, so the
   *  window does not resend the same items after every beat. */
  protected _predicted = new Set<string>();

  /** Latest progress per pin, as the page reports it. */
  protected _progress = new Map<
    string,
    { loaded: number; failed: number; total: number }
  >();

  /** Pins of the `load` beat currently holding the loading layout. */
  protected _activeLoadPins: string[] | null = null;

  protected _warned = new Set<string>();

  /** Per-flow `path -> beat index`, rebuilt when the program changes. */
  protected _beatIndex?: {
    program: object;
    byFlow: Map<string, Map<string, number>>;
  };

  protected _destroyed = false;

  override getBuiltins() {
    return assetsBuiltinDefinitions();
  }

  override getStored() {
    return [];
  }

  /** The `assets` config block with defaults filled in for anything the
   *  author left out or mistyped. */
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
      asset_cache_size: count("asset_cache_size", defaults.asset_cache_size),
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

  /** A route replay produces no output and must never wait on the page. */
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

  /** Timed assets (audio, video) are only worth loading when the story can
   *  play them, which a preview never does. */
  protected get timed(): boolean {
    return !this.previewing;
  }

  // ---------------------------------------------------------------------------
  // Resolution: names as authored -> what the page fetches
  // ---------------------------------------------------------------------------

  /** Image names (verbatim, `~`-tagged and `+`-split) to the URLs the renderer
   *  will request. A name that is not an image but is a video yields a video
   *  item. */
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

  /** Audio names to the load parameters `schedule` would build. Synths are
   *  generated per line, so they are skipped. */
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

  /** The font faces the styles of these layouts reference. */
  resolveFontItems(layoutNames: Iterable<string>): AssetItem[] {
    const items: AssetItem[] = [];
    const seen = new Set<string>();
    const fonts = (this.context as Record<string, any>)?.["font"];
    if (!fonts) {
      return items;
    }
    const ui = this._game.module.ui;
    for (const layoutName of layoutNames) {
      for (const fontName of ui.getFontNamesForLayout(layoutName)) {
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

  /** Everything a run of beats references, resolved and deduped. Timed items
   *  are dropped in preview. */
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

  // ---------------------------------------------------------------------------
  // Requests
  // ---------------------------------------------------------------------------

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

  /**
   * Request items and wait until every one has settled or the timeout
   * elapses, whichever comes first. Never rejects and never waits for ever;
   * on timeout the story proceeds and the missing keys are named.
   */
  protected ensureResident(
    items: AssetItem[],
    priority: 0 | 1,
    pin: string,
    timeoutSeconds: number,
    what: string,
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
      this.context.system.setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        console.warn(
          `spark-engine: ${what} timed out after ${timeoutSeconds}s waiting for ${items
            .map(assetItemKey)
            .join(", ")}`,
        );
        resolve({ timedOut: true, result: null });
      }, timeoutSeconds * 1000);
    });
  }

  // ---------------------------------------------------------------------------
  // Gates
  // ---------------------------------------------------------------------------

  /**
   * Start loading everything a beat shows and return a trigger the
   * Coordinator waits on before displaying it, or null when nothing needs
   * loading. The pin is released once the trigger fires: by then the images
   * are on screen, which pins them on the page's side.
   */
  prepareBeat(instructions: Instructions): number | null {
    if (this.silent) {
      return null;
    }
    const names: string[] = [];
    for (const events of Object.values(instructions.image ?? {})) {
      for (const event of events) {
        if (event.control !== "hide" && event.assets?.length) {
          names.push(...event.assets);
        }
      }
    }
    const items = this.resolveImageItems(names);
    if (items.length === 0) {
      return null;
    }
    const id = this.nextTriggerId();
    const pin = `beat:${id}`;
    this.ensureResident(
      items,
      0,
      pin,
      this.config.beat_timeout,
      "a line's images",
    ).then(() => {
      this.enableTrigger(id, () => this.release([pin], false));
    });
    return id;
  }

  /**
   * Make a layout's fonts resident before it mounts. Returns nothing at all,
   * synchronously, when there is nothing to load, so a mount with no fonts
   * keeps its exact timing (the UI batches on microtasks, and directive
   * ordering guarantees depend on a font-less open not yielding).
   */
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

  /**
   * Let interpolated names into the pipeline the moment the interpreter
   * parses them, before the line's gate runs.
   */
  notice(kind: "image" | "audio", names: string[]): void {
    if (this.silent || names.length === 0) {
      return;
    }
    if (kind === "image") {
      const items = this.resolveImageItems(names).filter(
        (item) => this.timed || item.kind !== "video",
      );
      this.prefetch(items, 2);
    } else if (this.timed) {
      this.prefetch(this.resolveAudioItems(names), 2);
    }
  }

  // ---------------------------------------------------------------------------
  // Prediction
  // ---------------------------------------------------------------------------

  protected beatIndexFor(flow: string, path: string | null | undefined): number {
    if (!path) {
      return -1;
    }
    const program = this._game.program;
    if (!this._beatIndex || this._beatIndex.program !== program) {
      this._beatIndex = { program, byFlow: new Map() };
    }
    let byPath = this._beatIndex.byFlow.get(flow);
    const beats = program.sceneAssets?.[flow]?.beats ?? [];
    if (!byPath) {
      byPath = new Map();
      beats.forEach((beat, index) => byPath!.set(beat.path, index));
      this._beatIndex.byFlow.set(flow, byPath);
    }
    const exact = byPath.get(path);
    if (exact != null) {
      return exact;
    }
    // Not a beat path: the last beat at or before the current position in
    // the source, which is what "the beats after this one" means.
    const locations = program.pathLocations;
    const here = locations?.[path];
    if (!here) {
      return -1;
    }
    let index = -1;
    for (let i = 0; i < beats.length; i++) {
      const at = locations?.[beats[i]!.path];
      if (!at) {
        continue;
      }
      const before =
        at[0] < here[0] ||
        (at[0] === here[0] &&
          (at[1] < here[1] || (at[1] === here[1] && at[2] <= here[2])));
      if (before) {
        index = i;
      } else {
        break;
      }
    }
    return index;
  }

  /**
   * Prefetch the assets of the next `predict_distance` beats after `path` in
   * `flow`, spilling into the flows it loads and diverts to when the window
   * runs past the end. With `inclusive`, the beat at `path` is included.
   */
  protected predictFrom(
    flow: string,
    path: string | null | undefined,
    inclusive: boolean,
  ): void {
    const sceneAssets = this._game.program.sceneAssets;
    const entry = sceneAssets?.[flow];
    if (!sceneAssets || !entry) {
      return;
    }
    const distance = this.config.predict_distance;
    const start = this.beatIndexFor(flow, path) + (inclusive ? 0 : 1);
    let remaining = distance === 0 ? Number.POSITIVE_INFINITY : distance;
    const primary: SceneBeat[] = [];
    for (let i = Math.max(0, start); i < entry.beats.length && remaining > 0; i++) {
      primary.push(entry.beats[i]!);
      remaining--;
    }
    const spill: SceneBeat[] = [];
    if (remaining > 0 && distance !== 0) {
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
        for (
          let i = 0;
          i < nextEntry.beats.length && remaining > 0;
          i++
        ) {
          spill.push(nextEntry.beats[i]!);
          remaining--;
        }
        queue.push(...nextEntry.loads, ...nextEntry.successors);
      }
    }
    this.prefetchBeats(primary, 2);
    this.prefetchBeats(spill, 3);
  }

  protected prefetchBeats(beats: SceneBeat[], priority: 2 | 3): void {
    if (beats.length === 0) {
      return;
    }
    const items = this.itemsForBeats(beats).filter((item) => {
      const key = assetItemKey(item);
      if (this._predicted.has(key)) {
        return false;
      }
      this._predicted.add(key);
      return true;
    });
    this.prefetch(items, priority);
  }

  /** Preview: the cursor moves anywhere inside a scene, so warm all of it. */
  protected prefetchScene(flow: string): void {
    const entry = this._game.program.sceneAssets?.[flow];
    if (!entry) {
      return;
    }
    this.prefetchBeats(entry.beats, 2);
  }

  /** Advance the prediction window past the beat that just displayed. */
  onBeatDisplayed(): void {
    if (this.silent || this.previewing) {
      return;
    }
    const flow = this._game.sceneTracker.current;
    if (!flow) {
      return;
    }
    this.predictFrom(flow, this._game.executingPath, false);
  }

  // ---------------------------------------------------------------------------
  // Explicit loads
  // ---------------------------------------------------------------------------

  /**
   * Run a `load` beat: pin the named scenes' sets (and load their worlds)
   * behind the loading layout, and return a trigger the Coordinator waits on.
   * In preview only the visual prefetch happens and the trigger is ready at
   * once.
   */
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
                  `scene "${name}" exceeds asset_cache_size; the rest streams as it is reached`,
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
    if (this.previewing || tasks.length === 0) {
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
      ui.endLoading().then(
        () => this.enableTrigger(id),
        () => this.enableTrigger(id),
      );
    };
    this.context.system.setTimeout(() => {
      if (!finished) {
        console.warn(
          `spark-engine: load timed out after ${config.load_timeout}s; continuing`,
        );
        finish();
      }
    }, config.load_timeout * 1000);
    Promise.all(tasks).then(finish, finish);
    return id;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  override async onConnected(): Promise<void> {
    this._destroyed = false;
    this.emit(
      ConfigureAssetsMessage.type.notification({
        cacheBytes: Math.max(0, this.config.asset_cache_size) * MEGABYTE,
      }),
    );
    if (this.silent) {
      return;
    }
    // The restore gate: what the checkpoint displays must be resident before
    // `restore()` writes it, or a preview shows its backdrop late. Fonts are
    // gated by the layouts as they mount.
    const names: string[] = [];
    const imageState = this._game.module.ui.state.image;
    if (imageState) {
      for (const events of Object.values(imageState)) {
        for (const event of events ?? []) {
          if (event.control === "show" && event.assets?.length) {
            names.push(...event.assets);
          }
        }
      }
    }
    const items = this.resolveImageItems(names).filter(
      (item) => this.timed || item.kind !== "video",
    );
    await this.ensureResident(
      items,
      0,
      "restore",
      this.config.restore_timeout,
      "restore",
    );
  }

  override async onRestore(): Promise<void> {
    this.release(["restore"], false);
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
    this._predicted.clear();
    if (this.previewing) {
      this.prefetchScene(scene);
    } else {
      this.predictFrom(scene, this._game.executingPath, true);
    }
  }

  override onProgramUpdate(): void {
    this._beatIndex = undefined;
  }

  override onReceiveNotification(msg: NotificationMessage): void {
    if (AssetsProgressMessage.type.isNotification(msg)) {
      const { pin, loaded, failed, total } = msg.params;
      this._progress.set(pin, { loaded, failed, total });
      const active = this._activeLoadPins;
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
      "restore",
      ...[...this._loadPins].map((flow) => `load:${flow}`),
      ...[...this._layoutPins].map((name) => `layout:${name}`),
    ];
    // Unpin without dropping: the cache outlives this game (STOP then PLAY
    // must not re-fetch), and the next game re-pins what it needs.
    this.release(pins, false);
    this._loadPins.clear();
    this._layoutPins.clear();
    this._predicted.clear();
    this._activeLoadPins = null;
    this._destroyed = true;
  }
}
