export class GameEvent<T = undefined> {
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

  public emit(data?: T): void {
    this.handlers.slice(0).forEach((h) => h(data as T));
  }
}
