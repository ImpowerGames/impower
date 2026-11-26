import {
  parseFor,
  treeLanguagesPerCharacter,
  treeLanguagesPerPosition,
} from "./languageEquality";
import { type EngineOptions, treeNodeScope } from "./scopeEquality";
import { tokenize } from "./vscodeGrammarSnapshot";

export const LINE_COMMENT_MARKERS: Readonly<Record<string, string>> = {
  sparkdown: "//",
  "sparkdown-luau": "--",
};

export type SkipReason =
  | "blank"
  | "title page"
  | "comment"
  | "string"
  | "closes an open Luau body";

export interface LineCommentResult {
  line: number;
  text: string;
  language: string;
  skipped?: SkipReason;
  commented?: string;
  readAsComment?: boolean;
}

function skipReasonAt(
  tree: any,
  lineStart: number,
  characterLanguages: string[],
): SkipReason | undefined {
  if (
    lineStart > 0 &&
    characterLanguages[lineStart - 1] !== characterLanguages[lineStart] &&
    LINE_COMMENT_MARKERS[characterLanguages[lineStart]!] === "//"
  ) {
    return "closes an open Luau body";
  }
  for (let n: any = tree.resolveInner(lineStart, 1); n; n = n.parent) {
    const scope = treeNodeScope(n.name);
    if (!scope) continue;
    for (const part of scope.split(/\s+/)) {
      if (part.startsWith("meta.front-matter")) return "title page";
      if (n.from >= lineStart) continue;
      if (part.startsWith("comment.")) return "comment";
      if (part.startsWith("string.") && !part.startsWith("string.display.")) {
        return "string";
      }
    }
  }
  return undefined;
}

async function isReadAsComment(
  lines: string[],
  lineIndex: number,
  from: number,
  options: EngineOptions,
): Promise<boolean> {
  const dumps = await tokenize(lines.slice(0, lineIndex + 1).join("\n"), options);
  const dump = dumps[lineIndex]!;
  for (const tok of dump.tokens) {
    if (tok.endIndex <= from) continue;
    if (!tok.scopes.some((s) => s.startsWith("comment."))) return false;
  }
  return true;
}

export async function lineCommentResults(
  rawSource: string,
  options: EngineOptions = {},
): Promise<LineCommentResult[]> {
  const source = rawSource.replace(/\r\n?/g, "\n");
  const tree = parseFor(source, options);
  const languages = treeLanguagesPerPosition(source, options);
  const characterLanguages = treeLanguagesPerCharacter(source, options);
  const lines = source.split("\n");
  const results: LineCommentResult[] = [];
  let lineStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i]!;
    const language = languages[lineStart] ?? "";
    const result: LineCommentResult = { line: i + 1, text, language };
    results.push(result);
    const indent = text.search(/\S/);
    if (indent < 0) {
      result.skipped = "blank";
    } else {
      result.skipped = skipReasonAt(tree, lineStart, characterLanguages);
    }
    if (!result.skipped) {
      const marker = LINE_COMMENT_MARKERS[language];
      if (!marker) throw new Error(`No line comment marker for ${language}`);
      const commented = `${text.slice(0, indent)}${marker} ${text.slice(indent)}`;
      const edited = [...lines];
      edited[i] = commented;
      result.commented = commented;
      result.readAsComment = await isReadAsComment(edited, i, indent, options);
    }
    lineStart += text.length + 1;
  }
  return results;
}

export function formatLineCommentFailures(results: LineCommentResult[]): string {
  const failures = results.filter((r) => r.readAsComment === false);
  if (failures.length === 0) return "(every tested line reads as a comment)";
  return failures
    .map((r) => `  line ${r.line} [${r.language}] ${JSON.stringify(r.commented)}`)
    .join("\n");
}
