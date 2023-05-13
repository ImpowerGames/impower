import { Graphic } from "../types/graphic";

export default abstract class Icons {
  protected static _map?: Record<string, Graphic>;

  static get(name: string): Graphic | undefined {
    return this._map?.[name];
  }

  static init(iconShapes: Record<string, Graphic>): void {
    this._map = iconShapes;
  }
}
