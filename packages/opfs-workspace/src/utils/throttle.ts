const throttle = <T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): T => {
  let lastTime = 0;
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastTime >= (delay ?? 0)) {
      callback(...args);
      lastTime = now;
    }
  }) as T;
};

export default throttle;
