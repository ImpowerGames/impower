import _set from "lodash/set";

const mutateValue = <T extends object>( // eslint-disable-line @typescript-eslint/ban-types
  object: T,
  path: string,
  value: unknown
): void => {
  _set(object, path, value);
};

export default mutateValue;
