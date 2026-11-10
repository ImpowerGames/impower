import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import {
  closeMatch,
  closeMatchData,
  closeMatchDistance,
  closeMatchOf,
  expectedTextOf,
} from "../../compiler/utils/closeMatch";

describe("close match", () => {
  test.each([
    ["alcie", ["alice", "bob"], "alice"],
    ["alcie", ["alice", "alcid"], undefined],
    ["alcie", ["bob", "carol"], undefined],
    ["alcie", [], undefined],
    ["backdrp", ["backdrop", "portrait"], "backdrop"],
    ["backgrnd", ["background"], "background"],
    ["backgrnd", ["background", "backgrounds"], "background"],
    ["backround", ["background", "backgroundx"], undefined],
    ["bob", ["bab", "bub"], undefined],
    ["bob", ["bab"], "bab"],
    ["bo", ["bob"], undefined],
    ["alcie", ["alice", "alice"], "alice"],
    ["alcie", ["$default", "alice"], "alice"],
    ["alcie", ["$alcie"], undefined],
    ["alice", ["alice"], undefined],
    ["Alice", ["alice"], "alice"],
    ["portrait", ["potrait", "portraits"], undefined],
    ["warrior", ["wizard"], undefined],
  ] as const)("%s among %j is %s", (name, candidates, expected) => {
    expect(closeMatch(name, candidates)).toBe(expected);
  });

  test.each([
    ["ab", 0],
    ["abc", 1],
    ["alice", 1],
    ["alicea", 2],
    ["background_music", 2],
  ] as const)("the distance bound for %s is %i", (name, bound) => {
    expect(closeMatchDistance(name)).toBe(bound);
  });

  test("its data names the unresolved name, the match and the text it expects, and reads back", () => {
    const data = closeMatchData("alcie", ["alice"]);
    expect(data).toEqual({
      closeMatch: { name: "alcie", match: "alice" },
      expect: "alcie",
    });
    expect(closeMatchOf(data)).toEqual({ name: "alcie", match: "alice" });
    expect(expectedTextOf(data)).toBe("alcie");
    expect(closeMatchData("alcie", ["bob"])).toBeUndefined();
  });

  test.each([undefined, null, {}, [], { closeMatch: { name: 1 } }, { expect: 2 }])(
    "reads nothing from %j",
    (data) => {
      expect(closeMatchOf(data)).toBeUndefined();
      expect(expectedTextOf(data)).toBeUndefined();
    },
  );
});

const URI = "file:///main.sd";
const lines = (...text: string[]) => text.join(String.fromCharCode(10));
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg"><g data-name="face.happy:default" id="happy"/><g data-name="face.sad" id="sad"/></svg>';
const define = (name: string) =>
  lines(`define ${name} as image with`, `  src = "https://example.com/${name}.png"`, "end", "");
const scene = (s: number, reference: string, attribute = "happy") =>
  lines(`scene scene_${s}`, `  Room ${s}.`, `  [[show backdrop ${reference}]]`, `  [[mia:${attribute}]]`, "end", "");
const script = (misspelled: string) =>
  lines(
    "define pace as config with",
    "  speed = 5",
    "end",
    "",
    ...Array.from({ length: 6 }, (_, s) => scene(s, s === 0 ? misspelled : "mia")),
  );

const quiet = <T>(fn: () => T): T => {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = warn;
    console.error = error;
  }
};

const compilerFor = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
      { uri: "file:///mia.svg", type: "image", name: "mia", ext: "svg", data: SVG },
    ],
  } as never);
  return compiler;
};

const misspelling = (compiler: SparkdownCompiler, name: string) =>
  quiet(() => compiler.compile({ textDocument: { uri: URI } })).program.diagnostics?.[URI]?.find((d) =>
    (typeof d.message === "string" ? d.message : d.message.value).endsWith(`named \`${name}\``),
  );

const positionAt = (text: string, offset: number) => {
  const before = text.slice(0, offset).split(String.fromCharCode(10));
  return { line: before.length - 1, character: before.at(-1)!.length };
};

const edit = (compiler: SparkdownCompiler, text: string, find: string, replace: string, version: number) => {
  const offset = text.indexOf(find);
  expect(offset).toBeGreaterThanOrEqual(0);
  compiler.updateDocument({
    textDocument: { uri: URI, version },
    contentChanges: [
      { range: { start: positionAt(text, offset), end: positionAt(text, offset + find.length) }, text: replace },
    ],
  } as never);
  return text.slice(0, offset) + replace + text.slice(offset + find.length);
};

const warmed = (misspelled: string) => {
  const compiler = compilerFor(script(misspelled));
  misspelling(compiler, misspelled);
  const text = edit(compiler, script(misspelled), "Room 3.", "Room 3!", 2);
  misspelling(compiler, misspelled);
  return { compiler, text };
};

describe("close match after an edit", () => {
  test("follows names a define in another chunk adds and removes, as a cold compile does", () => {
    let { compiler, text } = warmed("alcie");
    const match = { closeMatch: { name: "alcie", match: "alice" }, expect: "alcie" };
    const steps: [string, string, unknown][] = [
      ["define pace", define("alice") + "define pace", match],
      ["define pace", define("alcid") + "define pace", undefined],
      [define("alcid"), "", match],
      [define("alice"), "", undefined],
    ];
    for (const [index, [find, replace, data]] of steps.entries()) {
      text = edit(compiler, text, find, replace, index + 3);
      const warm = misspelling(compiler, "alcie");
      expect(warm).toBeDefined();
      expect(warm?.data).toEqual(data);
      expect(warm?.data).toEqual(misspelling(compilerFor(text), "alcie")?.data);
    }
  });

  test("re-checks a kept chunk when a directive in another chunk adds or removes a close name", () => {
    let { compiler, text } = warmed("miawink");
    expect(misspelling(compiler, "miawink")?.data).toBeUndefined();

    text = edit(compiler, text, scene(4, "mia"), scene(4, "mia", "wink"), 3);
    const added = misspelling(compiler, "miawink");
    expect(compiler.referenceValidationStats.chunksServed).toBeGreaterThan(0);
    expect(added?.data).toEqual({
      closeMatch: { name: "miawink", match: "mia~wink" },
      expect: "miawink",
    });
    expect(added?.data).toEqual(misspelling(compilerFor(text), "miawink")?.data);

    text = edit(compiler, text, scene(4, "mia", "wink"), scene(4, "mia"), 4);
    const removed = misspelling(compiler, "miawink");
    expect(compiler.referenceValidationStats.chunksServed).toBeGreaterThan(0);
    expect(removed?.data).toBeUndefined();
  });
});
