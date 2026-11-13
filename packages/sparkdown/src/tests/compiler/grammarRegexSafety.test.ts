import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GRAMMAR_PATH = join(
  __dirname,
  "../../../language/sparkdown.language-grammar.json",
);

const grammar = JSON.parse(readFileSync(GRAMMAR_PATH, "utf8"));

function collectPatterns(): { where: string; source: string }[] {
  const out: { where: string; source: string }[] = [];
  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`));
    } else if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (
          typeof v === "string" &&
          (k === "match" || k === "begin" || k === "end" || k === "while")
        ) {
          out.push({ where: `${path}.${k}`, source: v });
        } else {
          walk(v, `${path}.${k}`);
        }
      }
    }
  };
  walk(grammar, "$");
  return out;
}

describe("grammar regex safety (#280)", () => {
  test("no pattern quantifies a group containing a nullable whitespace-star alternative", () => {
    const bombArm = String.raw`|(?:[^\S\n\r])*)`;
    const bombArmFirst = String.raw`((?:[^\S\n\r])*|`;
    const offenders = collectPatterns().filter(
      ({ source }) =>
        source.includes(bombArm + "*") ||
        source.includes(bombArm + "+") ||
        source.includes(bombArmFirst),
    );
    expect(
      offenders.map((o) => o.where),
      "quantified groups must not contain a nullable whitespace-star alternative " +
        "(each iteration must consume at least one character, uniquely)",
    ).toEqual([]);
  });

  test("ParentheticalLine fails fast on a deeply indented non-matching line", () => {
    const source = grammar.repository?.ParentheticalLine?.match;
    expect(source, "ParentheticalLine.match exists").toBeTruthy();
    const re = new RegExp(source, "muy");
    const line = " ".repeat(28) + "[Seen 7:21 PM]";
    re.lastIndex = 0;
    const t0 = performance.now();
    const result = re.exec(line);
    const ms = performance.now() - t0;
    expect(result).toBeNull();
    expect(ms, `ParentheticalLine took ${ms.toFixed(1)}ms on the adversarial line`).toBeLessThan(250);
  });

  test("every grammar pattern completes quickly on whitespace-heavy adversarial lines", () => {
    const adversarials = [
      " ".repeat(28) + "[Seen 7:21 PM]",
      " ".repeat(28) + "x".repeat(20),
      "\t".repeat(28) + "(",
      " ".repeat(28) + "= < unclosed",
    ];
    const slow: string[] = [];
    for (const { where, source } of collectPatterns()) {
      let re: RegExp;
      try {
        re = new RegExp(source, "muy");
      } catch {
        continue;
      }
      for (const line of adversarials) {
        re.lastIndex = 0;
        const t0 = performance.now();
        re.exec(line);
        if (performance.now() - t0 > 100) {
          slow.push(`${where} on ${JSON.stringify(line.slice(0, 20))}...`);
          break;
        }
      }
    }
    expect(slow, "patterns exceeding 100ms on adversarial lines").toEqual([]);
  });
});

const CHOICE_CLOSE_SEARCHES: [string, string, "begin" | "match", string][] = [
  ["unclosed braces in a suppression", "ChoiceSuppression", "begin", "[" + "{".repeat(20000) + " -> next]"],
  ["unclosed `{1` in a suppression", "ChoiceSuppression", "begin", "[a" + " {1".repeat(20000) + " -> next]"],
  [
    "interpolations in a suppression with no `]` and a comment that closes",
    "ChoiceSuppression",
    "begin",
    "[a" + " {1}".repeat(30000) + " -> next /* c */",
  ],
  ["comment openers in a text command", "ChoiceStartTextContent", "match", "Go <wait" + " /*".repeat(8000) + " now"],
  ["comment openers in an audio command", "ChoiceStartTextContent", "match", "Go ((a" + " /*".repeat(8000) + " now"],
  ["escaped comment openers in a closed text command", "ChoiceStartTextContent", "match", "Go <wait " + "\\/*".repeat(16000) + "> now"],
  [
    "escaped comment openers in a closed text command in a suppression",
    "ChoiceOnlyTextContent",
    "match",
    "Go <wait " + "\\/*".repeat(16000) + "> now",
  ],
  [
    "escaped comment openers in a closed text command in inner text",
    "ChoiceInnerTextContent",
    "match",
    "Go <wait " + "\\/*".repeat(16000) + "> now",
  ],
  ["unclosed braces in choice start text", "ChoiceStartTextContent", "match", "Go" + " {".repeat(40000) + " now"],
  ["unclosed braces in a suppression's text", "ChoiceOnlyTextContent", "match", "Go" + " {".repeat(40000) + " now"],
  ["unclosed braces in choice inner text", "ChoiceInnerTextContent", "match", "Go" + " {".repeat(40000) + " now"],
  ["unclosed braces in a styled span", "ChoiceStartSpanText", "match", "Go" + " {".repeat(40000) + " now"],
];

const SPAN_RULES = ["Raw", "Bold", "Italic", "Underline", "Centered", "EmphasisTilde", "EmphasisColon"].flatMap(
  (span) => ["", "ChoiceStart", "ChoiceOnly", "ChoiceInner"].map((region) => `${region}${span}`),
);

const SPAN_CLOSE_SEARCHES: [string, string][] = [
  ["unclosed stars", "*a ".repeat(500)],
  ["unclosed double stars", "**a ".repeat(400)],
  ["unclosed triple stars", "***a ".repeat(300)],
  ["one star before plain text", "*a" + " b".repeat(800)],
  ["unclosed underscores", "_a ".repeat(500)],
  ["unclosed double underscores", "__a ".repeat(400)],
  ["unclosed carets", "^a ".repeat(500)],
  ["unclosed tildes", "~~a ".repeat(400)],
  ["unclosed colons", "::a ".repeat(400)],
  ["unclosed backticks", "`a ".repeat(500)],
  ["stars inside words", "a*".repeat(800)],
  ["double stars inside words", "a**".repeat(500)],
  ["stars that neither open nor close", "* ".repeat(800)],
  ["every mark left open", "*a _b ^c ~~d ::e ".repeat(100)],
  ["a bold span open over closed italics", "**a" + " *b*".repeat(400)],
  ["an italic span open over closed bolds", "*a" + " **b**".repeat(250)],
  ["an underline open over closed underlines", "_a" + " _b_".repeat(400)],
  ["an italic span open over interpolations", "*a" + " {x}".repeat(400)],
  ["an italic span open over unclosed text commands", "*a" + " <b".repeat(500)],
  ["an italic span open over escaped text command ends", "*a <b" + " \\>".repeat(500)],
  ["an italic span open over comments", "*a" + " /* c */".repeat(200)],
  ["an italic span open over code spans", "*a" + " `c`".repeat(400)],
  ["an italic span open over unclosed braces", "*a" + " {".repeat(800)],
  ["a tilde span open over other tilde runs", "~~a" + " ~b~".repeat(400)],
  ["a backtick run open over other backtick runs", "`a" + " ``b".repeat(400)],
];

describe("a span whose closer never comes is refused at once wherever it could open (#2196)", () => {
  test.each(SPAN_RULES.flatMap((rule) => SPAN_CLOSE_SEARCHES.map(([what, line]) => [rule, what, line] as const)))(
    "%s on %s",
    (rule, _what, line) => {
      const source = grammar.repository?.[rule]?.match;
      expect(source, `${rule}.match exists`).toBeTruthy();
      const re = new RegExp(source, "muy");
      re.lastIndex = 0;
      re.exec("warm");
      const t0 = performance.now();
      for (let i = 0; i < line.length; i++) {
        if (!"*_^~:`".includes(line[i]!)) continue;
        re.lastIndex = i;
        re.exec(line);
      }
      const ms = performance.now() - t0;
      expect(ms, `${rule}.match took ${ms.toFixed(1)}ms`).toBeLessThan(150);
    },
  );
});

describe("a choice line that never meets a close is read at once (#2083)", () => {
  test.each(CHOICE_CLOSE_SEARCHES)("%s", (_what, rule, key, line) => {
    const source = grammar.repository?.[rule]?.[key];
    expect(source, `${rule}.${key} exists`).toBeTruthy();
    const re = new RegExp(source, "muy");
    re.lastIndex = 0;
    const t0 = performance.now();
    re.exec(line);
    const ms = performance.now() - t0;
    expect(ms, `${rule}.${key} took ${ms.toFixed(1)}ms`).toBeLessThan(100);
  });
});
