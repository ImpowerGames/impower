// SAFETY NET for incremental (delta) formatting.
//
// Format-on-save reformats only the top-level construct(s) the edit
// touched (the `incrementalDirtyRange` path in getDocumentFormattingEdits).
// That's only sound if it produces BYTE-FOR-BYTE the same result as a full
// format. This suite proves it: take a canonically-formatted document,
// corrupt one spot, then assert
//
//   delta-format(corrupted, dirtyRange) === full-format(corrupted)
//
// for corruptions in every kind of construct and at the boundary edges.
// If they ever diverge, the boundary-expansion rule is too aggressive and
// this fails loudly.

import { Text } from "@codemirror/state";
import GRAMMAR_DEFINITION from "@impower/sparkdown/language/sparkdown.language-grammar.json";
import { SparkdownCombinedAnnotator } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { TextEdit } from "vscode-languageserver";
import { describe, expect, test } from "vitest";
import { getDocumentFormattingEdits } from "../../utils/providers/getDocumentFormattingEdits";
import { diffDirtyRange } from "../../utils/providers/getFormatDirtyRange";

let cachedParser: TextmateGrammarParser | undefined;
function getParser(): TextmateGrammarParser {
  if (!cachedParser) {
    cachedParser = new TextmateGrammarParser(GRAMMAR_DEFINITION as any);
  }
  return cachedParser;
}

const OPTIONS = {
  tabSize: 2,
  insertSpaces: true,
  trimTrailingWhitespace: true,
  insertFinalNewline: true,
  trimFinalNewlines: true,
};

function applyEdits(doc: SparkdownDocument, edits: TextEdit[]): string {
  const reverse = [...edits].sort(
    (a, b) => doc.offsetAt(b.range.start) - doc.offsetAt(a.range.start),
  );
  let result = doc.getText();
  for (const edit of reverse) {
    const from = doc.offsetAt(edit.range.start);
    const to = doc.offsetAt(edit.range.end);
    result = result.slice(0, from) + edit.newText + result.slice(to);
  }
  return result;
}

// Format `source`. With `dirtyRange`, use the incremental (delta) path.
function format(
  source: string,
  dirtyRange?: { from: number; to: number },
): string {
  const normalized = source.replace(/\r\n|\r/g, "\n");
  const tree = getParser().parse(normalized);
  const doc = new SparkdownDocument("test://f.sd", "sparkdown", 1, normalized);
  const annotators = new SparkdownCombinedAnnotator();
  annotators.create(tree, Text.of(normalized.split("\n")));
  const annotations = annotators.get();
  const edits = getDocumentFormattingEdits(
    doc,
    tree,
    annotations,
    OPTIONS,
    undefined,
    undefined,
    dirtyRange,
  );
  if (!edits || edits.length === 0) return normalized;
  return applyEdits(doc, edits);
}

// A multi-construct document: external decl, define, function, and two
// scenes with dialogue + a branch — so there are several scene_begin /
// top_level_begin boundaries to scope between.
const CANONICAL = format(`external host_record(v)

define companion as character with
  store trust = 5
  greet()
    print("hi")
  end
end

function tally(a, b)
  local total = a + b
  return total
end

style panel as button with
  bg-color = surface-2
  corner = md
end

screen settings with
  column #class=root
    text #class=title "Settings"
end

scene intro
  HERO: Hello there.
  branch wave
    HERO: Waving.
  end
  done
end

scene outro
  HERO: Goodbye.
  done
end
`);

// Corrupt one line of the canonical text (by 0-based line index) and
// return the corrupted source + the byte range of the corruption.
function corruptLine(
  text: string,
  lineIndex: number,
  mutate: (line: string) => string,
): { source: string; dirtyRange: { from: number; to: number } } {
  const lines = text.split("\n");
  const before = lines.slice(0, lineIndex).join("\n");
  const from = before.length + (lineIndex > 0 ? 1 : 0);
  const original = lines[lineIndex] ?? "";
  const mutated = mutate(original);
  lines[lineIndex] = mutated;
  return {
    source: lines.join("\n"),
    dirtyRange: { from, to: from + mutated.length },
  };
}

// Corruptions that the formatter must repair, one per construct kind.
const CORRUPTIONS: { label: string; lineMatch: RegExp; mutate: (l: string) => string }[] = [
  { label: "scene-body dialogue (extra indent)", lineMatch: /HERO: Hello/, mutate: (l) => "      " + l.trim() },
  { label: "scene-body dialogue (bad spacing)", lineMatch: /Goodbye/, mutate: (l) => l.replace(":", "  :  ") },
  { label: "branch body (under-indent)", lineMatch: /Waving/, mutate: (l) => l.trim() },
  { label: "function body (expr spacing)", lineMatch: /local total/, mutate: (l) => l.replace(/\s*\+\s*/, "+") },
  { label: "define store prop (spacing)", lineMatch: /store trust/, mutate: (l) => l.replace(/\s*=\s*/, "=") },
  { label: "define method body (extra indent)", lineMatch: /print\("hi"\)/, mutate: (l) => "        " + l.trim() },
  { label: "top-level external (bad spacing)", lineMatch: /external host_record/, mutate: (l) => l.replace("(", " ( ") },
  { label: "style prop (under-indent)", lineMatch: /bg-color/, mutate: (l) => l.trim() },
  { label: "screen element (bad attr spacing)", lineMatch: /#class=title/, mutate: (l) => l.replace("=", " = ") },
];

describe("delta format ≡ full format", () => {
  const lines = CANONICAL.split("\n");
  for (const c of CORRUPTIONS) {
    test(c.label, () => {
      const lineIndex = lines.findIndex((l) => c.lineMatch.test(l));
      expect(lineIndex, `fixture line for "${c.label}"`).toBeGreaterThanOrEqual(
        0,
      );
      const { source, dirtyRange } = corruptLine(CANONICAL, lineIndex, c.mutate);
      const full = format(source);
      const delta = format(source, dirtyRange);
      expect(delta).toBe(full);
    });
  }

  test("a clean (already-formatted) doc yields no delta edits", () => {
    // Dirty range over the whole doc, but nothing to fix → identical.
    const delta = format(CANONICAL, { from: 0, to: CANONICAL.length });
    expect(delta).toBe(CANONICAL);
  });
});

// The real integration path: the dirty range comes from diffing the
// current text against the last formatted output (not hand-computed).
describe("diff-driven dirty range ≡ full format", () => {
  const lines = CANONICAL.split("\n");
  for (const c of CORRUPTIONS) {
    test(c.label, () => {
      const lineIndex = lines.findIndex((l) => c.lineMatch.test(l));
      const { source } = corruptLine(CANONICAL, lineIndex, c.mutate);
      // Baseline = the last formatted output (CANONICAL); dirty range =
      // its diff against the corrupted current text.
      const dirty = diffDirtyRange(CANONICAL, source);
      expect(dirty).not.toBeNull();
      const full = format(source);
      const delta = format(source, dirty!);
      expect(delta).toBe(full);
    });
  }
});

describe("diffDirtyRange", () => {
  test("identical texts → null", () => {
    expect(diffDirtyRange("abc", "abc")).toBeNull();
  });
  test("isolates a mid-string change", () => {
    expect(diffDirtyRange("hello world", "hello brave world")).toEqual({
      from: 6,
      to: 12,
    });
  });
  test("pure insertion at end", () => {
    expect(diffDirtyRange("abc", "abcdef")).toEqual({ from: 3, to: 6 });
  });
  test("pure deletion", () => {
    expect(diffDirtyRange("abcdef", "abef")).toEqual({ from: 2, to: 2 });
  });
});
