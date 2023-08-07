export const debounce = <T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): T => {
  let timeout = 0;
  return ((...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = window.setTimeout(() => {
      callback(...args);
    }, delay);
  }) as T;
};
