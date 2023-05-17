import { Graphic } from "../types/graphic";

export default abstract class Patterns {
  protected static _map: Record<string, Graphic> = {};

  static all() {
    return this._map;
  }

  static get(name: string) {
    return this._map?.[name];
  }

  static init(patternShapes: Record<string, Graphic>): void {
    this._map = patternShapes;
  }
}
