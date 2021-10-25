/**
 * A simple assertion test that verifies whether `value` is truthy.
 * If it is not, an `AssertionError` is thrown.
 * If provided, the error `message` is formatted using `util.format()` and used as the error message.
 */
const logAssert = (
  value: unknown,
  message?: string,
  ...optionalParams: unknown[]
): void => {
  // eslint-disable-next-line no-console
  console.assert(value, message, optionalParams);
};

export default logAssert;
