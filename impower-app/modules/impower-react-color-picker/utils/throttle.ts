const throttle = <T extends (...args: any[]) => void>(
  callback: T,
  delay: number
) => {
  let inThrottle: boolean;
  let lastFn: ReturnType<typeof setTimeout>;
  let lastTime: number;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      callback(args);
      lastTime = Date.now();
      inThrottle = true;
    } else {
      clearTimeout(lastFn);
      lastFn = setTimeout(() => {
        if (Date.now() - lastTime >= delay) {
          callback(args);
          lastTime = Date.now();
        }
      }, Math.max(delay - (Date.now() - lastTime), 0));
    }
  };
};

export default throttle;
