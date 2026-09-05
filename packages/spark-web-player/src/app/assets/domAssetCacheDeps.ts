import { type AssetCacheDeps, type WarmHandle } from "./AssetCache";

/** The id of the hidden container that holds every warmed image. */
export const WARM_CONTAINER_ID = "spark-asset-warm";

/**
 * The image half of {@link AssetCacheDeps} for a real document: an `Image`
 * object per load, and a hidden element per resident image that keeps the
 * picture in the document as a CSS background.
 *
 * The container is one absolutely positioned pixel, transparent and inert,
 * appended to the body the first time an image is warmed. Its children are
 * never displayed; they exist so that the browser holds each picture in the
 * form its renderer reuses (see `AssetCacheDeps.warmImage`). An element with
 * `display: none` would load nothing, so the container hides by opacity.
 */
export const createDomAssetCacheDeps = (
  doc: Document | null = typeof document === "undefined" ? null : document,
): Pick<AssetCacheDeps, "createImage" | "warmImage"> => {
  let container: HTMLElement | undefined;
  const containerOf = (): HTMLElement | undefined => {
    if (!doc?.body) {
      return undefined;
    }
    if (container && container.isConnected) {
      return container;
    }
    container =
      (doc.getElementById(WARM_CONTAINER_ID) as HTMLElement | null) ??
      doc.createElement("div");
    if (!container.isConnected) {
      container.id = WARM_CONTAINER_ID;
      container.setAttribute("aria-hidden", "true");
      container.style.cssText =
        "position:absolute;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;";
      doc.body.appendChild(container);
    }
    return container;
  };
  return {
    createImage: () => new Image(),
    warmImage: doc
      ? (src: string): WarmHandle => {
          const host = containerOf();
          const el = doc.createElement("div");
          el.style.cssText = `width:1px;height:1px;background-image:url("${src.replace(/"/g, '\\"')}")`;
          host?.appendChild(el);
          return {
            remove: () => {
              el.remove();
            },
          };
        }
      : undefined,
  };
};
