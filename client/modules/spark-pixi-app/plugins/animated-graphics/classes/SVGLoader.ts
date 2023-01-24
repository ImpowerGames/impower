import { Assets } from "pixi.js";

export class SVGLoader {
  static _instance: SVGLoader;

  static get instance(): SVGLoader {
    if (!this._instance) {
      this._instance = new SVGLoader();
    }
    return this._instance;
  }

  /**
   * @internal
   * @ignore
   */
  async load(href: string): Promise<SVGSVGElement | undefined> {
    const url = new URL(href, document.baseURI);
    return Assets.load(url.toString())
      .then((res) => res.text())
      .then((text) => {
        if (text.startsWith("<svg ")) {
          return new DOMParser().parseFromString(text, "image/svg+xml")
            .documentElement as unknown as SVGSVGElement;
        }
        return undefined;
      });
  }

  reset(): void {
    Assets.reset();
  }
}
