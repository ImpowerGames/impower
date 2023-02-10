import { AssetsClass, LoaderParser } from "@pixi/assets";
import { ExtensionType } from "@pixi/core";

const svgLoader: LoaderParser = {
  extension: ExtensionType.LoadParser,
  test: (_url): boolean => true,
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
          reject(new Error("InvalidSVG: Could not decode"));
        }
      });
    }),
};

export class Assets extends AssetsClass {
  constructor() {
    super();
    this.loader.parsers.push(svgLoader);
  }
}
