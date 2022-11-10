export interface IGameEvent<T = any> {
  addListener: (handler: { (data: T): void }) => void;
  removeListener: (handler: { (data: T): void }) => void;
  removeAllListeners: () => void;
}
