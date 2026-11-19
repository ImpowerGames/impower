import type { ParsedLayerName } from "./types";

export const ATTRIBUTE_WORD = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

const LOOK_ALIKE_SPACE = /[^\S \t]|[᠎​⁠]/u;

const trimSpaces = (text: string) => text.replace(/^ +| +$/g, "");

export const parseLayerName = (source: string): ParsedLayerName => {
  const result: ParsedLayerName = {
    label: "",
    conditions: [],
    default: false,
    diagnostics: [],
  };
  const invalid = (message: string) => {
    result.diagnostics.push({
      code: "invalid-layer-name",
      message,
      severity: "warning",
      layer: source,
    });
    return result;
  };
  if (LOOK_ALIKE_SPACE.test(source)) {
    return invalid(
      `Layer "${source}" holds a space character that is not an ordinary space. Separate its words with ordinary spaces.`,
    );
  }
  let name = trimSpaces(source.replaceAll("\t", " "));
  if (name.startsWith("_")) {
    const end = name.indexOf("_", 1);
    if (end < 0) return invalid(`Layer "${source}" has no closing underscore.`);
    name = trimSpaces(name.slice(1, end));
  }
  const parts = name.split(/ +/);
  if (parts.length > 1 && parts[parts.length - 1] === "default") {
    result.default = true;
    parts.pop();
  }
  if (!parts[0]?.includes(".")) {
    result.label = parts.shift() ?? "";
    if (!ATTRIBUTE_WORD.test(result.label)) {
      return invalid(
        `Layer "${source}" needs a plain name or group.option condition; use hyphens inside words.`,
      );
    }
  }
  for (const part of parts) {
    const [group, ...options] = part.split(".");
    if (
      !group ||
      !ATTRIBUTE_WORD.test(group) ||
      !options.length ||
      options.some((option) => !ATTRIBUTE_WORD.test(option))
    ) {
      result.conditions = [];
      return invalid(
        `Layer "${source}" has invalid condition "${part}"; write group.option and put default last.`,
      );
    }
    result.conditions.push({ group, options: [...new Set(options)] });
  }
  return result;
};
