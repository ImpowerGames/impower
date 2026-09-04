import { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import { AssetsProgressMessage } from "../../../../spark-engine/src/game/modules/assets/classes/messages/AssetsProgressMessage";
import { ConfigureAssetsMessage } from "../../../../spark-engine/src/game/modules/assets/classes/messages/ConfigureAssetsMessage";
import { LoadAssetsMessage } from "../../../../spark-engine/src/game/modules/assets/classes/messages/LoadAssetsMessage";
import { PrefetchAssetsMessage } from "../../../../spark-engine/src/game/modules/assets/classes/messages/PrefetchAssetsMessage";
import { ReleaseAssetsMessage } from "../../../../spark-engine/src/game/modules/assets/classes/messages/ReleaseAssetsMessage";
import { type AssetsProgressParams } from "../../../../spark-engine/src/game/modules/assets/types/AssetsProgressParams";
import { AssetCache } from "../assets/AssetCache";
import { Manager } from "../Manager";

/**
 * The page's side of the asset protocol (docs/engine/asset-preloading-spec.md).
 *
 * The engine decides what to load, in what order, pinned under which pin, and
 * what to wait for; this manager hands those decisions to the shared
 * `AssetCache`, answers every `assets/load` (an unanswered request would hang
 * the engine's wait), reports progress back, and tells the cache what the page
 * itself keeps alive: the images in the overlay and the audio that is playing.
 */
export default class AssetManager extends Manager {
  protected _cache?: AssetCache;

  /** Pins this manager has been asked to hold, released on dispose. */
  protected _pins = new Set<string>();

  protected _unsubscribe?: () => void;

  protected _pendingProgress = new Map<string, AssetsProgressParams>();

  protected _flushScheduled = false;

  protected _exposedProbe?: () => unknown;

  get cache(): AssetCache {
    if (!this._cache) {
      this._cache =
        this.app.assetCache ??
        new AssetCache({ createImage: () => new Image() });
    }
    return this._cache;
  }

  override async onInit(): Promise<void> {
    const cache = this.cache;
    cache.setAudioDecoder((params) =>
      this.app.audio?.decodeAudioBuffer
        ? this.app.audio.decodeAudioBuffer(params)
        : Promise.resolve(null),
    );
    cache.setDerivedPins(() => this.derivedPins());
    this._unsubscribe = cache.onProgress((p) => this.queueProgress(p));
    this.exposeProbe();
  }

  /** What the page keeps alive on its own: every image in the overlay and
   *  every audio player that is playing. */
  derivedPins(): Set<string> {
    const keys = new Set<string>();
    const overlay = this.app.overlay;
    if (overlay) {
      for (const img of overlay.querySelectorAll("img.object")) {
        const src = img.getAttribute("src");
        if (src) {
          keys.add(src);
        }
      }
    }
    for (const key of this.app.audio?.playingKeys?.() ?? []) {
      keys.add(key);
    }
    return keys;
  }

  protected queueProgress(params: AssetsProgressParams): void {
    // Coalesce per pin per turn: a burst of settlements becomes one
    // notification per pin.
    this._pendingProgress.set(params.pin, params);
    if (this._flushScheduled) {
      return;
    }
    this._flushScheduled = true;
    queueMicrotask(() => {
      this._flushScheduled = false;
      const batch = [...this._pendingProgress.values()];
      this._pendingProgress.clear();
      for (const p of batch) {
        this.app.emit(AssetsProgressMessage.type.notification(p));
      }
    });
  }

  /** `window.__assetCache()` reports what is resident, like `__audioProbe`:
   *  a plain global, so anyone at a console can ask without finding a
   *  setting first. */
  protected exposeProbe(): void {
    if (typeof window === "undefined") {
      return;
    }
    this._exposedProbe = () => this.cache.stats();
    (window as any).__assetCache = this._exposedProbe;
    // The application and cache behind the stats, for a console that needs
    // to poke at the live game (same audience as `__audioProbe`).
    (window as any).__assetProbe = () => ({ app: this.app, cache: this.cache });
  }

  override onReceiveNotification(msg: NotificationMessage): void {
    if (ConfigureAssetsMessage.type.isNotification(msg)) {
      this.cache.configure({
        predictBytes: msg.params.predictBytes,
        loadBytes: msg.params.loadBytes,
      });
    } else if (PrefetchAssetsMessage.type.isNotification(msg)) {
      this.cache.prefetch(msg.params.items, msg.params.priority);
    } else if (ReleaseAssetsMessage.type.isNotification(msg)) {
      for (const pin of msg.params.pins) {
        this._pins.delete(pin);
      }
      this.cache.release(msg.params.pins, msg.params.drop);
    }
  }

  override async onReceiveRequest(msg: RequestMessage) {
    if (LoadAssetsMessage.type.isRequest(msg)) {
      const { items, priority, pin, pinBudget } = msg.params;
      this._pins.add(pin);
      const result = await this.cache.request(items, priority, pin, pinBudget);
      return LoadAssetsMessage.type.result(result);
    }
    return undefined;
  }

  override onDispose(): void {
    // Unpin without dropping: the cache outlives this application (STOP then
    // PLAY must not re-fetch), and the next one re-pins what it needs.
    if (this._pins.size > 0) {
      this.cache.release([...this._pins], false);
      this._pins.clear();
    }
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    if (
      typeof window !== "undefined" &&
      (window as any).__assetCache === this._exposedProbe
    ) {
      delete (window as any).__assetCache;
      delete (window as any).__assetProbe;
    }
  }
}
