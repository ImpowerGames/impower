import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import {
  BRACE_BODY_NAMES,
  braceBodyCloseFrom,
  braceBodyOwner,
} from "@impower/sparkdown/src/compiler/utils/braceBlocks";
import { type SyntaxNode, type Tree } from "@lezer/common";
import { Range, type FoldingRange } from "vscode-languageserver";
import {
  getDeclarationHeadings,
  type DeclarationHeading,
} from "../annotations/getDeclarationHeadings";

const INDENT_REGEX = /^([ \t]+)/;

// The declarations whose bodies may hold brace blocks (#1222).
const BRACE_BODY_DECLARATIONS = new Set([
  "LuauStyle",
  "LuauAnimation",
  "LuauTheme",
  "LuauMorph",
  "LuauLayout",
  "LuauComponent",
  "LuauScreen",
]);

/**
 * A fold for each brace block that spans lines, from its header's line (the
 * line of its key or element, or of a list entry's `{`) to the line of its
 * `}`, whatever the indentation. A block left open folds to its last line
 * that holds text. Where blocks start on the same line, the outermost one
 * folds there.
 */
const getBraceFoldingRanges = (
  document: SparkdownDocument,
  tree: Tree,
): FoldingRange[] => {
  const byStart = new Map<number, number>();
  const visit = (node: SyntaxNode) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (BRACE_BODY_NAMES.has(child.name)) {
        const startLine = document.positionAt(braceBodyOwner(child).from).line;
        const closeFrom = braceBodyCloseFrom(child);
        const lastFrom =
          closeFrom < child.to
            ? closeFrom
            : child.from +
              Math.max(
                0,
                document.read(child.from, child.to).trimEnd().length - 1,
              );
        const endLine = document.positionAt(lastFrom).line;
        if (endLine > startLine && endLine > (byStart.get(startLine) ?? -1)) {
          byStart.set(startLine, endLine);
        }
      }
      visit(child);
    }
  };
  for (
    let declaration = tree.topNode.firstChild;
    declaration;
    declaration = declaration.nextSibling
  ) {
    if (BRACE_BODY_DECLARATIONS.has(declaration.name)) visit(declaration);
  }
  return [...byStart].map(([startLine, endLine]) => ({
    startLine,
    endLine,
    kind: "region",
  }));
};

export const getFoldingRanges = (
  document: SparkdownDocument | undefined,
  annotations: SparkdownAnnotations,
  program: SparkProgram | undefined,
  tree: Tree | undefined,
): FoldingRange[] => {
  const indentFolding: FoldingRange[] = [];
  if (!document) {
    return indentFolding;
  }
  const lines: string[] = [];
  for (let i = 0; i < document.lineCount; i += 1) {
    lines.push(document.getText(Range.create(i, 0, i + 1, 0)));
  }
  // Support indentation folding
  const getIndentLevel = (text: string): number => {
    return text?.match(INDENT_REGEX)?.[1]?.length || 0;
  };
  const getPrevNonBlankLine = (index: number): number => {
    // Search backward for line that has content.
    for (let i = index - 1; i >= 0; i -= 1) {
      const prev = lines[i]!;
      if (prev.trim()) {
        return i;
      }
    }
    return index;
  };
  const getIndentationCloseLine = (index: number): number => {
    const curr = lines[index]!;
    // Find the next line that is indented less than the current line
    for (let i = index + 1; i < lines.length; i += 1) {
      const next = lines[i]!;
      if (next && getIndentLevel(next) <= getIndentLevel(curr)) {
        // fold ends the line before the outdented line
        return getPrevNonBlankLine(i);
      }
    }

    return document.lineCount - 1;
  };
  lines.forEach((curr, lineIndex) => {
    const next = lines[lineIndex + 1];
    if (!next) {
      return;
    }
    const currDepth = getIndentLevel(curr);
    const nextDepth = getIndentLevel(next);
    if (nextDepth > currDepth) {
      const startLine = curr.trim()
        ? lineIndex
        : getPrevNonBlankLine(lineIndex);
      const endLine = getIndentationCloseLine(lineIndex);
      indentFolding.push({
        startLine,
        endLine,
        kind: "indent",
      });
    }
  });
  // A brace block's fold replaces the indentation fold on its header line.
  const braceFolding = tree ? getBraceFoldingRanges(document, tree) : [];
  if (braceFolding.length > 0) {
    const braceStarts = new Set(braceFolding.map((r) => r.startLine));
    const kept = indentFolding.filter((r) => !braceStarts.has(r.startLine));
    indentFolding.length = 0;
    indentFolding.push(
      ...[...kept, ...braceFolding].sort((a, b) => a.startLine - b.startLine),
    );
  }
  if (!program) {
    return indentFolding;
  }
  // Each scene, branch and function folds over the same extent the outline
  // gives it.
  const headingFolding: FoldingRange[] = [];
  const addFolds = (headings: DeclarationHeading[]) => {
    for (const heading of headings) {
      if (heading.type !== "label") {
        headingFolding.push({
          startLine: heading.nameRange.start.line,
          endLine: heading.end.line,
          kind: heading.type,
        });
      }
      addFolds(heading.children);
    }
  };
  addFolds(getDeclarationHeadings(document, annotations, tree));
  const result = [...indentFolding, ...headingFolding].sort(
    (a, b) => a.startLine - b.startLine,
  );
  return result;
};
