export const debounce = <T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): T => {
  let timeout: NodeJS.Timeout | undefined = undefined;
  return ((...args: Parameters<T>) => {
    if (timeout != null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      callback(...args);
    }, delay);
  }) as T;
};
