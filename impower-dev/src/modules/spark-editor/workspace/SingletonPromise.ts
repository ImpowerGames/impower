export default class SingletonPromise<
  T extends (...args: any[]) => Promise<any>,
> {
  protected _value?: any;
  get value() {
    return this._value;
  }

  protected _promise?: Promise<Awaited<ReturnType<T>>>;

  protected _func: T;

  constructor(func: T) {
    this._func = func;
  }

  async get(...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> {
    if (this._value === undefined) {
      if (!this._promise) {
        // A rejected attempt must not stay cached. Without this, `_promise`
        // keeps pointing at the rejected promise and every later `get()`
        // re-awaits the same rejection — so one transient failure (a script
        // load that dropped, a read that lost a race) permanently disables
        // whatever is being memoized for the rest of the session, with no way
        // back short of an explicit `reset()` that nothing calls.
        //
        // Callers already in flight still share this single attempt; only
        // callers arriving after it fails get to start a fresh one.
        const attempt: Promise<Awaited<ReturnType<T>>> = this._func(
          ...args
        ).then(undefined, (e: unknown) => {
          if (this._promise === attempt) {
            this._promise = undefined;
          }
          throw e;
        });
        this._promise = attempt;
      }
      this._value = await this._promise;
    }
    return this._value;
  }

  reset() {
    this._value = undefined;
    this._promise = undefined;
  }
}
