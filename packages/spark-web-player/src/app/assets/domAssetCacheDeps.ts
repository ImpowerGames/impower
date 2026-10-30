import { type AssetCacheDeps, type WarmHandle } from "./AssetCache";

export const WARM_CONTAINER_ID = "spark-asset-warm";

export const cssUrl = (src: string): string =>
  `url("${src
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')}")`;

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
