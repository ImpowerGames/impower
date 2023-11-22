import type { SparkParserContext } from "../../../../../sparkdown/src/types/SparkParserContext";
import { parseBeatmap } from "./parseBeatmap";

const NAME_REGEX = /[_a-zA-Z]+[_a-zA-Z0-9]*/;

export const last = function <T>(array: T[]): T {
  return array[array.length - 1] as T;
};

export const processBeatmap = (
  context: SparkParserContext
): { type: string } | undefined => {
  const scope = last(context.scopes);
  const from = context.from;
  const to = context.to;
  const line = context.line;
  const text = context.text;
  const trimmedText = text.trim();
  const rows = scope?.data?.["rows"];
  const name = scope?.data?.["name"];
  const declarations = context.declarations;
  if (Array.isArray(rows)) {
    if (trimmedText.startsWith("~~~")) {
      context.scopes.pop();
      if (typeof name === "string") {
        const declaration = declarations.structs?.[name];
        if (declaration) {
          const beats = parseBeatmap(rows);
          if (!declaration.fields) {
            declaration.fields = {};
          }
          beats.forEach((beat, i) => {
            Object.entries(beat).forEach(([k, v]) => {
              if (k !== "line" && k !== "from" && k !== "to") {
                declaration.fields[`.beats.${i}.${k}`] = {
                  from: declaration.from + (beat.from || 0),
                  to: declaration.from + (beat.to || 0),
                  line: declaration.line + (beat.line || 0),
                  name: k,
                  type: typeof v,
                  valueText: String(v),
                  value: v,
                  struct: name,
                };
              }
            });
          });
        }
      }
      return { type: "beatmap_end" };
    }
    if (name === undefined) {
      const structName = NAME_REGEX.test(trimmedText) ? trimmedText : "";
      scope.data["name"] = structName;
      if (typeof structName === "string") {
        if (!declarations.structs) {
          declarations.structs = {};
        }
        declarations.structs[structName] = {
          from,
          to,
          line,
          name: structName,
          base: "",
          type: "Beatmap",
          fields: {},
        };
      }
      return { type: "beatmap_name" };
    }
    if (!scope.data["rows"]) {
      scope.data["rows"] = [];
    }
    if (Array.isArray(scope.data["rows"])) {
      scope.data["rows"].push({ text, line, from, to });
    }
    return { type: "beatmap_row" };
  } else if (trimmedText.startsWith("~~~")) {
    context.scopes.push({
      type: "beatmap",
      data: {
        name: undefined,
        rows: [],
        from,
        to,
        line,
      },
    });
    return { type: "beatmap_start" };
  }
  return undefined;
};
