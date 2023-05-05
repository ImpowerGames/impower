export default abstract class Animations {
  protected static _map: Record<
    string,
    {
      keyframes: Keyframe[];
      options?: KeyframeAnimationOptions;
    }
  > = {};

  static get(name: string):
    | {
        keyframes: Keyframe[];
        options?: KeyframeAnimationOptions;
      }
    | undefined {
    return this._map[name];
  }

  static init(
    animations: Record<
      string,
      {
        keyframes: Keyframe[];
        options?: KeyframeAnimationOptions;
      }
    >
  ): void {
    this._map = animations;
    console.log(animations);
  }
}
