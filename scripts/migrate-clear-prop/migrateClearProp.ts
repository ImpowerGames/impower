import { type SyntaxNode } from "@lezer/common";
import type ts from "typescript";
import { sparkleElementParts, sparklePartNodes } from "../../packages/sparkdown/src/compiler/lower/utils/sparkleBlockEntries";
import { readStructBodyEntries, type StructEntry } from "../../packages/sparkdown/src/compiler/lower/utils/structBodyEntries";
import { createSparkdownParser } from "../../packages/sparkdown/src/compiler/utils/createSparkdownParser";
import { findChildByName } from "../../packages/sparkdown/src/compiler/utils/findChildByName";

export interface ClearPropResult {
  text: string;
  migrated: number;
}

const CONTENT_TAGS = new Set(["text", "stroke", "image", "mask"]);

const PARTS_WITHOUT_VALUE = new Set([
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

const TRIVIA_PARTS = new Set([
  "RequiredWhitespace",
  "Whitespace",
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

function partsOf(entry: StructEntry): SyntaxNode[] {
  const containers = [...sparklePartNodes(entry.shape), ...(entry.continuations ?? [])];
  return containers.flatMap((container) =>
    container.name === "LuauSparkleElementParts" ? childNodes(container.firstChild) : [container],
  );
}

function words(entry: StructEntry, text: string): string[] {
  const name = sparkleElementParts(entry.shape).name;
  const classes = partsOf(entry)
    .filter((p) => p.name === "LuauSparkleElementClass")
    .flatMap((p) => descendants(p, "LuauSparkleClassName"))
    .map((n) => text.slice(n.from, n.to));
  return [...(name ? [text.slice(name.from, name.to)] : []), ...classes];
}

function holdsNoValue(entry: StructEntry): boolean {
  return (
    !sparkleElementParts(entry.shape).args &&
    partsOf(entry).every((p) => PARTS_WITHOUT_VALUE.has(p.name)) &&
    (entry.children?.length ?? 0) === 0
  );
}

function isEmptiedContent(entry: StructEntry, text: string): boolean {
  return Boolean(entry.element) && words(entry, text).some((w) => CONTENT_TAGS.has(w)) && holdsNoValue(entry);
}

function isStream(entry: StructEntry, text: string): boolean {
  const name = sparkleElementParts(entry.shape).name;
  return Boolean(name) && text.slice(name!.from, name!.to) === "stream";
}

function hasClearProp(entry: StructEntry, text: string): boolean {
  return partsOf(entry).some((p) => {
    if (p.name !== "LuauSparklePropAttribute") return false;
    const name = descendants(p, "StyleAttributeName")[0];
    return Boolean(name) && text.slice(name!.from, name!.to) === "clear";
  });
}

interface Edit {
  from: number;
  to: number;
  insert: string;
}

function clearEdit(element: SyntaxNode, text: string): Edit {
  const content = findChildByName(element, "LuauSparkleElement_content");
  const assign = content ? findChildByName(content, "LuauSparkleElementAssign") : null;
  if (assign && text.slice(assign.from, assign.to).includes("=")) {
    return { from: assign.from, to: assign.to, insert: " #clear " };
  }
  const { head, beginTo } = sparkleElementParts(element);
  const written = childNodes(head?.firstChild).filter((part) => !TRIVIA_PARTS.has(part.name));
  const at = written.at(-1)?.to ?? beginTo;
  return { from: at, to: at, insert: " #clear" };
}

function eachElement(
  text: string,
  bodyTypes: readonly string[],
  visit: (entry: StructEntry, key: string) => void,
): void {
  const walk = (entries: StructEntry[]) => {
    for (const entry of entries) {
      if (!entry.element || isStream(entry, text)) continue;
      visit(entry, words(entry, text).join(" "));
      if (entry.children) walk(entry.children);
    }
  };
  const tree = parser.parse(text);
  for (const name of bodyTypes) {
    for (const body of descendants(tree.topNode, name)) {
      walk(readStructBodyEntries(body, undefined as never));
    }
  }
}

export function emptiedNames(text: string): Set<string> {
  const names = new Set<string>();
  eachElement(text, ["LuauLayout", "LuauScreen"], (entry, key) => {
    if (key && entry.children?.some((child) => isEmptiedContent(child, text))) names.add(key);
  });
  return names;
}

export function clearEdits(text: string, names: ReadonlySet<string> = emptiedNames(text)): Edit[] {
  const edits = new Map<number, Edit>();
  eachElement(text, ["LuauLayout", "LuauScreen", "LuauComponent"], (entry, key) => {
    if (names.has(key) && !hasClearProp(entry, text)) {
      const edit = clearEdit(entry.shape, text);
      edits.set(edit.from, edit);
    }
  });
  return [...edits.values()].sort((a, b) => a.from - b.from);
}

function applyEdits(text: string, edits: Edit[]): string {
  let result = "";
  let at = 0;
  for (const edit of edits) {
    result += text.slice(at, edit.from) + edit.insert;
    at = edit.to;
  }
  return result + text.slice(at);
}

export function migrateClearProp(source: string, names?: ReadonlySet<string>): ClearPropResult {
  const edits = clearEdits(source, names);
  return { text: applyEdits(source, edits), migrated: edits.length };
}

const FENCE = /^([ \t]*)(`{3,}|~{3,})[ \t]*([^\s`]*)[^`]*$/;
const SPARKDOWN_FENCE_LANGUAGES = new Set(["", "sparkdown", "sd"]);

function withShared(text: string, shared: ReadonlySet<string>): Set<string> {
  return new Set([...shared, ...emptiedNames(text)]);
}

export function migrateMarkdownClearProp(source: string, shared: ReadonlySet<string> = new Set()): ClearPropResult {
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
      const block = body.map((line, k) => line.slice(prefixes[k]!.length)).join("\n");
      const result = migrateClearProp(block, withShared(block, shared));
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

const BODY_HEADER = /(^|\n)[ \t]*(?:layout|screen)[ \t]+[A-Za-z_]/;

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
  shared: ReadonlySet<string> = new Set(),
): ClearPropResult {
  const file = typescript.createSourceFile(fileName, source, typescript.ScriptTarget.Latest, true);
  const edits: Edit[] = [];
  const visit = (node: ts.Node) => {
    if (typescript.isNoSubstitutionTemplateLiteral(node) || typescript.isTemplateExpression(node)) {
      const masked = maskedTemplate(typescript, node, source);
      if (BODY_HEADER.test(masked.text)) {
        for (const edit of clearEdits(masked.text, withShared(masked.text, shared))) {
          edits.push({ ...edit, from: masked.from + edit.from, to: masked.from + edit.to });
        }
      }
    }
    typescript.forEachChild(node, visit);
  };
  visit(file);
  edits.sort((a, b) => a.from - b.from);
  return { text: applyEdits(source, edits), migrated: edits.length };
}
