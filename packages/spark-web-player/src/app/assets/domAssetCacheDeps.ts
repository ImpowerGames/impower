import { type AssetCacheDeps, type WarmHandle } from "./AssetCache";
import { workerTrimmer, type LayerTrimmer } from "../morph/layerTrim";
import { dataUrlBytes, pictureFileTraits, streamInflate } from "../morph/pictureFileTraits";

export const WARM_CONTAINER_ID = "spark-asset-warm";

export const cssUrl = (src: string): string =>
  `url("${src
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')}")`;

export const createDomAssetCacheDeps = (
  doc: Document | null = typeof document === "undefined" ? null : document,
): Pick<AssetCacheDeps, "createImage" | "warmImage" | "inspectImage"> => {
  let container: HTMLElement | undefined;
  const containerOf = (): HTMLElement | undefined => {
    const root = doc?.body ?? doc?.documentElement;
    if (!root) {
      return undefined;
    }
    if (container && container.isConnected) {
      return container;
    }
    container =
      (doc!.getElementById(WARM_CONTAINER_ID) as HTMLElement | null) ??
      doc!.createElement("div");
    if (!container.isConnected) {
      container.id = WARM_CONTAINER_ID;
      container.setAttribute("aria-hidden", "true");
      container.style.cssText =
        "position:absolute;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;";
      root.appendChild(container);
    }
    return container;
  };
  const view = doc?.defaultView as (Window & typeof globalThis) | null | undefined;
  let trimmer: LayerTrimmer | undefined | null = null;
  return {
    createImage: () => new Image(),
    inspectImage: view
      ? async (src: string, trim: boolean) => {
          const bytes = /^data:/i.test(src)
            ? dataUrlBytes(src)
            : await view.fetch(src).then(
                async (response) => (response.ok ? new Uint8Array(await response.arrayBuffer()) : undefined),
                () => undefined,
              );
          if (!bytes) {
            return undefined;
          }
          const traits = await pictureFileTraits(bytes, streamInflate(view));
          if (!trim || traits.animated || traits.profile || traits.unread) {
            return traits;
          }
          if (trimmer === null) {
            trimmer = workerTrimmer(view);
          }
          const trimmed = await trimmer?.(bytes).catch(() => undefined);
          return trimmed ? { ...traits, trimmed } : traits;
        }
      : undefined,
    warmImage: doc
      ? (src: string): WarmHandle | undefined => {
          const host = containerOf();
          if (!host) {
            return undefined;
          }
          const el = doc.createElement("div");
          el.style.cssText = "width:1px;height:1px;";
          el.style.backgroundImage = cssUrl(src);
          host.appendChild(el);
          return {
            remove: () => {
              el.remove();
            },
          };
        }
      : undefined,
  };
};
