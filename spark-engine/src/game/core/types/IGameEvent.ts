export interface IGameEvent<T extends unknown[] = any[]> {
  addListener: (handler: { (...args: T): void }) => void;
  removeListener: (handler: { (...args: T): void }) => void;
  removeAllListeners: () => void;
}
