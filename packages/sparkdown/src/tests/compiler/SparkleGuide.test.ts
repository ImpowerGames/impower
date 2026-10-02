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
        // `slot footer` and `fill footer { … }` name a slot with a bare
        // word; anything else after an element's name is a bare class.
        const element = [...stack]
          .reverse()
          .find(
            (n) =>
              n.name === "LuauSparkleElement" ||
              n.name === "LuauStructBareMarker",
          );
        const tag = element
          ? /^[\w-]+/.exec(textOf(element.from, element.to))?.[0]
          : undefined;
        if (tag !== "slot" && tag !== "fill") {
          oldForms.push(
            `${where}: the bare class \`${textOf(node.from, node.to)}\``,
          );
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
