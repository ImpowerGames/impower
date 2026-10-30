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
