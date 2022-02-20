export class GameEvent<T = null> {
  private handlers: { (data: T): void }[] = [];

  public addListener(handler: { (data: T): void }): void {
    this.handlers.push(handler);
  }

  public removeListener(handler: { (data: T): void }): void {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }

  public removeAllListeners(): void {
    this.handlers = [];
  }

  public emit(data: T = null): void {
    this.handlers.slice(0).forEach((h) => h(data));
  }
}

export const isGameEvent = (obj: unknown): obj is GameEvent => {
  if (!obj) {
    return false;
  }
  const gameEvent = obj as GameEvent;
  return (
    gameEvent.addListener !== undefined &&
    gameEvent.removeListener !== undefined &&
    gameEvent.removeAllListeners !== undefined &&
    gameEvent.emit !== undefined
  );
};
