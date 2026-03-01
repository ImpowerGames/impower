import { traverse } from "./traverse";

export function indexStructs(
  propertyRegistry: {
    [type: string]: { [name: string]: { [propertyPath: string]: any } };
  },
  context: { [type: string]: { [name: string]: any } } | undefined,
) {
  if (context) {
    for (const [type, structs] of Object.entries(context)) {
      for (const [name, struct] of Object.entries(structs)) {
        traverse(struct, (propPath, propValue) => {
          propertyRegistry[type] ??= {};
          propertyRegistry[type][name] ??= {};
          propertyRegistry[type][name][propPath] = propValue;
          if (type === "screen") {
            const layers = propPath.split(".");
            for (const layer of layers) {
              const classNames = layer.split(" ");
              for (const className of classNames) {
                propertyRegistry["layer"] ??= {};
                propertyRegistry["layer"][className] ??= {};
              }
            }
          }
        });
      }
    }
  }
}
