import { Hover, MarkupKind, Position } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
import { getFencedCode } from "../format/getFencedCode";
import { getProperty } from "../../../../sparkdown/src/utils/getProperty";

export const getHover = (
  document: TextDocument | undefined,
  program: SparkProgram | undefined,
  position: Position
): Hover | null => {
  if (!document || !program) {
    return null;
  }
  const references = program?.references?.[document?.uri]?.[position.line];
  if (!references) {
    return null;
  }
  for (const reference of references) {
    const range = reference.range;
    const hoveredOffset = document.offsetAt(position);
    if (
      hoveredOffset >= document.offsetAt(range.start) &&
      hoveredOffset <= document.offsetAt(range.end)
    ) {
      const resolved = reference.resolved;
      if (resolved) {
        const value = getProperty<any>(program.context, resolved);
        if (value !== undefined) {
          if (
            typeof value === "object" &&
            "$type" in value &&
            typeof value.$type === "string"
          ) {
            const type = value.$type;
            const src =
              type === "filtered_image"
                ? value?.filtered_src
                : type === "layered_image"
                ? value?.assets?.[0]?.src
                : type === "image"
                ? value?.src
                : undefined;
            if (src) {
              return {
                contents: {
                  kind: MarkupKind.Markdown,
                  value: `<img src="${src}" width="300px" />`,
                },
                range,
              };
            }
          }
          // TODO: const name: type
          // TODO: var name: type
          // TODO: list name
          // TODO: define type.name
          // TODO: == knot
          // TODO: = stitch
          // TODO: - (label)
          // TODO: ~ temp name: type
          // TODO: ~ param name: type
        }
      }
    }
  }
  return null;
};
