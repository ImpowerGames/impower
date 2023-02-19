import { AssetsClass, LoaderParser } from "@pixi/assets";
import { ExtensionType } from "@pixi/core";

const svgLoader: LoaderParser = {
  extension: ExtensionType.LoadParser,
  test: (url): boolean => url.endsWith("&type=svg"),
  load: async <T>(src: string): Promise<T> =>
    new Promise((resolve, reject) => {
      fetch(src).then(async (res) => {
        const content = await res?.text?.();
        if (content) {
          try {
            const el = new DOMParser().parseFromString(content, "image/svg+xml")
              .documentElement as unknown as SVGSVGElement;
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
  test: (url): boolean => url.endsWith("&type=mid"),
  load: async <T>(src: string): Promise<T> =>
    new Promise((resolve, reject) => {
      fetch(src).then(async (res) => {
        const content = await res?.arrayBuffer();
        if (content) {
          resolve(content as T);
        } else {
          reject(new Error("Invalid Midi: Could not decode"));
        }
      });
    }),
};

export class Assets extends AssetsClass {
  constructor() {
    super();
    this.loader.parsers.push(svgLoader);
    this.loader.parsers.push(midLoader);
  }
}
