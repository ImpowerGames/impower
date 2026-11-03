import { Text } from "@codemirror/state";
import { type SyntaxNode, type Tree } from "@lezer/common";
import { SparkdownCombinedAnnotator } from "../../packages/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "../../packages/sparkdown/src/compiler/classes/SparkdownDocument";
import {
  STRUCT_KEYWORD_BLOCK_NAMES,
  braceBodyParts,
  keywordBraceBody,
  keywordWithBody,
} from "../../packages/sparkdown/src/compiler/utils/braceBlocks";
import { createSparkdownParser } from "../../packages/sparkdown/src/compiler/utils/createSparkdownParser";
import { findChildByName } from "../../packages/sparkdown/src/compiler/utils/findChildByName";
import { getDocumentFormattingEdits } from "../../packages/sparkdown-language-server/src/utils/providers/getDocumentFormattingEdits";

export interface StructBraceSkip {
  line: number;
  keyword: string;
  reason: string;
}

export interface StructBraceResult {
  text: string;
  migrated: number;
  skipped: StructBraceSkip[];
}

interface Edit {
  from: number;
  to: number;
  insert: string;
}

interface Migration {
  block: SyntaxNode;
  open: Edit;
  close: Edit;
}

const COMMENT_NAMES = new Set(["LuauLineComment", "LuauBlockComment"]);

const parser = createSparkdownParser();

function find(node: SyntaxNode, name: string): SyntaxNode | null {
  const cursor = node.cursor();
  do {
    if (cursor.name === name) return cursor.node;
  } while (cursor.next() && cursor.from < node.to);
  return null;
}

function structBlocks(tree: Tree): SyntaxNode[] {
  const blocks: SyntaxNode[] = [];
  tree.iterate({
    enter: (node) => {
      if (STRUCT_KEYWORD_BLOCK_NAMES.has(node.name)) blocks.push(node.node);
    },
  });
  return blocks;
}

function keywordOf(block: SyntaxNode, text: string): string {
  const keyword = find(block, `${block.name}Keyword`);
  return keyword ? text.slice(keyword.from, keyword.to) : block.name;
}

function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = text.indexOf("\n"); i >= 0 && i < offset; i = text.indexOf("\n", i + 1)) {
    line += 1;
  }
  return line;
}

function headerInsertion(block: SyntaxNode, body: SyntaxNode, text: string): number {
  const lineEnd = text.lastIndexOf("\n", body.from - 1);
  let limit = lineEnd >= block.from ? lineEnd : body.from;
  const content = findChildByName(block, `${block.name}_content`);
  for (let child = content?.firstChild; child; child = child.nextSibling) {
    if (child.from >= limit) break;
    if (COMMENT_NAMES.has(child.name)) {
      limit = child.from;
      break;
    }
  }
  let at = limit;
  while (at > block.from && /[^\S\n]/.test(text[at - 1]!)) at -= 1;
  return at;
}

function planMigration(
  block: SyntaxNode,
  text: string,
): Migration | StructBraceSkip | null {
  const body = keywordWithBody(block);
  if (!body) return null;
  const keyword = keywordOf(block, text);
  const line = lineOf(text, block.from);
  const end = findChildByName(block, `${block.name}_end`);
  const endKeyword = end ? find(end, "LuauEndKeyword") : null;
  if (!endKeyword) {
    return { line, keyword, reason: "the block has no closing end" };
  }
  const begin = findChildByName(body, `${body.name}_begin`);
  const withKeyword = begin ? find(begin, "LuauWithKeyword") : null;
  const open: Edit = withKeyword
    ? { from: withKeyword.from, to: withKeyword.to, insert: "{" }
    : (() => {
        const at = headerInsertion(block, body, text);
        return { from: at, to: at, insert: " {" };
      })();
  const empty = /^[^\S\n]*$/.test(text.slice(open.to, endKeyword.from));
  return {
    block,
    open,
    close: {
      from: empty ? open.to : endKeyword.from,
      to: endKeyword.to,
      insert: "}",
    },
  };
}

function applyEdits(text: string, edits: Edit[]): string {
  let result = "";
  let at = 0;
  for (const edit of [...edits].sort((a, b) => a.from - b.from)) {
    result += text.slice(at, edit.from) + edit.insert;
    at = edit.to;
  }
  return result + text.slice(at);
}

function mapOffset(offset: number, edits: Edit[], assoc: -1 | 1): number {
  let delta = 0;
  for (const edit of edits) {
    if (edit.to < offset || (edit.to === offset && (assoc > 0 || edit.from < edit.to))) {
      delta += edit.insert.length - (edit.to - edit.from);
    }
  }
  return offset + delta;
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) {
    starts.push(i + 1);
  }
  return starts;
}

function lineIndex(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function reindent(text: string, spans: { first: number; last: number }[]): string {
  if (spans.length === 0) return text;
  const tree = parser.parse(text);
  const document = new SparkdownDocument("file:///migrate.sd", "sparkdown", 1, text);
  const annotators = new SparkdownCombinedAnnotator();
  annotators.create(tree, Text.of(text.split("\n")));
  const edits =
    getDocumentFormattingEdits(document, tree, annotators.get(), {
      tabSize: 2,
      insertSpaces: true,
      trimTrailingWhitespace: false,
      insertFinalNewline: false,
      trimFinalNewlines: false,
    }) ?? [];
  const starts = lineStarts(text);
  const inSpan = (line: number) =>
    spans.some((span) => line >= span.first && line <= span.last);
  const indents: Edit[] = [];
  for (const edit of edits) {
    const { start, end } = edit.range;
    if (start.line !== end.line || start.character !== 0) continue;
    if (!inSpan(start.line) || !/^[ \t]*$/.test(edit.newText)) continue;
    const from = starts[start.line]!;
    const to = document.offsetAt(end);
    const lineEnd = text.indexOf("\n", from);
    const lineText = text.slice(from, lineEnd < 0 ? text.length : lineEnd);
    const leading = /^[ \t]*/.exec(lineText)![0];
    if (to - from !== leading.length || leading.length === lineText.length) continue;
    if (leading === edit.newText) continue;
    indents.push({ from, to, insert: edit.newText });
  }
  return applyEdits(text, indents);
}

export interface StructBraceOptions {
  keepIndent?: boolean;
}

export function migrateStructBraces(
  source: string,
  { keepIndent = false }: StructBraceOptions = {},
): StructBraceResult {
  const crlf = /\r\n/.test(source) && !/(^|[^\r])\n/.test(source);
  const text = crlf ? source.replace(/\r\n/g, "\n") : source;
  const skipped: StructBraceSkip[] = [];
  const migrations: Migration[] = [];
  for (const block of structBlocks(parser.parse(text))) {
    const plan = planMigration(block, text);
    if (!plan) continue;
    if ("reason" in plan) skipped.push(plan);
    else migrations.push(plan);
  }
  for (let pending = migrations; pending.length > 0; ) {
    const rewrite = attempt(text, pending);
    if (rewrite.failed.length === 0) {
      const result = keepIndent
        ? rewrite.text
        : reindent(rewrite.text, rewrite.spans);
      return {
        text: crlf ? result.replace(/\n/g, "\r\n") : result,
        migrated: pending.length,
        skipped: skipped.sort((a, b) => a.line - b.line),
      };
    }
    const first = rewrite.failed[0]!;
    skipped.push({
      line: lineOf(text, first.block.from),
      keyword: keywordOf(first.block, text),
      reason: "its body would not close at its own end in the brace form",
    });
    pending = pending.filter((m) => m !== first);
  }
  return { text: source, migrated: 0, skipped: skipped.sort((a, b) => a.line - b.line) };
}

function attempt(
  text: string,
  migrations: Migration[],
): { text: string; spans: { first: number; last: number }[]; failed: Migration[] } {
  const edits = migrations
    .flatMap((m) => [m.open, m.close])
    .sort((a, b) => a.from - b.from);
  const migratedText = applyEdits(text, edits);
  const after = structBlocks(parser.parse(migratedText));
  const starts = lineStarts(migratedText);
  const spans: { first: number; last: number }[] = [];
  const failed: Migration[] = [];
  for (const migration of migrations) {
    const from = mapOffset(migration.block.from, edits, 1);
    const closeTo = mapOffset(migration.close.to, edits, -1);
    const block = after.find((b) => b.from === from && b.name === migration.block.name);
    const body = block ? keywordBraceBody(block) : null;
    const close = body ? braceBodyParts(body).end : null;
    if (!close || close.to !== closeTo || close.to - close.from !== 1) {
      failed.push(migration);
      continue;
    }
    spans.push({
      first: lineIndex(starts, from) + 1,
      last: lineIndex(starts, close.from),
    });
  }
  return { text: migratedText, spans, failed };
}

const FENCE = /^([ \t]*)(`{3,}|~{3,})[ \t]*([^\s`]*)[^`]*$/;
const SPARKDOWN_FENCE_LANGUAGES = new Set(["", "sparkdown", "sd"]);

export function migrateMarkdownStructBraces(
  source: string,
  options: StructBraceOptions = {},
): StructBraceResult {
  const crlf = /\r\n/.test(source);
  const lines = (crlf ? source.replace(/\r\n/g, "\n") : source).split("\n");
  const skipped: StructBraceSkip[] = [];
  let migrated = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const open = FENCE.exec(lines[i]!);
    if (!open) continue;
    const [, indent, marker, language] = open;
    let close = i + 1;
    while (
      close < lines.length &&
      !new RegExp(`^[ \\t]*${marker![0]}{${marker!.length},}[ \\t]*$`).test(lines[close]!)
    ) {
      close += 1;
    }
    if (!SPARKDOWN_FENCE_LANGUAGES.has(language!.toLowerCase())) {
      i = close;
      continue;
    }
    const body = lines.slice(i + 1, close);
    const strip = (line: string) => (line.startsWith(indent!) ? line.slice(indent!.length) : line.trimStart());
    const code = body.map(strip).join("\n") + "\n";
    const result = migrateStructBraces(code, options);
    for (const skip of result.skipped) {
      skipped.push({ ...skip, line: skip.line + i + 1 });
    }
    if (result.migrated > 0) {
      migrated += result.migrated;
      const rewritten = result.text.slice(0, -1).split("\n").map((line) => (line ? indent + line : line));
      lines.splice(i + 1, body.length, ...rewritten);
      close = i + 1 + rewritten.length;
    }
    i = close;
  }
  const text = lines.join("\n");
  return { text: crlf ? text.replace(/\n/g, "\r\n") : text, migrated, skipped };
}
