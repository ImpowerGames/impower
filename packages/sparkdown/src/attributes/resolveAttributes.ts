import { ATTRIBUTE_WORD } from "./parseLayerName";
import type {
  AttributeDiagnostic,
  AttributeSelection,
  AttributeVocabulary,
} from "./types";

export const matchesAttributeOption = (
  selection: string,
  option: string,
): boolean => selection === option || selection.startsWith(`${option}-`);

export const resolveAttributes = (
  vocabulary: AttributeVocabulary,
  attributes: readonly string[],
  initial: AttributeSelection = {},
): { selection: AttributeSelection; diagnostics: AttributeDiagnostic[] } => {
  const selection: AttributeSelection = Object.create(null);
  const diagnostics: AttributeDiagnostic[] = [];
  const accepts = (group: string, option: string) => {
    const entry = Object.hasOwn(vocabulary.groups, group)
      ? vocabulary.groups[group]
      : undefined;
    return (
      !!entry &&
      ((entry.switch && (option === "on" || option === "off")) ||
        entry.options.some((candidate) =>
          matchesAttributeOption(option, candidate),
        ))
    );
  };
  for (const [group, option] of Object.entries(initial))
    if (accepts(group, option)) selection[group] = option;
  for (const attribute of attributes) {
    const parts = attribute.split(".");
    const first = parts[0] ?? "";
    let groups: string[] = [];
    let option = "";
    if (parts.every((part) => ATTRIBUTE_WORD.test(part))) {
      if (parts.length === 2) {
        option = parts[1]!;
        if (accepts(first, option)) groups = [first];
      } else if (parts.length === 1) {
        if (
          Object.hasOwn(vocabulary.groups, first) &&
          vocabulary.groups[first]?.switch
        ) {
          groups = [first];
          option = "on";
        } else {
          option = first;
          groups = Object.keys(vocabulary.groups).filter((group) =>
            accepts(group, option),
          );
          if (
            groups.length > 1 &&
            !(
              groups.length === 2 &&
              groups.includes("face") &&
              groups.includes("eyebrows")
            )
          ) {
            diagnostics.push({
              code: "ambiguous-attribute",
              severity: "warning",
              attribute,
              message: `Attribute "${attribute}" selects unrelated groups ${groups.join(", ")}; write ${groups.map((group) => `${group}.${option}`).join(" or ")} explicitly.`,
            });
          }
        }
      }
    }
    if (!groups.length) {
      diagnostics.push({
        code: "unknown-attribute",
        severity: "warning",
        attribute,
        message: `This image has no attribute "${attribute}". The attribute is ignored.`,
      });
    }
    for (const group of groups) selection[group] = option;
  }
  return { selection, diagnostics };
};
