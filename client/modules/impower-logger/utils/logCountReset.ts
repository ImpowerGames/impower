/**
 * Resets the internal counter specific to `label`.
 */
const logCountReset = (label?: string): void => {
  // eslint-disable-next-line no-console
  console.countReset(label);
};

export default logCountReset;
