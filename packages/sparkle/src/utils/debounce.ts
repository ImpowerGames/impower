export const debounce = <T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): ((...args: any[]) => void) => {
  let timeout = 0;
  return (...args: any[]): void => {
    clearTimeout(timeout);
    timeout = window.setTimeout(() => {
      callback(...args);
    }, delay);
  };
};
