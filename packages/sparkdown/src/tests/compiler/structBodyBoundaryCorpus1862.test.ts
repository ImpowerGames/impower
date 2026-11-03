import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { beforeAll, describe, expect, test } from "vitest";
import {
  bodyProbes,
  type BodyProbe,
  type BoundaryFailure,
  type DeclarationLine,
  declarationLines,
  readCorpus,
  treeBodyFailures,
  treeDeclarationFailures,
  vscodeBodyFailures,
  vscodeDeclarationFailures,
} from "./structBodyBoundaryCorpus";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");

const UNRECOGNIZED_DECLARATIONS: Record<string, string> = {
  "style panel":
    "a header with nothing after its name has the same text as an element named `style` with one word after it",
  "layout hud":
    "a header with nothing after its name has the same text as an element named `layout` with one word after it",
  "theme bare":
    "a header with nothing after its name has the same text as an element named `theme` with one word after it",
  "@native":
    "an attribute alone on its line: the function it marks is on the next line, which no pattern reads, and a layout body reads a line that starts with `@` as its element's event",
  "@[native]":
    "an attribute list alone on its line: the function it marks is on the next line, which no pattern reads",
  "@[deprecated{reason = [====[x]y]====]}] function s() return 6 end":
    "an attribute list holding a long bracket of level four or more with a `]` inside, which the attribute reader shared with header line starts does not read",
};

let lines: DeclarationLine[] = [];
let probes: BodyProbe[] = [];

beforeAll(() => {
  const corpus = readCorpus(ROOT);
  lines = declarationLines(corpus);
  probes = bodyProbes(corpus);
}, 600000);

const unexpected = (failures: BoundaryFailure[]) =>
  failures
    .filter((failure) => !(failure.text in UNRECOGNIZED_DECLARATIONS))
    .map((failure) => `${failure.check} | ${failure.path} | ${failure.text}`);

describe("an unclosed struct keyword brace body and the repository's declarations", () => {
  test("the corpus holds every declaration form the compiler counts", () => {
    const nodes = new Set(lines.map((line) => line.node));
    for (const node of [
      "LuauDefine",
      "LuauStyle",
      "LuauLayout",
      "LuauScreen",
      "LuauComponent",
      "LuauAnimation",
      "LuauTheme",
      "LuauMorph",
      "LuauSparkdownVariableDefinition",
      "LuauFunctionDefinition",
      "LuauFunctionAttributes",
      "LuauFunctionTypeDeclaration",
      "LuauDataTypeDeclaration",
      "LuauExternalDeclaration",
      "LuauSparkdownExplicitStatement",
      "Run",
    ]) {
      expect(nodes, node).toContain(node);
    }
    expect(probes.length).toBeGreaterThan(100);
  });

  test("every column-0 declaration line stays outside the body in the tree engine", () => {
    expect(unexpected(treeDeclarationFailures(lines))).toEqual([]);
  }, 600000);

  test("every column-0 declaration line stays outside the body in VS Code's engine", async () => {
    expect(unexpected(await vscodeDeclarationFailures(lines))).toEqual([]);
  }, 600000);

  test("each declaration form left unrecognized is listed with its reason, and still occurs", () => {
    const failed = new Set(treeDeclarationFailures(lines).map((failure) => failure.text));
    expect([...failed].sort()).toEqual(Object.keys(UNRECOGNIZED_DECLARATIONS).sort());
  }, 600000);
});

describe("a struct keyword brace body whose entries all start at column 0", () => {
  test("ends where the same body indented ends, in the tree engine", () => {
    expect(treeBodyFailures(probes).map((f) => `${f.path}\n${f.text}`)).toEqual([]);
  }, 600000);

  test("ends where the same body indented ends, in VS Code's engine", async () => {
    expect((await vscodeBodyFailures(probes)).map((f) => `${f.path}\n${f.text}`)).toEqual([]);
  }, 600000);
});
