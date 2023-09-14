export interface IContext<T = Record<string, unknown>> {
  event: string;
  root: HTMLElement | Window;
  get: () => T;
  set: (v: T) => void;
}
