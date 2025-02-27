import { SparkProgram } from "../types/SparkProgram";
import { SparkSelector } from "../types/SparkSelector";
import { selectProperty } from "./selectProperty";

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
      const selectorPath = `${selectorType}.${selector.name}`;
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
  return [undefined, undefined];
};
