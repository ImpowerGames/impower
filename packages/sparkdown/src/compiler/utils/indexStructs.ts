import { profile } from "./profile";
import { traverse } from "./traverse";

export function indexStructs(
  propertyRegistry: {
    [type: string]: { [name: string]: { [propertyPath: string]: any } };
  },
  context: { [type: string]: { [name: string]: any } } | undefined
) {
  profile("start", "indexStructs");
  if (context) {
    for (const [type, structs] of Object.entries(context)) {
      for (const [name, struct] of Object.entries(structs)) {
        traverse(struct, (propPath, propValue) => {
          propertyRegistry[type] ??= {};
          propertyRegistry[type][name] ??= {};
          propertyRegistry[type][name][propPath] = propValue;
          if (type === "layout") {
            // Support fuzzy matches for layout
            const fuzzyType = type + ".";
            const layers = propPath.split(".");
            for (const layer of layers) {
              const classNames = layer.split(" ");
              for (const className of classNames) {
                propertyRegistry[fuzzyType] ??= {};
                propertyRegistry[fuzzyType][className] ??= {};
              }
            }
          }
        });
      }
    }
  }
  profile("end", "indexStructs");
}
