import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { SparkdownCompilerConfig } from "@impower/sparkdown/src/compiler/types/SparkdownCompilerConfig";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { filterImage } from "@impower/sparkdown/src/compiler/utils/filterImage";
import { getExpectedSelectorTypes } from "@impower/sparkdown/src/compiler/utils/getExpectedSelectorTypes";
import { resolveSelector } from "@impower/sparkdown/src/compiler/utils/resolveSelector";
import { MarkupKind, type Hover, type Position } from "vscode-languageserver";

const resolveRootImage = (
  ref: { $type: string; $name: string },
  context: { [type: string]: { [name: string]: any } } | undefined,
  stack: Set<{ $type: string; $name: string }>
):
  | { $type: "image"; $name: string; src: string; uri: string; data: string }
  | {
      $type: "filtered_image";
      $name: string;
      filtered_src: string;
    }
  | "circular"
  | undefined => {
  const referencedValue = ref?.$type
    ? context?.[ref?.$type]?.[ref.$name]
    : context?.["filtered_image"]?.[ref.$name] ??
      context?.["image"]?.[ref.$name] ??
      context?.["layered_image"]?.[ref.$name];

  if (stack.has(referencedValue)) {
    return "circular";
  }
  stack.add(referencedValue);

  if (referencedValue?.$type === "filtered_image") {
    return referencedValue;
  }

  if (referencedValue?.$type === "image") {
    return referencedValue;
  }

  if (referencedValue?.$type === "layered_image") {
    return resolveRootImage(referencedValue?.assets?.[0], context, stack);
  }

  return undefined;
};

export const getHover = (
  document: SparkdownDocument | undefined,
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
            getExpectedSelectorTypes(program, reference.assigned, config)
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
                  program.context?.["filtered_image"]?.[selector.name]
                );
              }
            }
            const stack = new Set<{ $type: string; $name: string }>();
            const rootImage = resolveRootImage(
              resolvedValue,
              program.context,
              stack
            );
            if (rootImage !== "circular") {
              const src =
                rootImage?.$type === "filtered_image"
                  ? rootImage?.filtered_src
                  : rootImage?.$type === "image"
                  ? rootImage?.src || rootImage?.uri
                  : undefined;
              if (src) {
                result = {
                  contents: {
                    kind: MarkupKind.Markdown,
                    value: `<img src="${src}" alt="${name}" height="180" />`,
                  },
                  range,
                };
                return false;
              }
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
