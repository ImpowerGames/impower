import { IContext } from "../types/IContext";

export default abstract class Context<T = Record<string, unknown>>
  implements IContext<T>
{
  protected abstract _store: T;

  abstract get event(): string;

  get root(): HTMLElement | Window {
    return window;
  }

  get(): T {
    return this._store;
  }

  set(v: T) {
    this._store = v;
    this.root.dispatchEvent(
      new CustomEvent(this.event, { detail: this._store })
    );
  }
}
