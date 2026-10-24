import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { SparkdownCompilerConfig } from "@impower/sparkdown/src/compiler/types/SparkdownCompilerConfig";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { filterImage } from "@impower/sparkdown/src/compiler/utils/filterImage";
import { getExpectedSelectorTypes } from "@impower/sparkdown/src/compiler/utils/getExpectedSelectorTypes";
import {
  getImagePreviewMarkupComposited,
  type ImageCompositeOptions,
} from "@impower/sparkdown/src/compiler/utils/getImageComposite";
import { resolveSelector } from "@impower/sparkdown/src/compiler/utils/resolveSelector";
import { type SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { type Tree } from "@lezer/common";
import {
  MarkupKind,
  type Hover,
  type Position,
  type Range,
} from "vscode-languageserver";

const JOINING_LINES_GUIDE =
  "https://github.com/ImpowerGames/impower/blob/main/packages/sparkdown/docs/guide/JoiningLines.md";

const GLUE_HOVER = {
  lineEnd:
    "A `..` at the end of a line joins the next line shown onto this one, in the same text box, when that line begins with `..`. The spaces before the mark are kept.",
  beforeBreak:
    "A `..` before a `>` break keeps the box open after the click: the part after the break carries on in this box when it begins with `..`.",
  lineStart:
    "A `..` at the start of a line joins this line onto the line shown before it, when that line ends with `..`. Otherwise this line shows on its own, and the game warns that it joins nothing.",
  afterBreak:
    "A `..` after a `>` break carries on in the same box after the click, when the part before the break ends with `..`.",
};

// The hover for a glue mark under the cursor. The grammar gives a `..` its
// `Glue` or `LeadingGlue` node only where it joins lines; a `..` that is text
// (`a..b`, `{x} .. more`) is part of a text chunk and gets no hover. A `..`
// that ends a line right after a `>` break has no part after the break to
// begin, so it marks nothing and gets none either.
const getGlueHover = (
  document: SparkdownDocument,
  tree: Tree,
  position: Position,
): Hover | null => {
  const offset = document.offsetAt(position);
  const stack = getStack<SparkdownNodeName>(tree, offset, 1);
  const mark = stack.find(
    (node) => node.name === "Glue" || node.name === "LeadingGlue",
  );
  if (!mark) {
    return null;
  }
  // `Glue` spans the spaces written before its `..`, which is always its last
  // two characters.
  const from = mark.name === "Glue" ? mark.to - 2 : mark.from;
  if (offset < from || offset >= mark.to) {
    return null;
  }
  let text: string;
  if (mark.name === "Glue") {
    if (mark.prevSibling?.name === "Break") {
      return null;
    }
    const after = document.getText({
      start: document.positionAt(mark.to),
      end: { line: document.positionAt(mark.to).line + 1, character: 0 },
    });
    text = after.trimStart().startsWith(">")
      ? GLUE_HOVER.beforeBreak
      : GLUE_HOVER.lineEnd;
  } else {
    text =
      mark.parent?.name === "BreakLeadingGlue_c2"
        ? GLUE_HOVER.afterBreak
        : GLUE_HOVER.lineStart;
  }
  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: `${text}\n\n[Joining lines](${JOINING_LINES_GUIDE})`,
    },
    range: document.range(from, mark.to),
  };
};

export const getHover = async (
  document: SparkdownDocument | undefined,
  tree: Tree | undefined,
  annotations: SparkdownAnnotations | undefined,
  program: SparkProgram | undefined,
  config: SparkdownCompilerConfig | undefined,
  position: Position,
  options?: ImageCompositeOptions,
): Promise<Hover | null> => {
  if (document && tree) {
    const glueHover = getGlueHover(document, tree, position);
    if (glueHover) {
      return glueHover;
    }
  }
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
                (type === "filtered_image" || /[:~]/.test(selector.name)) &&
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
    options,
  );
  if (!preview) {
    return null;
  }
  return {
    contents: { kind: MarkupKind.Markdown, value: preview },
    range,
  };
};
