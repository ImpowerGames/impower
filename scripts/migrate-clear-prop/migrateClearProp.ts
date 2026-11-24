import { type SyntaxNode } from "@lezer/common";
import type ts from "typescript";
import { createSparkdownParser } from "../../packages/sparkdown/src/compiler/utils/createSparkdownParser";
import { findChildByName } from "../../packages/sparkdown/src/compiler/utils/findChildByName";

export interface ClearPropResult {
  text: string;
  migrated: number;
}

const CONTENT_TAGS = new Set(["text", "stroke", "image", "mask"]);

const NAME_NODES = new Set([
  "LuauSparkleElementName",
  "BuiltinComponentName",
  "CustomComponentName",
]);

const HEAD_PARTS_WITHOUT_VALUE = new Set([
  "RequiredWhitespace",
  "Whitespace",
  "LuauComment",
  "LuauLineComment",
  "LuauBlockComment",
  "LuauStructBlockSlashComment",
  "LuauSparkleElementClass",
  "LuauSparklePropAttribute",
  "LuauSparkleEventAttribute",
  "LuauSparklePropClosureAttribute",
  "LuauSparkleEventClosureAttribute",
  "LuauSparklePropParenAttribute",
  "LuauSparkleEventParenAttribute",
]);

const BLANK_BLOCK_PARTS = new Set([
  "Whitespace",
  "Newline",
  "LuauComment",
  "LuauLineComment",
  "LuauBlockComment",
  "LuauStructBlockSlashComment",
]);

const parser = createSparkdownParser();

function descendants(node: SyntaxNode, name: string): SyntaxNode[] {
  const found: SyntaxNode[] = [];
  const walk = (parent: SyntaxNode) => {
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      if (child.name === name) found.push(child);
      walk(child);
    }
  };
  walk(node);
  return found;
}

function childNodes(node: SyntaxNode | null | undefined): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  for (let c = node?.firstChild; c; c = c.nextSibling) out.push(c);
  return out;
}

function headParts(element: SyntaxNode): SyntaxNode[] {
  const content = findChildByName(element, "LuauSparkleElement_content");
  const parts = content ? findChildByName(content, "LuauSparkleElementParts") : null;
  return childNodes(parts?.firstChild);
}

function blockOf(element: SyntaxNode): SyntaxNode | null {
  const content = findChildByName(element, "LuauSparkleElement_content");
  return content ? findChildByName(content, "LuauSparkleElementBlock") : null;
}

function blockEntries(element: SyntaxNode): SyntaxNode[] {
  const block = blockOf(element);
  return childNodes(block ? findChildByName(block, "LuauSparkleElementBlock_content") : null);
}

function words(element: SyntaxNode, text: string): string[] {
  const begin = findChildByName(element, "LuauSparkleElement_begin");
  const name = childNodes(begin?.firstChild).find((n) => NAME_NODES.has(n.name));
  const classes = headParts(element)
    .filter((p) => p.name === "LuauSparkleElementClass")
    .flatMap((p) => descendants(p, "LuauSparkleClassName"))
    .map((n) => text.slice(n.from, n.to));
  return [...(name ? [text.slice(name.from, name.to)] : []), ...classes];
}

function holdsNoValue(element: SyntaxNode): boolean {
  const content = findChildByName(element, "LuauSparkleElement_content");
  if (content && findChildByName(content, "LuauSparkleCallArguments")) return false;
  if (!headParts(element).every((p) => HEAD_PARTS_WITHOUT_VALUE.has(p.name))) return false;
  return blockEntries(element).every((n) => BLANK_BLOCK_PARTS.has(n.name));
}

function isEmptiedContent(element: SyntaxNode, text: string): boolean {
  return words(element, text).some((w) => CONTENT_TAGS.has(w)) && holdsNoValue(element);
}

function hasClearProp(element: SyntaxNode, text: string): boolean {
  return headParts(element).some((p) => {
    if (p.name !== "LuauSparklePropAttribute") return false;
    const name = descendants(p, "StyleAttributeName")[0];
    return Boolean(name) && text.slice(name!.from, name!.to) === "clear";
  });
}

function insertionPoint(element: SyntaxNode): number {
  const content = findChildByName(element, "LuauSparkleElement_content");
  const parts = content ? findChildByName(content, "LuauSparkleElementParts") : null;
  if (parts) return parts.to;
  return findChildByName(element, "LuauSparkleElement_begin")!.to;
}

export function clearInsertions(text: string): number[] {
  const tree = parser.parse(text);
  const points: number[] = [];
  for (const layout of descendants(tree.topNode, "LuauLayout")) {
    for (const element of descendants(layout, "LuauSparkleElement")) {
      if (hasClearProp(element, text)) continue;
      const children = blockEntries(element).filter((n) => n.name === "LuauSparkleElement");
      if (children.some((child) => isEmptiedContent(child, text))) {
        points.push(insertionPoint(element));
      }
    }
  }
  return [...new Set(points)].sort((a, b) => a - b);
}

function insertAt(text: string, points: number[]): string {
  let result = "";
  let at = 0;
  for (const point of points) {
    result += text.slice(at, point) + " #clear";
    at = point;
  }
  return result + text.slice(at);
}

export function migrateClearProp(source: string): ClearPropResult {
  const points = clearInsertions(source);
  return { text: insertAt(source, points), migrated: points.length };
}

const FENCE = /^([ \t]*)(`{3,}|~{3,})[ \t]*([^\s`]*)[^`]*$/;
const SPARKDOWN_FENCE_LANGUAGES = new Set(["", "sparkdown", "sd"]);

export function migrateMarkdownClearProp(source: string): ClearPropResult {
  const lines = source.split("\n");
  let migrated = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const open = FENCE.exec(lines[i]!);
    if (!open) continue;
    const [, indent, marker, language] = open;
    let close = i + 1;
    const closer = new RegExp(`^[ \\t]*${marker![0]}{${marker!.length},}[ \\t]*\\r?$`);
    while (close < lines.length && !closer.test(lines[close]!)) close += 1;
    if (SPARKDOWN_FENCE_LANGUAGES.has(language!.toLowerCase())) {
      const body = lines.slice(i + 1, close);
      const prefixes = body.map((line) =>
        line.startsWith(indent!) ? indent! : /^[ \t]*/.exec(line)![0],
      );
      const result = migrateClearProp(body.map((line, k) => line.slice(prefixes[k]!.length)).join("\n"));
      if (result.migrated > 0) {
        migrated += result.migrated;
        result.text.split("\n").forEach((line, k) => {
          lines[i + 1 + k] = prefixes[k] + line;
        });
      }
    }
    i = close;
  }
  return { text: lines.join("\n"), migrated };
}

const LAYOUT_HEADER = /(^|\n)[ \t]*layout[ \t]+[A-Za-z_]/;

function maskedTemplate(
  typescript: typeof ts,
  node: ts.TemplateLiteral,
  source: string,
): { from: number; text: string } {
  const from = node.getStart() + 1;
  const to = node.end - 1;
  const chars = source.slice(from, to).split("");
  if (typescript.isTemplateExpression(node)) {
    let maskFrom = node.head.end - 2;
    for (const span of node.templateSpans) {
      const maskTo = span.literal.getStart() + 1;
      for (let i = maskFrom; i < maskTo; i += 1) {
        if (chars[i - from] !== "\n") chars[i - from] = " ";
      }
      maskFrom = span.literal.end - 2;
    }
  }
  return { from, text: chars.join("") };
}

export function migrateScriptClearProp(
  source: string,
  typescript: typeof ts,
  fileName = "file.ts",
): ClearPropResult {
  const file = typescript.createSourceFile(fileName, source, typescript.ScriptTarget.Latest, true);
  const points: number[] = [];
  const visit = (node: ts.Node) => {
    if (typescript.isNoSubstitutionTemplateLiteral(node) || typescript.isTemplateExpression(node)) {
      const masked = maskedTemplate(typescript, node, source);
      if (LAYOUT_HEADER.test(masked.text)) {
        for (const point of clearInsertions(masked.text)) points.push(masked.from + point);
      }
      return;
    }
    typescript.forEachChild(node, visit);
  };
  visit(file);
  points.sort((a, b) => a - b);
  return { text: insertAt(source, points), migrated: points.length };
}
