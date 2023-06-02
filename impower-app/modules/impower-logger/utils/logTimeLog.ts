/**
 * For a timer that was previously started by calling {@link console.time()}, prints the elapsed time and other `data` arguments to `stdout`.
 */
const logTimeLog = (label?: string, ...data: unknown[]): void => {
  // eslint-disable-next-line no-console
  console.timeLog(label, data);
};

export default logTimeLog;
