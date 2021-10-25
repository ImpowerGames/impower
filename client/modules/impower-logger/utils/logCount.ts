/**
 * Maintains an internal counter specific to `label` and outputs to `stdout` the number of times `console.count()` has been called with the given `label`.
 */
const logCount = (label?: string): void => {
  // eslint-disable-next-line no-console
  console.count(label);
};

export default logCount;
