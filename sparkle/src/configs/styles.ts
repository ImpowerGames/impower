import { SparkleStyleType } from "../types/sparkleStyleType";

export default abstract class Styles {
  protected static _map?: Record<SparkleStyleType, CSSStyleSheet>;

  static get(name: SparkleStyleType): CSSStyleSheet | undefined {
    return this._map?.[name];
  }

  static getAll(): CSSStyleSheet[] {
    if (!this._map) {
      return [];
    }
    return Object.values(this._map);
  }

  static init(cssMap: Record<SparkleStyleType, string>): void {
    this._map = {} as Record<SparkleStyleType, CSSStyleSheet>;
    Object.entries(cssMap).forEach(([name, css]) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      if (this._map) {
        this._map[name as SparkleStyleType] = sheet;
      }
    });
  }
}
