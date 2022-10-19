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
  _SVG_DOCUMENT_CACHE: Map<string, SVGSVGElement> = new Map();

  /**
   * @internal
   * @ignore
   */
  async load(href: string): Promise<SVGSVGElement | undefined> {
    const url = new URL(href, document.baseURI);
    const id = url.host + url.pathname;
    let doc = this._SVG_DOCUMENT_CACHE.get(id);

    if (!doc) {
      doc = await fetch(url.toString())
        .then((res) => res.text())
        .then(
          (text) =>
            new DOMParser().parseFromString(text, "image/svg+xml")
              .documentElement as unknown as SVGSVGElement
        );

      if (doc) {
        this._SVG_DOCUMENT_CACHE.set(id, doc);
      }
    }

    return doc;
  }

  /**
   * Get information on the internal cache of the SVG loading mechanism.
   *
   * @public
   * @returns A view on the cache - clear() method and a size property.
   */
  getLoaderCache(): {
    clear(): void;
    size: number;
  } {
    return {
      clear: (): void => {
        this._SVG_DOCUMENT_CACHE.clear();
      },
      size: this._SVG_DOCUMENT_CACHE.size,
    };
  }
}
