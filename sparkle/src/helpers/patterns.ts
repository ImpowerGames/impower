import { Pattern } from "../types/pattern";

export default abstract class Patterns {
  protected static _map?: Record<string, Pattern>;

  static get(name: string): Pattern | undefined {
    return this._map?.[name];
  }

  static init(patternShapes: Record<string, Pattern>): void {
    this._map = patternShapes;
  }
}
