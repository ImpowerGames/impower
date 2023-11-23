const setProperty = (
  obj: any,
  propertyPath: string,
  value: unknown,
  skip?: (curr: any, key: string) => boolean
): { successfullySet: string; error: boolean } => {
  const successfullySetParts: string[] = [];
  let error = false;
  let curr = obj;
  const keys = propertyPath.split(".");
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i]!;
    if (typeof curr === "object" && key !== "") {
      if (i === keys.length - 1) {
        if (Array.isArray(curr) && Number.isNaN(Number(key))) {
          error = true;
          break;
        }
        if (skip?.(curr, key)) {
          break;
        }
        curr[key] = value;
      } else {
        if (curr[key] == null || typeof curr[key] !== "object") {
          if (Array.isArray(curr) && Number.isNaN(Number(key))) {
            error = true;
            break;
          }
          if (skip?.(curr, key)) {
            break;
          }
          const nextKey = keys[i + 1];
          const isArray = !Number.isNaN(Number(nextKey));
          curr[key] = isArray ? [] : {};
        }
        curr = curr[key];
      }
    }
    successfullySetParts.push(key);
  }
  return { successfullySet: successfullySetParts.join("."), error };
};

export default setProperty;
