import { AssetCache } from "../../app/assets/AssetCache";
import { createDomAssetCacheDeps } from "../../app/assets/domAssetCacheDeps";

let shared: AssetCache | undefined;

export const getSharedAssetCache = (): AssetCache => {
  if (!shared) {
    shared = new AssetCache({
      ...createDomAssetCacheDeps(),
      fetchBytes: async (src) => {
        const response = await fetch(src);
        if (!response.ok) {
          throw new Error(`${response.status} ${src}`);
        }
        return {
          bytes: await response.arrayBuffer(),
          type: response.headers.get("content-type") ?? "",
        };
      },
      createFontFace:
        typeof FontFace === "undefined"
          ? undefined
          : (family, source, descriptors) => {
              const d: FontFaceDescriptors = {};
              if (descriptors.weight) {
                d.weight = descriptors.weight;
              }
              if (descriptors.style) {
                d.style = descriptors.style;
              }
              if (descriptors.stretch) {
                d.stretch = descriptors.stretch;
              }
              if (descriptors.display) {
                d.display = descriptors.display as FontDisplay;
              }
              if (descriptors.unicodeRange) {
                d.unicodeRange = descriptors.unicodeRange;
              }
              return new FontFace(family, source, d);
            },
      fonts:
        typeof document !== "undefined" && document.fonts
          ? document.fonts
          : undefined,
      createObjectURL: (blob) => URL.createObjectURL(blob),
      revokeObjectURL: (url) => URL.revokeObjectURL(url),
    });
  }
  return shared;
};
