const throttle = <T extends (...args: unknown[]) => unknown>(
  func: T,
  timeFrame?: number
): ((...args: unknown[]) => void) => {
  let lastTime = 0;
  return (...args: unknown[]): void => {
    const now = Date.now();
    if (now - lastTime >= (timeFrame ?? 0)) {
      func(...args);
      lastTime = now;
    }
  };
};

export default throttle;
