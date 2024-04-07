export type SpecComponentConstructor = {
  new (...params: any[]): HTMLElement;
  readonly tag?: string;
};
