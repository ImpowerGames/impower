import { IGameEvent } from "../types/IGameEvent";

export class GameEvent<
  P1 extends unknown = any,
  P2 extends unknown = any,
  P3 extends unknown = any,
  P4 extends unknown = any,
  P5 extends unknown = any
> implements IGameEvent<P1, P2, P3, P4, P5>
{
  protected _handlers: ((
    p1?: P1,
    p2?: P2,
    p3?: P3,
    p4?: P4,
    p5?: P5
  ) => void)[] = [];

  addListener(
    handler: (p1?: P1, p2?: P2, p3?: P3, p4?: P4, p5?: P5) => void
  ): void {
    this._handlers.push(handler);
  }

  removeListener(
    handler: (p1?: P1, p2?: P2, p3?: P3, p4?: P4, p5?: P5) => void
  ): void {
    this._handlers = this._handlers.filter((h) => h !== handler);
  }

  removeAllListeners(): void {
    this._handlers = [];
  }

  dispatch(p1?: P1, p2?: P2, p3?: P3, p4?: P4, p5?: P5): void {
    this._handlers.slice(0).forEach((h) => h(p1, p2, p3, p4, p5));
  }
}
