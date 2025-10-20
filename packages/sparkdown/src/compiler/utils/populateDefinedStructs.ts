import { clone } from "./clone";
import { profile } from "./profile";
import { setProperty } from "./setProperty";
import { traverse } from "./traverse";

export function populateDefinedStructs(
  context: {
    [type: string]: { [name: string]: any };
  },
  contextPropertyRegistry: {
    [type: string]: { [name: string]: { [propertyPath: string]: any } };
  },
  structDefinitions: Record<string, any>,
  builtinDefinitions: { [type: string]: { [name: string]: any } } | undefined
) {
  profile("start", "populateDefinedStructs");
  if (structDefinitions) {
    for (const [type, structs] of Object.entries(structDefinitions)) {
      context[type] ??= {};
      for (const [name, definedStruct] of Object.entries(structs)) {
        if (Array.isArray(definedStruct)) {
          context[type][name] = [...definedStruct];
        } else {
          const isSpecialDefinition =
            name.startsWith("$") && name !== "$default";
          let constructed = {} as any;
          if (type === "config" || isSpecialDefinition) {
            constructed = context[type][name] ?? {};
          }
          if (!isSpecialDefinition) {
            const builtinDefaultStruct =
              builtinDefinitions?.[type]?.["$default"];
            if (builtinDefaultStruct) {
              traverse(builtinDefaultStruct, (propPath, propValue) => {
                const clonedValue = clone(propValue);
                setProperty(constructed, propPath, clonedValue);
                contextPropertyRegistry[type] ??= {};
                contextPropertyRegistry[type][name] ??= {};
                contextPropertyRegistry[type][name][propPath] = clonedValue;
              });
            }
            const definedDefaultStruct = structs?.["$default"];
            if (definedDefaultStruct) {
              traverse(definedDefaultStruct, (propPath, propValue) => {
                let redirectedPropPath =
                  propPath === ".link" || propPath.startsWith(".link.")
                    ? propPath.replace(/^.link/, ".$link")
                    : propPath;
                const clonedValue = clone(propValue);
                setProperty(constructed, redirectedPropPath, clonedValue);
                contextPropertyRegistry[type] ??= {};
                contextPropertyRegistry[type][name] ??= {};
                contextPropertyRegistry[type][name][redirectedPropPath] =
                  clonedValue;
              });
            }
          }
          traverse(definedStruct, (propPath, propValue) => {
            const clonedValue = clone(propValue);
            setProperty(constructed, propPath, clonedValue);
            contextPropertyRegistry[type] ??= {};
            contextPropertyRegistry[type][name] ??= {};
            contextPropertyRegistry[type][name][propPath] = clonedValue;
            if (type === "layout") {
              // Support fuzzy matches for layout
              const fuzzyType = type + ".";
              const layers = propPath.split(".");
              for (const layer of layers) {
                const classNames = layer.split(" ");
                for (const className of classNames) {
                  contextPropertyRegistry[fuzzyType] ??= {};
                  contextPropertyRegistry[fuzzyType][className] ??= {};
                }
              }
            }
          });
          constructed["$type"] = type;
          constructed["$name"] = name;
          context[type][name] = constructed;
        }
      }
    }
  }
  profile("end", "populateDefinedStructs");
}
