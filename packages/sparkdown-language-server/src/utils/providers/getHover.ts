import { MarkupKind, type Hover, type Position } from "vscode-languageserver";
import { type TextDocument } from "vscode-languageserver-textdocument";

import { type SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { SparkdownAnnotations } from "@impower/sparkdown/src/classes/SparkdownCombinedAnnotator";
import { getExpectedSelectorTypes } from "@impower/sparkdown/src/utils/getExpectedSelectorTypes";
import { resolveSelector } from "@impower/sparkdown/src/utils/resolveSelector";
import { SparkdownCompilerConfig } from "@impower/sparkdown/src/types/SparkdownCompilerConfig";

export const getHover = (
  document: TextDocument | undefined,
  annotations: SparkdownAnnotations | undefined,
  program: SparkProgram | undefined,
  config: SparkdownCompilerConfig | undefined,
  position: Position
): Hover | null => {
  if (!document || !annotations || !program) {
    return null;
  }
  let result: Hover | null = null;
  const searchFrom = document.offsetAt(position);
  const searchTo = document.offsetAt({ line: position.line + 1, character: 0 });
  annotations.references.between(searchFrom, searchTo, (from, to, value) => {
    if (result != null) {
      return false;
    }
    const range = {
      start: document.positionAt(from),
      end: document.positionAt(to),
    };
    const hoveredOffset = document.offsetAt(position);
    if (
      hoveredOffset >= document.offsetAt(range.start) &&
      hoveredOffset <= document.offsetAt(range.end)
    ) {
      const reference = value.type;
      if (reference.selector) {
        const [resolvedValue] = resolveSelector<any>(
          program,
          reference.selector,
          getExpectedSelectorTypes(program, reference.declaration, config)
        );
        if (resolvedValue !== undefined) {
          if (resolvedValue !== undefined) {
            if (
              typeof resolvedValue === "object" &&
              "$type" in resolvedValue &&
              typeof resolvedValue.$type === "string"
            ) {
              const type = resolvedValue.$type;
              const src =
                type === "filtered_image"
                  ? resolvedValue?.filtered_src
                  : type === "layered_image"
                  ? resolvedValue?.assets?.[0]?.src
                  : type === "image"
                  ? resolvedValue?.src
                  : undefined;
              if (src) {
                result = {
                  contents: {
                    kind: MarkupKind.Markdown,
                    value: `<img src="${src}" width="300px" />`,
                  },
                  range,
                };
                return false;
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
    return undefined;
  });
  return result;
};
