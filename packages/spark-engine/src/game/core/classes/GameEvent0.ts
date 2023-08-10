import { GameEvent } from "./GameEvent";

export class GameEvent0 extends GameEvent {
  override addListener(handler: () => void): void {
    super.addListener(handler);
  }

  override removeListener(handler: () => void): void {
    super.removeListener(handler);
  }

  override dispatch(): void {
    super.dispatch();
  }
}
