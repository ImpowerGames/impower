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

// #1232: the Sparkle guide teaches the brace bodies and dotted classes of
// #1222. Every `layout`, `component`, `style`, `animation` and `theme`
// declaration in its fenced examples must compile without an error, and none
// may use the old forms: a `name:` header, a `-` list item, or a class written
// as a bare word after an element's name.

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

/** The bare-word classes of a style rule's selector (`> text title`,
 *  `& secondary`, `[data-x] secondary`). A selector is compounds joined by
 *  combinators (`>`, `>>`, `+`, `~`) or listed with `,`. Within a compound,
 *  a state (`@hovered`) or a class (`.title`) may follow after whitespace,
 *  but a later word that starts like a name is a bare class. Attribute
 *  selectors, a state's arguments and quoted text may hold spaces, so each
 *  is first reduced to a token without them (quotes read whole, so a `]`
 *  or `)` inside one does not end it). */
function selectorBareClasses(selector: string): string[] {
  const compounds = selector
    .replace(/\[(?:"[^"]*"|'[^']*'|[^\]"'])*\]/g, "[]")
    .replace(/\((?:"[^"]*"|'[^']*'|[^)"'])*\)/g, "()")
    .replace(/"[^"]*"|'[^']*'/g, '""')
    .split(/>>|>|\+|~|,/);
  return compounds.flatMap((compound) =>
    compound
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(1)
      .filter((word) => /^[\p{L}\p{N}_-]/u.test(word)),
  );
}

/** Each declaration of the five kinds in a source, and every old-form mark
 *  inside one, as `line: what`. */
function readDeclarations(code: string) {
  const declarations: Declaration[] = [];
  const oldForms: string[] = [];
  const stack: { name: string; from: number; to: number }[] = [];
  const inside = () => stack.some((n) => DECLARATIONS.has(n.name));
  const textOf = (from: number, to: number) => code.slice(from, to);
  parseSource(code).iterate({
    enter: (node) => {
      const parent = stack[stack.length - 1];
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
      if (node.name === "LuauStructObjectColon") {
        oldForms.push(`${where}: a \`:\` header`);
      } else if (node.name === "LuauStructArrayItem") {
        oldForms.push(`${where}: a \`-\` item`);
      } else if (
        node.name === "LuauSparkleElementWord" ||
        ((node.name === "CustomComponentName" ||
          node.name === "BuiltinComponentName") &&
          parent?.name === "LuauStructBareMarker_c4")
      ) {
        // `slot footer` and `fill footer { … }` name a slot with one bare
        // word; any other word after an element's name is a bare class.
        const element = [...stack]
          .reverse()
          .find(
            (n) =>
              n.name === "LuauSparkleElement" ||
              n.name === "LuauStructBareMarker",
          );
        const head = element ? textOf(element.from, node.from) : "";
        const isSlotName = /^(slot|fill)\s+$/.test(head);
        if (!isSlotName) {
          oldForms.push(
            `${where}: the bare class \`${textOf(node.from, node.to)}\``,
          );
        }
      } else if (
        node.name === "LuauStructBlockKey" &&
        stack.some((n) => n.name === "LuauStyle")
      ) {
        for (const word of selectorBareClasses(textOf(node.from, node.to))) {
          oldForms.push(`${where}: the bare class \`${word}\` in a selector`);
        }
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

// A fragment of a layout body (`button "Save"`) is read inside a layout, so
// it is held to the same rules; line numbers in its messages count the
// layout's first line.
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

// The check above is only as good as what it can see, so it is pinned here
// on old forms it must report and new forms it must accept.
const style = (rule: string) =>
  `style dialogue with\n  ${rule} { color = red }\nend\n`;
const layout = (body: string) => `layout hud with\n  ${body}\nend\n`;

describe("the guide's old-form check", () => {
  test.each([
    ["a `:` header", layout(`column:\n    text "a"`)],
    [
      "a `-` item",
      `animation a with\n  keyframes:\n    -\n      opacity = 0\nend\n`,
    ],
    ["a bare class on an indented line", layout(`text title "a"`)],
    ["a bare class in a block", layout(`row { text title "a" }`)],
    ["a non-ASCII bare class in a block", layout(`row { text заголовок "a" }`)],
    ["a second word after a slot's name", layout(`box { slot footer extra }`)],
    ["a bare class after a selector's name", style("> text headline")],
    ["a bare class after `&`", style("& secondary")],
    ["a bare class after a non-ASCII name", style("> текст headline")],
    ["a non-ASCII bare class", style("> text заголовок")],
    [
      "a bare class after a non-ASCII class",
      style("> text.заголовок secondary"),
    ],
    [
      "a bare class after a hyphen-ending class",
      style("> text.headline- secondary"),
    ],
    ["a bare class after `&` and a class", style("&.secondary- extra")],
    ["a bare class in a selector list", style("@hovered, > text headline")],
    [
      "a bare class after an attribute selector",
      style(`[data-label="a b"] secondary`),
    ],
  ])("reports %s", (_, source) => {
    expect(readDeclarations(source).oldForms).not.toEqual([]);
  });

  test.each([
    [
      "dotted classes",
      layout(`row.hud { text.title "a"; text.заголовок "b" }`),
    ],
    [
      "a slot name and a fill",
      layout(`box { slot footer }\n  card { fill footer { text } }`),
    ],
    ["combinators", style("> text + image ~ mask, >> stroke")],
    ["`&` with a class", style("&.secondary")],
    ["states and breakpoints", style("@hovered, @pressed")],
    ["a breakpoint before a combinator", style("@screen-size(sm) > text")],
    ["an attribute selector with a space", style(`&[data-label="a b"]`)],
    [
      "an attribute selector with a `]` in its value",
      style(`&[data-label="a] b"]`),
    ],
    ["states after a state", style("@hovered @before, @focused @before")],
    ["a state after a name", style("> text @hovered")],
    ["a spaced dotted class", style("> text .headline")],
    ["a non-ASCII dotted class", style("> text.заголовок")],
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
