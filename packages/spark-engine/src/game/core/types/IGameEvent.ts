export interface IGameEvent<
  T0 extends unknown = any,
  T1 extends unknown = any,
  T2 extends unknown = any,
  T3 extends unknown = any,
  T4 extends unknown = any
> {
  addListener: (handler: {
    (arg0?: T0, arg1?: T1, arg2?: T2, arg3?: T3, arg4?: T4): void;
  }) => void;
  removeListener: (handler: {
    (arg0?: T0, arg1?: T1, arg2?: T2, arg3?: T3, arg4?: T4): void;
  }) => void;
  removeAllListeners: () => void;
}
