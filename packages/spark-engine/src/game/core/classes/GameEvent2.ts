import { GameEvent } from "./GameEvent";

export class GameEvent2<P1, P2> extends GameEvent {
  override addListener(handler: (p1: P1, p2: P2) => void): void {
    super.addListener(handler);
  }

  override removeListener(handler: (p1: P1, p2: P2) => void): void {
    super.removeListener(handler);
  }

  override dispatch(p1: P1, p2: P2): void {
    super.dispatch(p1, p2);
  }
}
