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

  static init(patternShapes: Record<SparkleStyleType, CSSStyleSheet>): void {
    this._map = patternShapes;
  }
}
