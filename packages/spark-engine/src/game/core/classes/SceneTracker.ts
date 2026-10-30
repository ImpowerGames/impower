export interface SceneTransition {
  scene: string;
  previous: string | null;
  stack: string[];
}

export class SceneTracker {
  protected _current: string | null = null;

  get current() {
    return this._current;
  }

  constructor(protected _isFunction: (flow: string) => boolean) {}

  observe(
    scene: string | null | undefined,
    stackScenes: Iterable<string> = [],
  ): SceneTransition | null {
    if (!scene || this._isFunction(scene) || scene === this._current) {
      return null;
    }
    const previous = this._current;
    this._current = scene;
    const stack = new Set<string>();
    for (const flow of stackScenes) {
      if (flow && flow !== scene && !this._isFunction(flow)) {
        stack.add(flow);
      }
    }
    return { scene, previous, stack: [...stack] };
  }

  reset() {
    this._current = null;
  }
}
