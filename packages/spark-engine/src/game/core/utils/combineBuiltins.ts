export const combineBuiltins = (...allModuleBuiltins: any[]) => {
  const builtins: any = {};
  if (allModuleBuiltins) {
    for (const moduleBuiltins of allModuleBuiltins) {
      for (const [type, structs] of Object.entries(moduleBuiltins)) {
        if (structs && typeof structs === "object" && !Array.isArray(structs)) {
          builtins[type] ??= {};
          for (const [name, value] of Object.entries(structs)) {
            if (builtins[type][name] === undefined) {
              builtins[type][name] = value;
            }
          }
        } else {
          if (builtins[type] === undefined) {
            builtins[type] = structs;
          }
        }
      }
    }
  }
  return builtins;
};
