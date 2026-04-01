export abstract class Styles {
  static cache = new Map<string, { cssText: string; sheet: CSSStyleSheet }>();

  static adoptStyle(
    target: ShadowRoot | Document,
    name: string,
    cssText: string,
  ) {
    if (name) {
      let style = Styles.cache.get(name);
      if (style && target.adoptedStyleSheets.includes(style.sheet)) {
        if (style.cssText !== cssText) {
          style.sheet.replaceSync(cssText);
          style.cssText = cssText;
        }
      } else if (style) {
        if (style.cssText !== cssText) {
          style.sheet.replaceSync(cssText);
          style.cssText = cssText;
        }
        target.adoptedStyleSheets.push(style.sheet);
      } else {
        const style = { cssText: cssText, sheet: new CSSStyleSheet() };
        style.sheet.replaceSync(cssText);
        style.cssText = cssText;
        Styles.cache.set(name, style);
        target.adoptedStyleSheets.push(style.sheet);
      }
    }
  }

  static removeStyle(target: ShadowRoot | Document, name: string) {
    if (name) {
      let style = Styles.cache.get(name);
      if (style) {
        if (target.adoptedStyleSheets.includes(style.sheet)) {
          target.adoptedStyleSheets = target.adoptedStyleSheets.filter(
            (s) => s !== style.sheet,
          );
        }
        style.sheet.replaceSync("");
      }
      Styles.cache.delete(name);
    }
  }
}
