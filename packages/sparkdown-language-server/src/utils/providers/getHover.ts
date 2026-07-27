import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { SparkdownCompilerConfig } from "@impower/sparkdown/src/compiler/types/SparkdownCompilerConfig";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { filterImage } from "@impower/sparkdown/src/compiler/utils/filterImage";
import { getExpectedSelectorTypes } from "@impower/sparkdown/src/compiler/utils/getExpectedSelectorTypes";
import { getImagePreviewMarkup } from "@impower/sparkdown/src/compiler/utils/getImagePreviewSrc";
import { resolveSelector } from "@impower/sparkdown/src/compiler/utils/resolveSelector";
import { MarkupKind, type Hover, type Position } from "vscode-languageserver";

export const getHover = (
  document: SparkdownDocument | undefined,
  annotations: SparkdownAnnotations | undefined,
  program: SparkProgram | undefined,
  config: SparkdownCompilerConfig | undefined,
  position: Position,
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
    const range = document.range(from, to);
    const hoveredOffset = document.offsetAt(position);
    if (
      hoveredOffset >= document.offsetAt(range.start) &&
      hoveredOffset <= document.offsetAt(range.end)
    ) {
      const reference = value.type;
      if (reference.selectors) {
        let resolvedValue: any = undefined;
        for (const selector of reference.selectors) {
          const [resolved] = resolveSelector<any>(
            program,
            selector,
            getExpectedSelectorTypes(program, reference.assigned, config),
          );
          if (resolved) {
            resolvedValue = resolved;
          }
        }
        if (resolvedValue !== undefined) {
          if (
            typeof resolvedValue === "object" &&
            "$type" in resolvedValue &&
            typeof resolvedValue.$type === "string"
          ) {
            const type = resolvedValue.$type;
            for (const selector of reference.selectors) {
              if (
                selector.name &&
                (type === "filtered_image" || selector.name.includes("~")) &&
                program.context
              ) {
                filterImage(
                  program.context,
                  program.context?.["filtered_image"]?.[selector.name],
                );
              }
            }
            const preview = getImagePreviewMarkup(
              program.context,
              resolvedValue,
            );
            if (preview) {
              result = {
                contents: {
                  kind: MarkupKind.Markdown,
                  value: preview,
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
    return undefined;
  });
  return result;
};
