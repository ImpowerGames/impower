import { GameEvent } from "./GameEvent";

export class GameEvent3<P1, P2, P3> extends GameEvent {
  override addListener(handler: (p1: P1, p2: P2, p3: P3) => void): void {
    super.addListener(handler);
  }

  override removeListener(handler: (p1: P1, p2: P2, p3: P3) => void): void {
    super.removeListener(handler);
  }

  override dispatch(p1: P1, p2: P2, p3: P3): void {
    super.dispatch(p1, p2, p3);
  }
}
