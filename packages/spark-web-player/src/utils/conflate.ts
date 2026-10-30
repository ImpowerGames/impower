const isSameArgs = (p: any[], n: any[]) =>
  p.length === n.length && p.every((v, i) => Object.is(v, n[i]));

export function conflate<F extends (...args: any[]) => any>(
  fn: F,
  memoize: boolean,
) {
  type Result = Awaited<ReturnType<F>>;
  type Waiter = { resolve: (v: Result) => void; reject: (e?: unknown) => void };

  let running = false;

  let hasPending = false;
  let pendingArgs!: Parameters<F>;
  let pendingThis: any;
  let nextWaiters: Waiter[] = [];

  let lastArgs!: Parameters<F>;
  let lastOutcome:
    | { status: "fulfilled"; value: Result }
    | { status: "rejected"; reason: unknown }
    | undefined;

  const startRun = (
    thisArg: any,
    resolveGroup: Waiter[] | undefined,
    ...args: Parameters<F>
  ): Promise<Result> => {
    running = true;
    lastArgs = args;
    lastOutcome = undefined;

    const p: Promise<Result> = (async () => fn.apply(thisArg, args))()
      .then((value) => {
        lastOutcome = { status: "fulfilled", value };
        resolveGroup?.forEach((w) => w.resolve(value));
        return value;
      })
      .catch((reason) => {
        lastOutcome = { status: "rejected", reason };
        resolveGroup?.forEach((w) => w.reject(reason));
        throw reason;
      });

    p.finally(() => {
      if (hasPending) {
        const nextArgs = pendingArgs;
        const nextThis = pendingThis;
        hasPending = false;
        const wg = nextWaiters;
        nextWaiters = [];

        if (
          memoize &&
          isSameArgs(lastArgs, nextArgs) &&
          lastOutcome
        ) {
          if (lastOutcome.status === "fulfilled") {
            const value = lastOutcome.value;
            wg.forEach((w) => w.resolve(value));
          } else {
            const reason = lastOutcome.reason;
            wg.forEach((w) => w.reject(reason));
          }
          running = false;
          return;
        }

        startRun(nextThis, wg, ...nextArgs);
      } else {
        running = false;
      }
    });

    return p;
  };

  return function (this: any, ...args: Parameters<F>): Promise<Result> {
    if (!running) {
      return startRun(this, undefined, ...args);
    }

    pendingArgs = args;
    pendingThis = this;
    hasPending = true;

    return new Promise<Result>((resolve, reject) =>
      nextWaiters.push({ resolve, reject }),
    );
  };
}
