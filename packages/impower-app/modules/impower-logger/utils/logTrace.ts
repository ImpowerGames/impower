/**
 * Prints to `stderr` the string 'Trace :', followed by the {@link util.format()} formatted message and stack trace to the current position in the code.
 */
const logTrace = (message?: unknown, ...optionalParams: unknown[]): void => {
  // eslint-disable-next-line no-console
  console.trace(message, optionalParams);
};

export default logTrace;
