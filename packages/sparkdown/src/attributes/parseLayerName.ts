import type { ParsedLayerName } from "./types";

export const ATTRIBUTE_WORD = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

export const parseLayerName = (source: string): ParsedLayerName => {
  const result: ParsedLayerName = {
    label: "",
    conditions: [],
    default: false,
    diagnostics: [],
  };
  const invalid = (message: string, code = "invalid-layer-name") => {
    result.diagnostics.push({
      code,
      message,
      severity: "warning",
      layer: source,
    });
    return result;
  };
  let name = source;
  if (name.startsWith("_")) {
    const end = name.indexOf("_", 1);
    if (end < 0) return invalid(`Layer "${source}" has no closing underscore.`);
    name = name.slice(1, end);
  }
  if (name.includes(":") && name.includes("~")) {
    return invalid(
      `Layer "${source}" mixes ':' and '~'. Use one separator.`,
      "mixed-layer-separators",
    );
  }
  const parts = name.split(/[:~]/);
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
      // An invalid name is never partially interpreted as a different condition.
      result.conditions = [];
      return invalid(
        `Layer "${source}" has invalid condition "${part}"; write group.option and put default last.`,
      );
    }
    result.conditions.push({ group, options: [...new Set(options)] });
  }
  return result;
};
