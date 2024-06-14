export const combineBuiltins = (...moduleBuiltins: any[]) => {
  const builtins: any = {};
  if (moduleBuiltins) {
    for (const [k, v] of Object.entries(moduleBuiltins)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        builtins[k] ??= {};
        for (const [name, value] of Object.entries(v)) {
          if (builtins[k][name] === undefined) {
            builtins[k][name] = value;
          }
        }
      } else {
        if (builtins[k] === undefined) {
          builtins[k] = v;
        }
      }
    }
  }
  return builtins;
};
