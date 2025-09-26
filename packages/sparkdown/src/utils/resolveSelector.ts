import { SparkProgram } from "../types/SparkProgram";
import { SparkSelector } from "../types/SparkSelector";
import { selectProperty } from "./selectProperty";
import { sortFilteredName } from "./sortFilteredName";

export const resolveSelector = <T>(
  program: SparkProgram,
  selector: SparkSelector,
  expectedSelectorTypes: string[]
): [T | undefined, string | undefined] => {
  // Validate that reference resolves to existing an struct
  const searchSelectorTypes =
    selector.types && selector.types.length > 0
      ? selector.types
      : expectedSelectorTypes;
  if (searchSelectorTypes) {
    for (const selectorType of searchSelectorTypes) {
      if (selector.name) {
        const selectorPath = `${selectorType}.${sortFilteredName(
          selector.name
        )}`;
        const [obj, foundPath] = selectProperty(
          program.context,
          selectorPath,
          selector.fuzzy
        );
        if (obj !== undefined) {
          return [obj as T, foundPath];
        }
      } else if (selector.property && selector.value) {
        for (const [name, struct] of Object.entries(
          program.context?.[selectorType] || {}
        )) {
          const selectorPath = `${selectorType}.${sortFilteredName(name)}.${
            selector.property
          }`;
          const [propValue] = selectProperty(
            program.context,
            selectorPath,
            selector.fuzzy
          );
          if (propValue !== undefined && propValue === selector.value) {
            return [struct as T, `${selectorType}.${name}`];
          }
        }
      } else {
        const selectorPath = selectorType;
        const [obj, foundPath] = selectProperty(
          program.context,
          selectorPath,
          selector.fuzzy
        );
        if (obj !== undefined) {
          return [obj as T, foundPath];
        }
      }
    }
  }
  return [undefined, undefined];
};
