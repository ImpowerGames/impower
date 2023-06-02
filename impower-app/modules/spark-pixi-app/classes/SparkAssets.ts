import {
  AssetsClass,
  convertToList,
  isSingleItem,
  LoadAsset,
  LoaderParser,
} from "@pixi/assets";
import { ExtensionType, utils } from "@pixi/core";
import { loadMidi } from "./workers/loadMidi";
import { synthesizeToneSequence } from "./workers/synthesizeToneSequence";

export class SparkAssets extends AssetsClass {
  protected _listeners = new Map<string, Set<(value: number) => void>>();

  private _loadingProgress: Record<string, number> = {};

  public get loadingProgress(): Record<string, number> {
    return this._loadingProgress;
  }

  constructor() {
    super();

    this.loader.load = async <T>(
      assetsToLoadIn: string | string[] | LoadAsset<any> | LoadAsset<any>[],
      onProgress?: (progress: number) => void
    ): Promise<Record<string, T> | Awaited<T>> => {
      if (!this.loader["_parsersValidated"]) {
        this.loader["_validateParsers"]();
      }

      let count = 0;

      const assets: Record<string, Promise<any>> = {};

      const singleAsset = isSingleItem(assetsToLoadIn);

      const assetsToLoad = convertToList<LoadAsset>(assetsToLoadIn, (item) => ({
        src: item,
      }));

      const total = assetsToLoad.length;

      const promises: Promise<void>[] = assetsToLoad.map(
        async (asset: LoadAsset) => {
          const url = utils.path.toAbsolute(asset.src);
          // Add onProgress to listeners
          const urlListeners =
            this._listeners.get(url) || new Set<(value: number) => void>();
          urlListeners.add(onProgress);
          this._listeners.set(url, urlListeners);
          if (!assets[asset.src]) {
            try {
              if (!this.loader.promiseCache[url]) {
                this.loader.promiseCache[url] = this.loader[
                  "_getLoadPromiseAndParser"
                ](url, asset);
              }

              const promiseAndParser = this.loader.promiseCache[url];

              assets[asset.src] = await promiseAndParser.promise;

              // Only progress if nothing goes wrong
              if (onProgress) {
                count += 1;
                onProgress(count / total);
              }
            } catch (e) {
              // Delete eventually registered file and promises from internal cache
              // so they can be eligible for another loading attempt
              delete this.loader.promiseCache[url];
              delete assets[asset.src];

              // Stop further execution
              throw new Error(`[Loader.load] Failed to load ${url}.\n${e}`);
            }
          }
          urlListeners.delete(onProgress);
        }
      );

      await Promise.all(promises);

      return singleAsset ? assets[assetsToLoad[0].src] : assets;
    };

    const svgLoader: LoaderParser = {
      extension: ExtensionType.LoadParser,
      test: (url): boolean => url.endsWith("&ext=svg"),
      load: async <T>(src: string): Promise<T> =>
        new Promise((resolve, reject) => {
          fetch(src).then(async (res) => {
            const content = await res?.text?.();
            if (content) {
              try {
                const el = new DOMParser().parseFromString(
                  content,
                  "image/svg+xml"
                ).documentElement as unknown as SVGSVGElement;
                this.onProgress(src, 1);
                resolve(el as T);
              } catch {
                reject(new Error("Invalid SVG: Could not parse"));
              }
            } else {
              reject(new Error("Invalid SVG: Could not decode"));
            }
          });
        }),
    };

    const midLoader: LoaderParser = {
      extension: ExtensionType.LoadParser,
      test: (url): boolean => url.endsWith("&ext=mid"),
      load: async <T>(src: string): Promise<T> =>
        new Promise((resolve, reject) => {
          fetch(src).then(async (res) => {
            const totalSteps = 2;
            const progressFactor = 1 / totalSteps;
            let currentStep = 0;
            const content = await res?.arrayBuffer();
            if (content) {
              const toneSequences = await loadMidi(
                content,
                (loadPercentage) => {
                  this.onProgress(
                    src,
                    currentStep * progressFactor +
                      loadPercentage * progressFactor
                  );
                }
              );
              currentStep += 1;
              const bufferPercentage: number[] = [];
              const updateSynthesisProgress = (): void => {
                let synthesisProgress = 0;
                for (let i = 0; i < toneSequences.length; i += 1) {
                  synthesisProgress +=
                    bufferPercentage[i] / toneSequences.length;
                }
                this.onProgress(
                  src,
                  currentStep * progressFactor +
                    synthesisProgress * progressFactor
                );
              };
              const buffers = await Promise.all(
                toneSequences.map((toneSequence, sequenceIndex) =>
                  synthesizeToneSequence(toneSequence, (percentage) => {
                    bufferPercentage[sequenceIndex] = percentage;
                    updateSynthesisProgress();
                  })
                )
              );
              const maxLength = Math.max(...buffers.map((b) => b.length));
              const mergedBuffer = new Float32Array(maxLength);
              for (let i = 0; i < mergedBuffer.length; i += 1) {
                buffers.forEach((b) => {
                  mergedBuffer[i] = (mergedBuffer[i] ?? 0) + b[i];
                });
              }
              this.onProgress(src, 1);
              resolve(mergedBuffer as T);
            } else {
              reject(new Error("Invalid Midi: Could not decode"));
            }
          });
        }),
    };
    this.loader.parsers.push(svgLoader);
    this.loader.parsers.push(midLoader);
  }

  onProgress(url: string, percentage: number): void {
    this._loadingProgress[url] = percentage;
    const urlListeners = this._listeners.get(url);
    if (urlListeners) {
      urlListeners.forEach((listener) => {
        listener?.(percentage);
      });
    }
  }

  getAssetUrl(asset: { src: string; ext: string }): string {
    const src = asset.src;
    const ext = asset.ext;
    return `${src}&ext=${ext}`;
  }

  async loadAssets(
    assets: Record<string, { src: string; ext: string }>,
    onProgress?: (percentage: number) => void
  ): Promise<void> {
    const ids = Object.keys(assets);
    const urls = ids.map((id) => {
      const asset = assets[id];
      return this.getAssetUrl(asset);
    });
    const updateProgress = (): void => {
      let totalProgress = 0;
      urls.forEach((url) => {
        totalProgress += (this.loadingProgress[url] ?? 0) * (1 / urls.length);
      });
      if (!Number.isNaN(totalProgress)) {
        onProgress?.(totalProgress);
      }
    };
    await Promise.all([
      ...ids.map(async (id) => {
        const asset = assets[id];
        if (!this.cache.has(id)) {
          this.cache.set(id, undefined);
          const ext = asset.ext as unknown as string;
          const url = this.getAssetUrl(asset);
          const value = await this.load(url, () => {
            updateProgress();
          });
          this.cache.set(id, value);
          const typeMap =
            (this.cache.get(ext) as Record<string, unknown>) || {};
          typeMap[id] = value;
          this.cache.set(ext, typeMap);
        }
      }),
    ]);
  }
}
