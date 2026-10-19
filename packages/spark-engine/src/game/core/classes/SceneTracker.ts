/**
 * The change the story just made from one top-level flow to another.
 *
 * `stack` names the flows the story will come back to: the callers of every
 * open tunnel and thread. An explicitly loaded set stays pinned while its flow
 * is the current one or on this stack.
 */
export interface SceneTransition {
  scene: string;
  previous: string | null;
  stack: string[];
}

/**
 * Tracks which top-level flow (a scene, or `0` for root content) the story is
 * executing, and reports the moments it changes.
 *
 * A flow is the scene an address stands in (`Game.sceneOf`, which the
 * accessor answers), the same flow a route to it starts at. Functions are not
 * flows a story "enters": a call inside a scene keeps the scene current, so
 * the caller supplies `isFunction` to skip them.
 */
export class SceneTracker {
  protected _current: string | null = null;

  get current() {
    return this._current;
  }

  constructor(protected _isFunction: (flow: string) => boolean) {}

  /**
   * Note the scene the story is in. Returns a transition only when the flow
   * actually changed (and is not a function); otherwise null.
   *
   * `stackScenes` are the scenes of the positions on the call stack, which
   * are the flows the story will return to.
   */
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
