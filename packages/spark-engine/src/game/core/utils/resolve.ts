export const resolve = <
  T,
  Store extends Record<string, T>,
  Context extends Record<string, Store>,
  TypeName extends keyof Context
>(
  context: Context,
  ref: string,
  possibleRoots: TypeName[]
) => {
  if (ref.includes(".")) {
    const [type, name] = ref.split(".");
    if (type && name) {
      const store = context[type];
      const resolved = store?.[ref];
      if (resolved !== undefined) {
        return resolved as Context[TypeName][keyof Context[TypeName]];
      }
    } else if (!type && name) {
      for (const type of possibleRoots) {
        const store = context[type];
        const resolved = store?.[ref];
        if (resolved !== undefined) {
          return resolved as Context[TypeName][keyof Context[TypeName]];
        }
      }
    }
  } else {
    for (const type of possibleRoots) {
      const store = context[type];
      const resolved = store?.[ref];
      if (resolved !== undefined) {
        return resolved as Context[TypeName][keyof Context[TypeName]];
      }
    }
  }
  return undefined;
};
