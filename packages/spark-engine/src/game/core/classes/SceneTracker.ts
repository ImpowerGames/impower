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
 * A flow is the first segment of a runtime path, the same key
 * `Game.getSimulateFromPath` produces. Functions are not flows a story
 * "enters": a call inside a scene keeps the scene current, so the caller
 * supplies `isFunction` to skip them.
 */
export class SceneTracker {
  protected _current: string | null = null;

  get current() {
    return this._current;
  }

  constructor(protected _isFunction: (flow: string) => boolean) {}

  /** The flow a runtime path belongs to: its first segment, or `0` for
   *  index-addressed root content. Null for no path. */
  static sceneOf(path: string | null | undefined): string | null {
    if (!path) {
      return null;
    }
    const dot = path.indexOf(".");
    const head = dot < 0 ? path : path.slice(0, dot);
    if (!head) {
      return null;
    }
    // Root content is index-addressed (`0.3`, `12`); every flow name is not.
    return /^\d+$/.test(head) ? "0" : head;
  }

  /**
   * Note the path the story is on. Returns a transition only when the flow
   * actually changed (and is not a function); otherwise null.
   *
   * `stackPaths` are the paths on the ink callstack, from which the flows the
   * story will return to are derived.
   */
  observe(
    path: string | null | undefined,
    stackPaths: Iterable<string> = [],
  ): SceneTransition | null {
    const scene = SceneTracker.sceneOf(path);
    if (!scene || this._isFunction(scene) || scene === this._current) {
      return null;
    }
    const previous = this._current;
    this._current = scene;
    const stack = new Set<string>();
    for (const stackPath of stackPaths) {
      const flow = SceneTracker.sceneOf(stackPath);
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
