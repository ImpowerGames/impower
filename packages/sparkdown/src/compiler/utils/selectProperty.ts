const search = (
  obj: any,
  nameSelector: string,
  fuzzy: boolean | undefined,
  fieldPath: string = ""
): [any, string] => {
  for (const [k, v] of Object.entries(obj)) {
    const path = fieldPath ? `${fieldPath}.${k}` : k;
    if (k === nameSelector) {
      return [v, path];
    }
    if (fuzzy && k.split(" ").includes(nameSelector)) {
      return [v, path];
    }
    if (v && typeof v === "object") {
      const [matchValue, matchPath] = search(v, nameSelector, fuzzy, path);
      if (matchValue !== undefined) {
        return [matchValue, matchPath];
      }
    }
  }
  return [undefined, fieldPath];
};

export const selectProperty = <T>(
  obj: any,
  propertyPath: string,
  fuzzy?: boolean
): [T | undefined, string] => {
  if (!propertyPath) {
    return obj;
  }
  let found: string[] = [];
  let cur = obj;
  const parts = propertyPath.split(".");
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (cur === undefined) {
      return [undefined, found.join(".")];
    }
    if (typeof cur !== "object") {
      return [undefined, found.join(".")];
    }
    if (part) {
      // Continue to next part of path
      const next = cur[part];
      if (next === undefined) {
        return [undefined, found.join(".")];
      }
      cur = next;
      found.push(part);
    } else {
      // Empty part is treated as a recursive wildcard
      let target = "";
      while (!target && i < parts.length - 1) {
        i += 1;
        target = parts[i] || "";
      }
      if (!target) {
        return [undefined, found.join(".")];
      }
      const [matchValue, matchPath] = search(cur, target, fuzzy);
      if (matchValue === undefined) {
        return [undefined, found.join(".")];
      }
      cur = matchValue;
      found.push(...matchPath.split("."));
    }
  }
  return [cur, found.join(".")];
};
