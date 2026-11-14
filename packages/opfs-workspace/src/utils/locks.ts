const tails = new Map<string, Promise<void>>();

export const sharedLocks = () => globalThis.navigator?.locks;

export const withLock = <T>(name: string, task: () => Promise<T>): Promise<T> => {
  const locks = sharedLocks();
  if (locks) {
    return locks.request(name, task) as Promise<T>;
  }
  const run = (tails.get(name) ?? Promise.resolve()).then(task);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  tails.set(name, tail);
  void tail.then(() => {
    if (tails.get(name) === tail) {
      tails.delete(name);
    }
  });
  return run;
};

export const withSharedLock = <T>(
  name: string,
  task: () => Promise<T>,
): Promise<T> => {
  const locks = sharedLocks();
  return locks
    ? (locks.request(name, { mode: "shared" }, task) as Promise<T>)
    : task();
};
