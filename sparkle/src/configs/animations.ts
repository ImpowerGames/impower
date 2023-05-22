import { Animation } from "../types/animation";

export default abstract class Animations {
  protected static _map: Record<string, Animation> = {};

  static all() {
    return this._map;
  }

  static get(name: string): Animation | undefined {
    return this._map[name];
  }

  static init(animationKeyframes: Record<string, Animation>): void {
    if (animationKeyframes) {
      this._map = animationKeyframes;
    }
  }
}
