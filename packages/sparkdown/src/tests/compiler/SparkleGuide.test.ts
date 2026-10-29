import "./compileSnapshot";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { parseSource } from "./grammarSnapshot";
import {
  asScript,
  BRACE_CHAPTERS,
  guideChapters,
  guideExamples,
  isLayoutFragment,
  type GuideExample,
} from "./guideExamples";

const DECLARATIONS = new Set([
  "LuauLayout",
  "LuauComponent",
  "LuauStyle",
  "LuauAnimation",
  "LuauTheme",
]);

const URI = "file:///project/main.sd";

interface Declaration {
  from: number;
  to: number;
  text: string;
}

function lineOf(code: string, offset: number): number {
  return code.slice(0, offset).split("\n").length;
}

const SELECTOR_NAME = String.raw`[_\p{L}][_\p{L}\p{N}-]*`;
const ALLOWED_SELECTOR = new RegExp(
  String.raw`^(?:(?:>>?\s+)?(?:&|${SELECTOR_NAME})(?:\.${SELECTOR_NAME})*|@${SELECTOR_NAME}(?:\(${SELECTOR_NAME}\))?)`,
  "u",
);
const BARE_WORD = new RegExp(
  String.raw`^${SELECTOR_NAME}(?:\.${SELECTOR_NAME})*$`,
  "u",
);

function checkSelector(selector: string): {
  bareClasses: string[];
  unrecognised?: string;
} {
  const allowed = ALLOWED_SELECTOR.exec(selector)?.[0];
  if (allowed === selector) return { bareClasses: [] };
  const rest = allowed === undefined ? "" : selector.slice(allowed.length);
  const words = rest.trim().split(/\s+/);
  if (/^\s/.test(rest) && words.every((w) => BARE_WORD.test(w))) {
    return { bareClasses: words.map((w) => w.split(".")[0]!) };
  }
  return {
    bareClasses: [],
    unrecognised:
      `the selector \`${selector}\` has a shape the guide's allowlist does ` +
      `not describe; if the guide is meant to teach it, extend ` +
      `ALLOWED_SELECTOR in SparkleGuide.test.ts and add a control`,
  };
}

function readDeclarations(code: string) {
  const declarations: Declaration[] = [];
  const oldForms: string[] = [];
  const stack: { name: string; from: number; to: number }[] = [];
  const inside = () => stack.some((n) => DECLARATIONS.has(n.name));
  const textOf = (from: number, to: number) => code.slice(from, to);
  parseSource(code).iterate({
    enter: (node) => {
      stack.push({ name: node.name, from: node.from, to: node.to });
      if (DECLARATIONS.has(node.name)) {
        declarations.push({
          from: node.from,
          to: node.to,
          text: textOf(node.from, node.to),
        });
        return;
      }
      if (!inside()) return;
      const where = `${lineOf(code, node.from)}`;
      if (node.name === "LuauStructInvalidColon") {
        oldForms.push(`${where}: a \`:\` header`);
      } else if (node.name === "LuauStructBlockItemMark") {
        oldForms.push(`${where}: a \`-\` item`);
      } else if (
        node.name === "LuauStructBlockKey" &&
        stack.some((n) => n.name === "LuauStyle")
      ) {
        const check = checkSelector(textOf(node.from, node.to));
        for (const word of check.bareClasses) {
          oldForms.push(`${where}: the bare class \`${word}\` in a selector`);
        }
        if (check.unrecognised)
          oldForms.push(`${where}: ${check.unrecognised}`);
      }
    },
    leave: () => {
      stack.pop();
    },
  });
  return { declarations, oldForms };
}

function errorsIn(code: string, declarations: Declaration[]): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        version: 1,
        languageId: "sparkdown",
        text: code,
      },
    ],
  } as any);
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  const lineStarts = [0];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === "\n") lineStarts.push(i + 1);
  }
  return (program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === 1)
    .filter((d) => {
      const offset =
        (lineStarts[d.range.start.line] ?? code.length) +
        d.range.start.character;
      return declarations.some((n) => offset >= n.from && offset < n.to);
    })
    .map(
      (d) =>
        `${d.range.start.line + 1}: ${
          typeof d.message === "string" ? d.message : d.message.value
        }`,
    );
}

const label = (e: GuideExample) => `${e.chapter}:${e.line}`;

const EXAMPLES = guideChapters()
  .flatMap(guideExamples)
  .map((e) => ({ ...e, script: asScript(e.code) }));
const WITH_DECLARATIONS = EXAMPLES.filter(
  (e) => readDeclarations(e.script).declarations.length > 0,
);
const CASES = WITH_DECLARATIONS.map((e) => [label(e), e] as const);

describe("the Sparkle guide's examples", () => {
  test("every rewritten chapter has a declaration to compile", () => {
    for (const chapter of BRACE_CHAPTERS) {
      expect(
        EXAMPLES.some(
          (e) =>
            e.chapter === chapter &&
            !isLayoutFragment(e.code) &&
            readDeclarations(e.script).declarations.length > 0,
        ),
        chapter,
      ).toBe(true);
    }
  });

  test.each(CASES)(
    "%s compiles with no error in its declarations",
    (_, example) => {
      const { declarations } = readDeclarations(example.script);
      expect(errorsIn(example.script, declarations)).toEqual([]);
    },
  );

  test.each(CASES)(
    "%s uses no `:` header, `-` item or bare-word class",
    (_, example) => {
      expect(readDeclarations(example.script).oldForms).toEqual([]);
    },
  );
});

const style = (rule: string) =>
  `style dialogue with\n  ${rule} { color = red }\nend\n`;
const layout = (body: string) => `layout hud with\n  ${body}\nend\n`;

describe("the guide's old-form check", () => {
  test.each([
    ["a `:` header", layout(`column:\n    text "a"`)],
    [
      "a `-` item",
      `animation a with\n  keyframes {\n    -\n      opacity = 0\n  }\nend\n`,
    ],
  ])("reports %s", (_, source) => {
    expect(readDeclarations(source).oldForms).not.toEqual([]);
  });

  test.each([
    ["after a selector's name", "> text headline", "headline"],
    ["after `&`", "& secondary", "secondary"],
    ["after a non-ASCII name", "> текст headline", "headline"],
    ["that is non-ASCII", "> text заголовок", "заголовок"],
    ["after a non-ASCII class", "> text.заголовок secondary", "secondary"],
    ["after a hyphen-ending class", "> text.headline- secondary", "secondary"],
    ["after `&` and a class", "&.secondary- extra", "extra"],
    ["after a state", "@hovered secondary", "secondary"],
  ])("reports a bare class %s", (_, selector, word) => {
    expect(readDeclarations(style(selector)).oldForms).toEqual([
      `2: the bare class \`${word}\` in a selector`,
    ]);
  });

  test.each([
    ["a selector list", "@hovered, > text headline"],
    [
      "an attribute selector before a bare class",
      `[data-label="a b"] secondary`,
    ],
    [
      "attribute selectors with escaped quotes",
      `&[data-label="a\\""] secondary [data-other="b\\""]`,
    ],
    ["a single-quoted escaped quote", `&[data-label='a\\''] secondary`],
    ["an `:is` argument", "&:is(.button primary, .link secondary)"],
    ["a `:not` argument", "&:not(.primary secondary)"],
    ["a `:has` argument", "&:has(> .button primary)"],
    [
      "dotted classes in selector functions",
      "&:is(.button.primary, .link.secondary)",
    ],
    ["combinators the guide does not use", "> text + image ~ mask, >> stroke"],
    ["a list of states", "@hovered, @pressed"],
    ["a breakpoint before a combinator", "@screen-size(sm) > text"],
    ["an attribute selector", `&[data-label="a] b"]`],
    ["an escaped quote in an attribute", `&[data-label="a\\" b"]`],
    ["a state after a state", "@hovered @before"],
    ["a state after a name", "> text @hovered"],
    ["a spaced dotted class", "> text .headline"],
  ])("reports %s as a shape outside the allowlist", (_, selector) => {
    const found = readDeclarations(style(selector)).oldForms;
    expect(found.some((m) => m.includes("allowlist does not describe"))).toBe(
      true,
    );
  });

  test.each([
    ["`> text`", style("> text")],
    ["`> text.headline`", style("> text.headline")],
    ["`>> image`", style(">> image")],
    ["`@screen-size(sm)`", style("@screen-size(sm)")],
    ["`@hovered`", style("@hovered")],
    ["`&.secondary`", style("&.secondary")],
    ["several dotted classes", style("> text.headline.large")],
    ["a non-ASCII dotted class", style("> text.заголовок")],
    ["a bare element name", style("text")],
    [
      "dotted classes in a layout",
      layout(`row.hud { text.title "a"; text.заголовок "b" }`),
    ],
    [
      "a slot name and a fill",
      layout(`box { slot.footer }\n  card { fill.footer { text } }`),
    ],
    [
      "a theme key of two words",
      `theme dusk with\n  font sizes { sm = 10px; lg = 20px }\nend\n`,
    ],
    [
      "keyframe positions",
      `animation fade with\n  keyframes {\n    from { opacity = 0 }\n    40% { opacity = 1 }\n  }\nend\n`,
    ],
  ])("accepts %s", (_, source) => {
    expect(readDeclarations(source).oldForms).toEqual([]);
  });
});
