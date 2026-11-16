import type { SyntaxNode } from "@lezer/common";
import { stripStyleCodes } from "../../runtime/displayStyle";
import type { DisplayWrites } from "../../program/displayFacts";
import { readStyledSource } from "../lower/utils/displaySpans";
import { DIRECTIVE_NODE_BRACKETS, readSourceDirective, type DirectiveKind } from "./readDirective";

interface SourceReader {
  read: (from: number, to: number) => string;
}

export interface DisplayTextFacts {
  writes: DisplayWrites;
  directives: DirectiveKind[];
}

const INTERPOLATION = "LuauInterpolatedStringExpression";

const QUOTED = /^(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')$/s;

const constantInterpolation = (node: SyntaxNode, read: SourceReader["read"]): string | undefined => {
  const content = node.getChild(`${INTERPOLATION}_content`);
  if (!content) return "";
  const match = QUOTED.exec(read(content.from, content.to).trim());
  return match ? (match[1] ?? match[2] ?? "") : undefined;
};

export const displayTextFacts = (
  root: SyntaxNode,
  from: number,
  to: number,
  source: SourceReader,
): DisplayTextFacts => {
  const blanks: { from: number; to: number }[] = [];
  const directives: DirectiveKind[] = [];
  let constantText = false;
  let dynamic = false;
  const visit = (parent: SyntaxNode) => {
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      if (child.to <= from || child.from >= to) continue;
      if (Object.hasOwn(DIRECTIVE_NODE_BRACKETS, child.name)) {
        const directive = readSourceDirective(child, source.read);
        if (directive) directives.push(directive.kind);
        blanks.push(child);
      } else if (child.name === INTERPOLATION) {
        const value = constantInterpolation(child, source.read);
        if (value === undefined) dynamic = true;
        else if (value.trim()) constantText = true;
        blanks.push(child);
      } else if (child.name.includes("Comment") || child.name === "Tags") {
        blanks.push(child);
      } else {
        visit(child);
      }
    }
  };
  visit(root);
  const read = (start: number, end: number) => {
    let text = source.read(start, end);
    for (const blank of blanks) {
      const a = Math.max(start, blank.from);
      const b = Math.min(end, blank.to);
      if (a < b) text = text.slice(0, a - start) + " ".repeat(b - a) + text.slice(b - start);
    }
    return text;
  };
  const literal = stripStyleCodes(readStyledSource(root, from, to, { read })).trim();
  const writes: DisplayWrites = literal || constantText ? "text" : dynamic ? "dynamic" : "none";
  return { writes, directives };
};
