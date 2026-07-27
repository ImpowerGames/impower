import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { SparkdownCompilerConfig } from "@impower/sparkdown/src/compiler/types/SparkdownCompilerConfig";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { filterImage } from "@impower/sparkdown/src/compiler/utils/filterImage";
import { getExpectedSelectorTypes } from "@impower/sparkdown/src/compiler/utils/getExpectedSelectorTypes";
import { getImagePreviewMarkupComposited } from "@impower/sparkdown/src/compiler/utils/getImageComposite";
import { resolveSelector } from "@impower/sparkdown/src/compiler/utils/resolveSelector";
import {
  MarkupKind,
  type Hover,
  type Position,
  type Range,
} from "vscode-languageserver";

export const getHover = async (
  document: SparkdownDocument | undefined,
  annotations: SparkdownAnnotations | undefined,
  program: SparkProgram | undefined,
  config: SparkdownCompilerConfig | undefined,
  position: Position,
): Promise<Hover | null> => {
  if (!document || !annotations || !program) {
    return null;
  }
  // The annotation walk is synchronous, so pick the struct out first and build
  // the (possibly composited, therefore async) markup afterwards.
  let match: { struct: any; range: Range } | null = null;
  const searchFrom = document.offsetAt(position);
  const searchTo = document.offsetAt({ line: position.line + 1, character: 0 });
  annotations.references.between(searchFrom, searchTo, (from, to, value) => {
    if (match != null) {
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
            match = { struct: resolvedValue, range };
            return false;
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
  if (!match) {
    return null;
  }
  const { struct, range } = match as { struct: any; range: Range };
  const preview = await getImagePreviewMarkupComposited(
    program.context,
    struct,
  );
  if (!preview) {
    return null;
  }
  return {
    contents: { kind: MarkupKind.Markdown, value: preview },
    range,
  };
};
