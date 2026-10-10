/** Define an authored entry without invoking Object.prototype setters. */
export const setContextEntry = (
  context: { [type: string]: { [name: string]: any } },
  type: string,
  name: string,
  value: any,
): void => {
  if (!Object.hasOwn(context, type)) {
    Object.defineProperty(context, type, {
      value: {}, enumerable: true, configurable: true, writable: true,
    });
  }
  Object.defineProperty(context[type], name, {
    value, enumerable: true, configurable: true, writable: true,
  });
};
