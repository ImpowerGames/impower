import { LayoutVerb } from "../../../language/sparkdown.layout-verbs";
import type { SparkProgram } from "../types/SparkProgram";

export type LayoutDirectiveTargetType = "layout" | "screen";

export const layoutDirectiveTargetTypes = (control: string): readonly LayoutDirectiveTargetType[] =>
  control === LayoutVerb.navigate ? ["screen"] : ["layout", "screen"];

export const layoutDirectiveTargetNames = (
  program: SparkProgram | undefined,
  control: string,
): Map<string, LayoutDirectiveTargetType> => {
  const names = new Map<string, LayoutDirectiveTargetType>();
  for (const type of layoutDirectiveTargetTypes(control)) {
    const declared = type === "layout" ? program?.sparkle?.layouts : program?.sparkle?.screens;
    for (const name of Object.keys(declared ?? {})) {
      if (!name.startsWith("$") && !names.has(name)) {
        names.set(name, type);
      }
    }
  }
  return names;
};
