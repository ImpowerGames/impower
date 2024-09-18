const MILLISECONDS_REGEX = /((?:\d*[.])?\d+)ms/;
const SECONDS_REGEX = /((?:\d*[.])?\d+)s/;

export const getSeconds = (value: string): number | undefined => {
  const numValue = Number(value);
  if (!Number.isNaN(numValue)) {
    return numValue;
  }
  const msMatch = value.match(MILLISECONDS_REGEX);
  if (msMatch) {
    const msVal = msMatch[1];
    const msNumValue = Number(msVal);
    if (!Number.isNaN(msNumValue)) {
      return msNumValue / 1000;
    }
  }
  const sMatch = value.match(SECONDS_REGEX);
  if (sMatch) {
    const sVal = sMatch[1];
    const sNumValue = Number(sVal);
    if (!Number.isNaN(sNumValue)) {
      return sNumValue;
    }
  }
  return undefined;
};

export const getTimeValue = (
  value: string | number | undefined,
  defaultValue = undefined
): number | undefined => {
  if (typeof value === "number") {
    return value;
  }
  const num = Number(value);
  if (!Number.isNaN(num)) {
    return num;
  }
  if (typeof value === "string") {
    return getSeconds(value);
  }
  return defaultValue;
};
