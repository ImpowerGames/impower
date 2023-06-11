export default class StyleCache {
  protected _cache: Record<string, CSSStyleSheet> = {};

  cache() {
    return this._cache;
  }

  clearCache() {
    this._cache = {};
  }

  get(css: string) {
    const cachedSheet = this._cache[css];
    if (cachedSheet) {
      return cachedSheet;
    }
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    this._cache[css] = sheet;
    return sheet;
  }

  adopt(el: Element | ShadowRoot | Document, css: string) {
    try {
      const targetEl =
        el instanceof Document || el instanceof ShadowRoot ? el : el.shadowRoot;
      if (targetEl) {
        targetEl.adoptedStyleSheets.push(this.get(css));
      }
    } catch {
      // Fallback to inline styles if constructable style sheets are not supported
      const styleEl = document.createElement("style");
      styleEl.innerHTML = css;
      const targetEl =
        el instanceof Document ? el.getElementsByTagName("head")[0] : el;
      if (targetEl) {
        targetEl.appendChild(styleEl);
      }
    }
  }
}
