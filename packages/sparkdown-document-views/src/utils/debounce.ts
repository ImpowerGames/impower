export type Debounced<T extends (...args: any[]) => void> = T & {
  cancel: () => void;
};

const debounce = <T extends (...args: any[]) => void>(
  callback: T,
  delay: number,
): Debounced<T> => {
  let timeout = 0;
  const debounced = ((...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = window.setTimeout(() => {
      callback(...args);
    }, delay);
  }) as Debounced<T>;
  debounced.cancel = () => {
    clearTimeout(timeout);
  };
  return debounced;
};

export default debounce;
