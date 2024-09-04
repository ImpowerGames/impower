export const combineBuiltins = (...allModuleBuiltins: any[]) => {
  const builtins: any = {};
  if (allModuleBuiltins) {
    for (const moduleBuiltins of allModuleBuiltins) {
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
  }
  return builtins;
};
