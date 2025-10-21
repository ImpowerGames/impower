import { clone } from "./clone";

export function cloneBuiltinStructs(
  context: any,
  builtinDefinitions: { [type: string]: { [name: string]: any } } | undefined
) {
  const builtins = builtinDefinitions;
  if (builtins) {
    for (const [type, structs] of Object.entries(builtins)) {
      for (const [name, struct] of Object.entries(structs)) {
        context[type] ??= {};
        context[type][name] ??= clone(struct);
      }
    }
  }
}
