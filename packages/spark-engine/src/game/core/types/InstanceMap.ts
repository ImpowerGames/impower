export type InstanceMap<
  T extends Record<string, abstract new (...args: any) => any>
> = {
  [K in keyof T]: InstanceType<T[K]>;
};
