export const debounce = <T extends (...args: any[]) => void>(
  callback: T,
  delay: number,
): T & { flush(): void } => {
  let timeout = 0;
  let pending: (() => void) | undefined;
  const flush = () => {
    clearTimeout(timeout);
    const run = pending;
    pending = undefined;
    run?.();
  };
  const debounced = (...args: Parameters<T>) => {
    clearTimeout(timeout);
    pending = () => callback(...args);
    timeout = window.setTimeout(flush, delay);
  };
  return Object.assign(debounced as T, { flush });
};
