import { Graphic } from "../types/graphic";

export default class StyleCache {
  protected _styles: Record<string, CSSStyleSheet> = {};

  protected _icons: Record<string, Graphic> = {};

  protected _patterns: Record<string, Graphic> = {};

  get styles() {
    return this._styles;
  }

  get icons() {
    return this._icons;
  }

  get patterns() {
    return this._patterns;
  }

  clearStyles() {
    this._styles = {};
  }

  getStyle(css: string) {
    const cachedSheet = this._styles[css];
    if (cachedSheet) {
      return cachedSheet;
    }
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    this._styles[css] = sheet;
    return sheet;
  }

  adoptStyles(el: Element | ShadowRoot | Document, css: string) {
    try {
      const targetEl =
        el instanceof Document || el instanceof ShadowRoot ? el : el.shadowRoot;
      if (targetEl) {
        targetEl.adoptedStyleSheets.push(this.getStyle(css));
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

  adoptIcons(shapes: Record<string, Graphic>) {
    this._icons = { ...this._icons, ...shapes };
  }

  adoptPatterns(shapes: Record<string, Graphic>) {
    this._patterns = { ...this._patterns, ...shapes };
  }
}
