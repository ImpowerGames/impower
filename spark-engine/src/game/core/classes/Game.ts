import { ListenOnly } from "../types/ListenOnly";
import { GameEvent } from "./GameEvent";
import { Manager } from "./Manager";

export interface GameEvents extends Record<string, GameEvent> {
  onInit: GameEvent;
  onDestroy: GameEvent;
}

export abstract class Game {
  protected _events: GameEvents = {
    onInit: new GameEvent(),
    onDestroy: new GameEvent(),
  };

  public get events(): ListenOnly<GameEvents> {
    return this._events;
  }

  abstract managers(): Record<string, Manager>;

  init(): void {
    Object.values(this.managers()).forEach((m) => m.init());
    this._events.onInit.emit();
  }

  async start(): Promise<void> {
    await Promise.all(Object.values(this.managers()).map((m) => m.start()));
  }

  destroy(): void {
    this._events.onDestroy.emit();
    Object.values(this.managers()).forEach((m) => m.destroy());
  }

  serialize(): string {
    const saveData: Record<string, unknown> = {};
    Object.entries(this.managers()).forEach(([key, value]) => {
      saveData[key] = value.getSaveData();
    });
    return JSON.stringify(saveData);
  }
}
