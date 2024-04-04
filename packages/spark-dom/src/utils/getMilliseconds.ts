const MILLISECONDS_REGEX = /((?:\d*[.])?\d+)ms/;
const SECONDS_REGEX = /((?:\d*[.])?\d+)s/;

export const getMilliseconds = (val: string): number | null | undefined => {
  if (val == null) {
    return val;
  }
  const numValue = Number(val);
  if (!Number.isNaN(numValue)) {
    return numValue;
  }
  const msMatch = val.match(MILLISECONDS_REGEX);
  if (msMatch) {
    const msVal = msMatch[1];
    const msNumValue = Number(msVal);
    if (!Number.isNaN(msNumValue)) {
      return msNumValue;
    }
  }
  const sMatch = val.match(SECONDS_REGEX);
  if (sMatch) {
    const sVal = sMatch[1];
    const sNumValue = Number(sVal);
    if (!Number.isNaN(sNumValue)) {
      return sNumValue * 1000;
    }
  }
  return undefined;
};
