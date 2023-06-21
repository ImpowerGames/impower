export const contextEquivalent = (
  a: Record<string, string>,
  b: Record<string, string>
) => {
  if (a === b) {
    return true;
  }
  if (Object.keys(a).length !== Object.keys(b).length) {
    return false;
  }
  for (const key in a) {
    if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
};
