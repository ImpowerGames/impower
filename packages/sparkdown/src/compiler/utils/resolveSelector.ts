import { SparkdownCompilerState } from "../types/SparkdownCompilerState";
import { SparkProgram } from "../types/SparkProgram";
import { SparkSelector } from "../types/SparkSelector";
import { selectProperty } from "./selectProperty";

export const resolveSelector = <T>(
  program: SparkProgram,
  selector: SparkSelector,
  expectedSelectorTypes: string[],
  state?: SparkdownCompilerState
): [T | undefined, string | undefined] => {
  // Validate that reference resolves to existing an struct
  const searchSelectorTypes =
    selector.types && selector.types.length > 0
      ? selector.types
      : expectedSelectorTypes;
  if (searchSelectorTypes) {
    for (const selectorType of searchSelectorTypes) {
      if (selector.name) {
        const selectorName = selector.name;
        const selectorPath = `${selectorType}.${selectorName}`;
        if (state?.contextPropertyRegistry) {
          // Looking up exact value in contextPropertyRegistry is much faster than selecting it
          const exactMatch =
            state?.contextPropertyRegistry?.[selectorType]?.[selectorName];
          if (exactMatch !== undefined) {
            return [exactMatch as T, selectorPath];
          }
        } else {
          const [obj, foundPath] = selectProperty(
            program.context,
            selectorPath,
            selector.fuzzy
          );
          if (obj !== undefined) {
            return [obj as T, foundPath];
          }
        }
      } else if (selector.property && selector.value) {
        for (const [name, struct] of Object.entries(
          program.context?.[selectorType] || {}
        )) {
          const selectorName = name;
          const selectorProperty = selector.property;
          const selectorPath = `${selectorType}.${selectorName}.${selectorProperty}`;
          if (state?.contextPropertyRegistry) {
            // Looking up exact value in contextPropertyRegistry is much faster than selecting it
            const exactMatch =
              state?.contextPropertyRegistry?.[selectorType]?.[selectorName]?.[
                selectorProperty
              ];
            if (exactMatch !== undefined && exactMatch === selector.value) {
              return [struct as T, `${selectorType}.${name}`];
            }
          } else {
            const [propValue] = selectProperty(
              program.context,
              selectorPath,
              selector.fuzzy
            );
            if (propValue !== undefined && propValue === selector.value) {
              return [struct as T, `${selectorType}.${name}`];
            }
          }
        }
      } else {
        const selectorPath = selectorType;
        if (state?.contextPropertyRegistry) {
          // Looking up exact value in contextPropertyRegistry is much faster than selecting it
          const exactMatch = state?.contextPropertyRegistry?.[selectorType];
          if (exactMatch !== undefined) {
            return [exactMatch as T, selectorPath];
          }
        } else {
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
  }
  return [undefined, undefined];
};
