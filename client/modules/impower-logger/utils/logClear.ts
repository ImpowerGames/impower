/**
 * When `stdout` is a TTY, calling `console.clear()` will attempt to clear the TTY.
 * When `stdout` is not a TTY, this method does nothing.
 */
const logClear = (): void => {
  // eslint-disable-next-line no-console
  console.clear();
};

export default logClear;
