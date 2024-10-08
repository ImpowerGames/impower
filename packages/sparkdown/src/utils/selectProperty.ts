const selectProperty = <T>(
  obj: any,
  propertyPath: string,
  fuzzy?: boolean
): [T, string] => {
  if (!propertyPath) {
    return obj;
  }
  let found: string[] = [];
  let cur = obj;
  const parts = propertyPath.split(".");
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (cur === undefined) {
      return [cur, found.join(".")];
    }
    if (typeof cur !== "object") {
      return [cur, found.join(".")];
    }
    if (part) {
      // Continue to next part of path
      const next = cur[part];
      if (next === undefined) {
        return [cur, found.join(".")];
      }
      cur = next;
      found.push(part);
    } else {
      // Empty part is treated as a recursive wildcard
      let target = "";
      while (!target && i < parts.length - 1) {
        found.push(target);
        i += 1;
        target = parts[i] || "";
      }
      if (!target) {
        return [cur, found.join(".")];
      }
      const match = search(cur, target, fuzzy);
      if (match === undefined) {
        return [cur, found.join(".")];
      }
      cur = match;
      found.push(target);
    }
  }
  return [cur, found.join(".")];
};

const search = (
  obj: any,
  nameSelector: string,
  fuzzy: boolean | undefined
): any => {
  for (const [k, v] of Object.entries(obj)) {
    if (k === nameSelector) {
      return v;
    }
    if (fuzzy && k.split(" ").includes(nameSelector)) {
      return v;
    }
    if (v && typeof v === "object") {
      const match = search(v, nameSelector, fuzzy);
      if (match) {
        return match;
      }
    }
  }
  return undefined;
};

export default selectProperty;
