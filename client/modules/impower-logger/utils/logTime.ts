/**
 * Starts a timer that can be used to compute the duration of an operation. Timers are identified by a unique `label`.
 */
const logTime = (label?: string): void => {
  // eslint-disable-next-line no-console
  console.time(label);
};

export default logTime;
