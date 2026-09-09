import { matchesAttributeOption, resolveAttributes } from "./resolveAttributes";
import type {
  AttributeDiagnostic,
  AttributeFolder,
  AttributeLayer,
  AttributeSelection,
  AttributeVocabulary,
} from "./types";
import { ATTRIBUTE_ROOT } from "./vocabulary";

export const evaluateAttributeVisibility = (
  vocabulary: AttributeVocabulary,
  requestedSelection: AttributeSelection,
): { visible: Record<string, boolean>; diagnostics: AttributeDiagnostic[] } => {
  const visible: Record<string, boolean> = Object.create(null);
  const { selection, diagnostics } = resolveAttributes(
    vocabulary,
    Object.entries(requestedSelection).map(
      ([group, option]) => `${group}.${option}`,
    ),
  );
  const layers = new Map(vocabulary.layers.map((layer) => [layer.key, layer]));
  const visiting = new Set<string>();
  const choices = (group: string, folder: string): string[] => {
    if (Object.hasOwn(selection, group)) return [selection[group]!];
    const seen = new Set<string>();
    let key: string | undefined = folder;
    while (key && !seen.has(key)) {
      seen.add(key);
      const scope: AttributeFolder | undefined = vocabulary.folders[key];
      if (
        scope &&
        Object.hasOwn(scope.defaults, group) &&
        scope.defaults[group]?.length
      )
        return scope.defaults[group]!;
      key = scope?.parent;
    }
    return vocabulary.groups[group]?.switch ? ["off"] : [];
  };
  const visit = (layer: AttributeLayer): boolean => {
    if (Object.hasOwn(visible, layer.key)) return visible[layer.key]!;
    if (visiting.has(layer.key)) return false;
    visiting.add(layer.key);
    const parent = layers.get(layer.parent);
    const shown =
      (!parent || visit(parent)) &&
      layer.parsed.conditions.every((condition) =>
        choices(condition.group, layer.parent).some((selected) =>
          condition.options.some((option) =>
            matchesAttributeOption(selected, option),
          ),
        ),
      );
    visiting.delete(layer.key);
    visible[layer.key] = shown;
    return shown;
  };
  for (const layer of vocabulary.layers) visit(layer);
  for (const [key, scope] of Object.entries(vocabulary.folders)) {
    if (key !== ATTRIBUTE_ROOT && !visible[key]) continue;
    for (const [group, options] of Object.entries(scope.options)) {
      if (options.length && !vocabulary.groups[group]?.switch && !choices(group, key).length) {
        diagnostics.push({
          code: "missing-folder-default", severity: "warning", group,
          folder: scope.name,
          path: key,
          message: 'Folder "' + scope.name + '" has no resting choice for ' + group + '; its layers are hidden. Mark one ' + group + ' layer :default or select ' + group + '.' + options[0] + ' in the script.',
        });
      }
    }
    if (
      Object.hasOwn(selection, "look") &&
      Object.hasOwn(scope.options, "look") &&
      scope.options["look"]?.length &&
      choices("eyes", key).includes("closed")
    ) {
      diagnostics.push({
        code: "look-with-closed-eyes",
        severity: "warning",
        group: "look",
        folder: scope.name,
        path: key,
        attribute: `look.${selection["look"]}`,
        message: `Folder "${scope.name}" has closed eyes, so look.${selection["look"]} is not visible. Select eyes.open to show the pupils.`,
      });
    }
  }
  return { visible, diagnostics };
};
