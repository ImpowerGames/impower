// Inline rich text tags inside content strings are TOKENIZED by the grammar, so
// the editor highlights them instead of showing markup as flat string text —
// and so a tag-shaped token whose name isn't in the vocabulary can be reported.
//
// The runtime deliberately leaves an unknown tag as literal characters (that's
// what lets prose like `5 < 6` survive), which means a typo renders verbatim in
// the UI. Two grammar rules keep that distinction structural rather than
// re-derived downstream: `SparkleRichTextTag` (recognized) and
// `SparkleRichTextTagUnknown` (tag-shaped, unrecognized).

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { dumpTree, stripAnsi } from "./grammarSnapshot";

function nodeNames(source: string): string[] {
  const dump = stripAnsi(dumpTree(source));
  return dump
    .split("\n")
    .map((l) => l.match(/([A-Za-z_]+)(?: \[|\s+\d)/)?.[1] ?? "")
    .filter(Boolean);
}

function diagnose(source: string): string[] {
  const compiler = new SparkdownCompiler();
  const uri = "inmemory:///main.sd";
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({ textDocument: { uri } });
  const out: string[] = [];
  for (const ds of Object.values(result.program.diagnostics ?? {})) {
    for (const d of ds as any[]) {
      out.push(
        typeof d?.message === "string" ? d.message : (d?.message?.value ?? ""),
      );
    }
  }
  return out;
}

const layout = (line: string) => `layout main with\n  ${line}\nend\n`;

describe("rich text tags · tokenization", () => {
  test("recognized tags are their own nodes, not string characters", () => {
    const names = nodeNames(
      layout('text "a <b>bold</b> and <color=sky_60>tint</color>"'),
    );
    // Two opens + two closes.
    expect(names.filter((n) => n === "SparkleRichTextTag").length).toBe(4);
    expect(names).not.toContain("SparkleRichTextTagUnknown");
  });

  test("a tag-shaped token with an unknown name is a DISTINCT node", () => {
    const names = nodeNames(layout('text "a <notatag>x"'));
    expect(names).toContain("SparkleRichTextTagUnknown");
  });

  test("prose that merely contains `<` is not a tag at all", () => {
    const names = nodeNames(layout('text "5 < 6 and a > b"'));
    expect(names).not.toContain("SparkleRichTextTag");
    expect(names).not.toContain("SparkleRichTextTagUnknown");
  });

  test("tags are tokenized inside INTERPOLATED strings too", () => {
    const names = nodeNames(
      "store n = 1\n" + layout('text "count <b>{n}</b> done"'),
    );
    expect(names.filter((n) => n === "SparkleRichTextTag").length).toBe(2);
  });
});

describe("rich text tags · diagnostics", () => {
  test("an unknown tag warns", () => {
    const msgs = diagnose(layout('text "a <bold>x</bold>"'));
    expect(msgs.some((m) => m.includes("Unrecognized rich text tag"))).toBe(
      true,
    );
    expect(msgs.some((m) => m.includes("`<bold>`"))).toBe(true);
  });

  test("recognized tags do not warn", () => {
    const msgs = diagnose(
      layout(
        'text "<b>a</b><i>b</i><u>c</u><s>d</s><sub>e</sub><sup>f</sup><mark=amber_60>g</mark><color=sky_60>h</color><size=2rem>i</size><br><noparse>x</noparse>"',
      ),
    );
    expect(msgs).toEqual([]);
  });

  test("prose with `<` does not warn", () => {
    expect(diagnose(layout('text "5 < 6, a > b, x <- y"'))).toEqual([]);
  });

  // Rich text is only parsed in element CONTENT, so a tag in a prop VALUE is
  // inert rather than misspelled — warning there would be wrong.
  test("a tag inside a #prop value does not warn", () => {
    expect(
      diagnose(layout('field #placeholder="type <b>here</b>"')),
    ).toEqual([]);
  });
});
