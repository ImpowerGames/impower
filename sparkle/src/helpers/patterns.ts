import { Graphic } from "../types/graphic";

export default abstract class Patterns {
  protected static _map?: Record<string, Graphic>;

  static get(name: string): Graphic | undefined {
    return this._map?.[name];
  }

  static init(patternShapes: Record<string, Graphic>): void {
    this._map = patternShapes;
  }
}
