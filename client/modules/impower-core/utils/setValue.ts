import _set from "lodash/fp/set";

// eslint-disable-next-line @typescript-eslint/ban-types
const setValue = <T extends object>(
  object: T,
  path: string,
  value: unknown
): T => _set(path, value, object);

export default setValue;
