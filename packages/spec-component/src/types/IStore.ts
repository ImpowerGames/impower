export interface IStore<T = any> {
  event: string;
  target: EventTarget;
  current: T;
}
