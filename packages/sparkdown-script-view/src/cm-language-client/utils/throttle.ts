const throttle = <T extends (...args: any[]) => any>(
  func: T,
  timeFrame?: number
): ((...args: any[]) => void) => {
  let lastTime = 0;
  return (...args: any[]): void => {
    const now = Date.now();
    if (now - lastTime >= (timeFrame ?? 0)) {
      func(...args);
      lastTime = now;
    }
  };
};

export default throttle;
