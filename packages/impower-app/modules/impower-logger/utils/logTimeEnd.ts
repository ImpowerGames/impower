/**
 * Stops a timer that was previously started by calling {@link console.time()} and prints the result to `stdout`.
 */
const logTimeEnd = (label?: string): void => {
  // eslint-disable-next-line no-console
  console.timeEnd(label);
};

export default logTimeEnd;
