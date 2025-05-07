export const throttle = (fn: (...args: any[]) => void, limit: number) => {
  let inThrottle: boolean;
  let lastArgs: any[];
  return function (...args: any[]) {
    lastArgs = args;
    if (!inThrottle) {
      fn(...lastArgs);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs) fn(...lastArgs);
      }, limit);
    }
  };
};
