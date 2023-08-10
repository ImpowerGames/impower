import { GameEvent } from "./GameEvent";

export class GameEvent1<P1> extends GameEvent {
  override addListener(handler: (p1: P1) => void): void {
    super.addListener(handler);
  }

  override removeListener(handler: (p1: P1) => void): void {
    super.removeListener(handler);
  }

  override dispatch(p1: P1): void {
    super.dispatch(p1);
  }
}
