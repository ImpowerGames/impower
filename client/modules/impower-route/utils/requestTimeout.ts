export const requestTimeout = (call: () => unknown, delay: number): number => {
  const start = new Date().getTime();
  const loop = (): void => {
    const current = new Date().getTime();
    if (current - start >= delay) {
      call();
    } else {
      window.requestAnimationFrame(loop);
    }
  };
  return window.requestAnimationFrame(loop);
};

export const clearRequestTimeout = (handle: number): void => {
  window.cancelAnimationFrame(handle);
};
