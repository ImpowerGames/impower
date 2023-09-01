type ErrorCallback = (err: any) => void;

export default class PromiseEvent<T = void> {
  protected _resolve: ((arg: T) => void)[] = [];

  protected _reject: ErrorCallback[] = [];

  async resolve(arg: T) {
    this._resolve.forEach((r) => {
      r(arg);
    });
    this._resolve = [];
  }

  async reject(err?: any) {
    this._reject.forEach((r) => {
      r(err);
    });
    this._reject = [];
  }

  addResolveListener(onResolve: (arg: T) => void) {
    this._resolve.push(onResolve);
  }

  addRejectListener(onReject: ErrorCallback) {
    this._reject.push(onReject);
  }

  addListeners(onResolve: (arg: T) => void, onReject: ErrorCallback) {
    this.addResolveListener(onResolve);
    this.addRejectListener(onReject);
  }
}
