import { IGameEvent } from "../types/IGameEvent";

export class GameEvent<
  T0 extends unknown = any,
  T1 extends unknown = any,
  T2 extends unknown = any,
  T3 extends unknown = any,
  T4 extends unknown = any
> implements IGameEvent<T0, T1, T2, T3, T4>
{
  constructor() {}

  private handlers: {
    (arg0?: T0, arg1?: T1, arg2?: T2, arg3?: T3, arg4?: T4): void;
  }[] = [];

  public addListener(handler: {
    (arg0?: T0, arg1?: T1, arg2?: T2, arg3?: T3, arg4?: T4): void;
  }): void {
    this.handlers.push(handler);
  }

  public removeListener(handler: {
    (arg0?: T0, arg1?: T1, arg2?: T2, arg3?: T3, arg4?: T4): void;
  }): void {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }

  public removeAllListeners(): void {
    this.handlers = [];
  }

  public dispatch(arg0?: T0, arg1?: T1, arg2?: T2, arg3?: T3, arg4?: T4): void {
    this.handlers.slice(0).forEach((h) => h(arg0, arg1, arg2, arg3, arg4));
  }
}
