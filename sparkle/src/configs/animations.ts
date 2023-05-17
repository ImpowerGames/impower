import { Animation } from "../types/animation";

export default abstract class Animations {
  protected static _map?: Record<string, Animation>;

  static get(name: string): Animation | undefined {
    return this._map?.[name];
  }

  static init(animationKeyframes: Record<string, Animation>): void {
    this._map = animationKeyframes;
  }
}
