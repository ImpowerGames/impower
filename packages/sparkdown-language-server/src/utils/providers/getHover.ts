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
import { MORPH_FIELD_DOCS } from "@impower/sparkdown/src/compiler/morph/morphSchema";
import { braceBlockPathAt } from "@impower/sparkdown/src/compiler/utils/braceBlocks";
import { own } from "@impower/sparkdown/src/morph/own";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { type SyntaxNode, type Tree } from "@lezer/common";
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
    text = stack.some((node) => node.name === "BreakLeadingGlue")
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

const getMorphFieldHover = (
  document: SparkdownDocument,
  tree: Tree,
  position: Position,
): Hover | null => {
  const offset = document.offsetAt(position);
  let inMorph = false;
  for (let node: SyntaxNode | null = tree.resolveInner(offset, -1); node; node = node.parent) {
    if (node.name === "LuauMorph") {
      inMorph = true;
      break;
    }
  }
  if (!inMorph) {
    return null;
  }
  const line = document.getLineText(position.line);
  const isNameChar = (ch: string | undefined) => !!ch && /[\w]/.test(ch);
  let start = position.character;
  let end = position.character;
  while (isNameChar(line[start - 1])) start -= 1;
  while (isNameChar(line[end])) end += 1;
  const name = line.slice(start, end);
  if (!name || !/^[ \t]*(=|\{)/.test(line.slice(end))) {
    return null;
  }
  const read = (from: number, to: number) => document.read(from, to);
  const path = braceBlockPathAt(tree, offset, read)?.path ?? [];
  if (path[0] === "layers" && path.length === 1) {
    return null;
  }
  const doc =
    (path[0] === "paints" ? own(MORPH_FIELD_DOCS, `paints.${name}`) : undefined) ??
    own(MORPH_FIELD_DOCS, name);
  if (!doc) {
    return null;
  }
  return {
    contents: { kind: MarkupKind.Markdown, value: doc },
    range: {
      start: { line: position.line, character: start },
      end: { line: position.line, character: end },
    },
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
    const morphFieldHover = getMorphFieldHover(document, tree, position);
    if (morphFieldHover) {
      return morphFieldHover;
    }
  }
  if (!document || !annotations || !program) {
    return null;
  }
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
