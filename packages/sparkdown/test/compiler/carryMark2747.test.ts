import "./compileSnapshot";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../src/compiler/classes/SparkdownCompiler";
import { NO_START_SCENE_MESSAGE } from "../../src/compiler/utils/startScene";
import { parseSource } from "./grammarSnapshot";
import { guideExamples } from "./guideExamples";
import { tokenize } from "./vscodeGrammarSnapshot";

const __dirname = dirname(fileURLToPath(import.meta.url));

const marks = (source: string): string[] => {
  const tree = parseSource(source);
  const out: string[] = [];
  tree.iterate({
    enter: (node) => {
      if (node.name === "Break" || node.name === "Carry") {
        out.push(`${node.name} ${JSON.stringify(source.slice(node.from, node.to))}`);
      }
    },
  });
  return out;
};

const scene = (line: string): string => `scene start\n  ${line}\nend\n`;

const markScopes = async (source: string): Promise<string[]> =>
  (await tokenize(source))
    .flatMap((line) => line.tokens)
    .filter((token) => token.text.includes(">"))
    .map((token) => `${JSON.stringify(token.text)} ${token.scopes.at(-1)}`);

describe("`>>` at the end of a line", () => {
  test("reads as the carry mark", () => {
    expect(marks(scene("RAFFLES: meet me outside >>"))).toEqual(['Carry " >>"']);
    expect(marks(scene("A notification >>  "))).toEqual(['Carry " >>  "']);
  });

  test("reads as the mark before a tag, a comment or a wait", () => {
    expect(marks(scene("She waits >> # pause"))).toEqual(['Carry " >> "']);
    expect(marks(scene("She waits >> // aside"))).toEqual(['Carry " >> "']);
    expect(marks(scene("BUNNY: What's plan b? <wait=0.6> >>"))).toEqual(['Carry " >>"']);
    expect(marks(scene("She waits >> /* aside */"))).toEqual(['Carry " >> "']);
  });

  test("before a block comment with text after it stays two breaks", () => {
    expect(marks(scene("<speed=0>First >> /* aside */ middle"))).toEqual([
      'Break " >"',
      'Break "> "',
    ]);
  });

  test("reads as the mark after a `..`", () => {
    expect(marks(scene("Hold on ..>>"))).toEqual(['Carry ">>"']);
  });

  test("is highlighted as a mark in the VS Code grammar", async () => {
    expect(await markScopes(scene("RAFFLES: meet me outside >>"))).toEqual([
      '" >>" keyword.other.carry.sd',
    ]);
  });

  test("is the same rule in both generated grammars", () => {
    const read = (path: string) =>
      JSON.parse(readFileSync(join(__dirname, path), "utf8")).repository.Carry;
    const own = read("../../language/sparkdown.language-grammar.json");
    expect(own).toBeDefined();
    expect(read("../../../../vscode-sparkdown/language/sparkdown.language-grammar.json")).toEqual(own);
  });
});

describe("`>>` elsewhere on a line", () => {
  test("in the middle of a line stays two breaks", () => {
    expect(marks(scene("Wait >> there."))).toEqual(['Break " >"', 'Break "> "']);
    expect(marks(scene("Wait>>there."))).toEqual(['Break ">"', 'Break ">"']);
  });

  test("a third `>` before the end keeps every `>` a break", () => {
    expect(marks(scene("Wait >>>"))).toEqual(['Break " >"', 'Break ">"', 'Break ">"']);
  });

  test("inside a tag or a choice is not a mark", () => {
    expect(marks(scene("A <speed=0>line<wait=1>"))).toEqual([]);
    expect(marks(scene("+ [Go >> there] You go."))).toEqual([]);
  });
});

const CAST = ["RAFFLES", "BUNNY", "ALICE"]
  .map((name) => `define ${name} as character with\n  name = "${name}"\nend\n`)
  .join("\n");

describe("the Joining Lines guide's `>>` and tag examples (I-2747)", () => {
  const examples = guideExamples("JoiningLines.md").filter((example) =>
    /<wait=|<speed=|>>/.test(example.code),
  );

  test("cover the mark and both tags", () => {
    const all = examples.map((example) => example.code).join("");
    expect(all).toContain(">>");
    expect(all).toContain("<wait=");
    expect(all).toContain("<speed=");
  });

  test.each(examples.map((example) => [`JoiningLines.md:${example.line}`, example.code] as const))(
    "%s compiles with no diagnostics",
    (_, code) => {
      const uri = "file:///main.sd";
      const compiler = new SparkdownCompiler();
      compiler.configure({
        files: [
          { uri, type: "script", name: "main", ext: "sd", text: `${CAST}\n${code}`, version: 1, languageId: "sparkdown" },
        ] as never,
      });
      const program = compiler.compile({ textDocument: { uri } }).program;
      const messages = (program.diagnostics?.[uri] ?? [])
        .map((d) => (typeof d.message === "string" ? d.message : d.message.value))
        .filter((message) => message !== NO_START_SCENE_MESSAGE);
      expect(messages).toEqual([]);
    },
  );
});
