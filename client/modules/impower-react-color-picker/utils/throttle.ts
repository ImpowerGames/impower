export const throttle = (
  callback: (...args: any[]) => void,
  delay: number
): ((...args: any[]) => void) => {
  let flag = true;
  return (): void => {
    if (flag) {
      callback();
      flag = false;
      window.setTimeout(() => {
        flag = true;
      }, delay);
    }
  };
};
