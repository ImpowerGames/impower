import type { SyntaxNode } from "@lezer/common";
import { stripStyleCodes } from "../../runtime/displayStyle";
import { readStoryTag } from "../../runtime/storyTags";
import type { DisplayWrites } from "../../program/displayFacts";
import { readStyledSource } from "../lower/utils/displaySpans";
import { injectionKind } from "../lower/lowerers/lowerDisplay";
import { DIRECTIVE_NODE_BRACKETS, readSourceDirective, type DirectiveKind } from "./readDirective";
import { stringLiteralValue } from "./stringLiteralValue";

interface SourceReader {
  read: (from: number, to: number) => string;
}

export interface DisplayTextFacts {
  writes: DisplayWrites;
  directives: DirectiveKind[];
}

const INTERPOLATION = "LuauInterpolatedStringExpression";

const TEXT_COMMAND = "TextCommand";

const QUOTED_STRINGS = new Set(["LuauDoubleQuotedString", "LuauSingleQuotedString"]);

const DISPLAY_SYNTAX = /[[(<\\*_~`^|]/;

const descendant = (node: SyntaxNode, name: string): SyntaxNode | null => {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
    const found = descendant(child, name);
    if (found) return found;
  }
  return null;
};

const interpolationWrites = (node: SyntaxNode, read: SourceReader["read"]): DisplayWrites => {
  const content = node.getChild(`${INTERPOLATION}_content`);
  if (!content) return "none";
  const parts: SyntaxNode[] = [];
  for (let child = content.firstChild; child; child = child.nextSibling) {
    if (read(child.from, child.to).trim()) parts.push(child);
  }
  const only = parts.length === 1 ? parts[0]! : undefined;
  if (!only || !QUOTED_STRINGS.has(only.name) || !only.getChild(`${only.name}_end`)) return "dynamic";
  const value = stringLiteralValue(read(only.from, only.to), false);
  if (!value.trim()) return "none";
  return DISPLAY_SYNTAX.test(value) ? "dynamic" : "text";
};

export const displayTextFacts = (
  root: SyntaxNode,
  from: number,
  to: number,
  source: SourceReader,
): DisplayTextFacts => {
  const blanks: { from: number; to: number }[] = [];
  const directives: DirectiveKind[] = [];
  let shown = false;
  let dynamic = false;
  let hiddenFrom: number | undefined;
  const command = (node: SyntaxNode) => {
    const content = descendant(node, "TextCommandContent");
    const tag = readStoryTag(content ? source.read(content.from, content.to) : "");
    if (!tag.known || tag.closes) return;
    if (tag.name === "!") {
      hiddenFrom ??= node.to;
    } else if (tag.name === "/!") {
      if (hiddenFrom !== undefined) blanks.push({ from: hiddenFrom, to: node.from });
      hiddenFrom = undefined;
    } else if ((tag.name === "wait" || tag.name === "w") && !tag.argument) {
      shown = true;
    } else if (tag.name === "br" && hiddenFrom === undefined) {
      shown = true;
    }
  };
  const visit = (parent: SyntaxNode) => {
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      if (child.to <= from || child.from >= to) continue;
      const kind = injectionKind(child);
      if (Object.hasOwn(DIRECTIVE_NODE_BRACKETS, child.name)) {
        const directive = readSourceDirective(child, source.read);
        if (directive) directives.push(directive.kind);
        blanks.push(child);
      } else if (kind === "expr" || kind === "inlineGluedAlt") {
        if (hiddenFrom === undefined) {
          const writes = child.name === INTERPOLATION ? interpolationWrites(child, source.read) : "dynamic";
          if (writes === "text") shown = true;
          else if (writes === "dynamic") dynamic = true;
        }
        blanks.push(child);
      } else if (child.name === TEXT_COMMAND) {
        command(child);
        blanks.push(child);
      } else if (kind === "comment" || kind === "tag" || kind === "divert" || kind === "load") {
        blanks.push(child);
      } else {
        visit(child);
      }
    }
  };
  visit(root);
  if (hiddenFrom !== undefined) blanks.push({ from: hiddenFrom, to });
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
  const writes: DisplayWrites = literal || shown ? "text" : dynamic ? "dynamic" : "none";
  return { writes, directives };
};
