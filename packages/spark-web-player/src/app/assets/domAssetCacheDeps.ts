import { type AssetCacheDeps, type WarmHandle } from "./AssetCache";

/** The id of the hidden container that holds every warmed image. */
export const WARM_CONTAINER_ID = "spark-asset-warm";

/** A url as a CSS `url("…")` string. Quotes and backslashes are escaped the
 *  way CSS strings escape them; a control character has no place in a url
 *  and would end the string, so it is dropped. */
export const cssUrl = (src: string): string =>
  `url("${src
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')}")`;

/**
 * The image half of {@link AssetCacheDeps} for a real document: an `Image`
 * object per load, and a hidden element per resident image that keeps the
 * picture in the document as a CSS background.
 *
 * The container is one absolutely positioned pixel, transparent and inert,
 * appended to the body (or, before the body exists, the root element) the
 * first time an image is warmed. Its children are never displayed; they
 * exist so that the browser holds each picture in the form its renderer
 * reuses (see `AssetCacheDeps.warmImage`). An element with `display: none`
 * would load nothing, so the container hides by opacity. When there is
 * nowhere to put an element, `warmImage` says so by returning nothing, and
 * the cache loads through the `Image` object alone.
 */
export const createDomAssetCacheDeps = (
  doc: Document | null = typeof document === "undefined" ? null : document,
): Pick<AssetCacheDeps, "createImage" | "warmImage"> => {
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
  return {
    createImage: () => new Image(),
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
