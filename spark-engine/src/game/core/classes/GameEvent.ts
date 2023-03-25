import { IGameEvent } from "../types/IGameEvent";

export class GameEvent<T extends unknown[] = any[]> implements IGameEvent<T> {
  constructor() {}

  private handlers: { (...args: T): void }[] = [];

  public addListener(handler: { (...args: T): void }): void {
    this.handlers.push(handler);
  }

  public removeListener(handler: { (...args: T): void }): void {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }

  public removeAllListeners(): void {
    this.handlers = [];
  }

  public emit(...args: T): void {
    this.handlers.slice(0).forEach((h) => h(...args));
  }
}
