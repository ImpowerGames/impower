import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { characterNames, cueCharacter } from "@impower/sparkdown/src/compiler/utils/cueCharacter";
import { describe, expect, test, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import { getCopiedScriptTexts } from "../../utils/providers/getCopiedScriptTexts";

const ROOT = "file:///proj/";
const MAIN = `${ROOT}main.sd`;
const MAIN_TEXT = lines("scene start", "  Hi.", "end");

function lines(...text: string[]) {
  return [...text, ""].join(String.fromCharCode(10));
}

const message = (d: { message?: unknown }): string =>
  typeof d.message === "string" ? d.message : String((d.message as { value?: string })?.value ?? "");

const compile = (scripts: Record<string, string>) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: Object.entries(scripts).map(([uri, text]) => ({
      uri,
      type: "script",
      name: uri.slice(uri.lastIndexOf("/") + 1, uri.lastIndexOf(".")),
      ext: "sd",
      text,
      version: 1,
      languageId: "sparkdown",
    })) as never,
  });
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return compiler.compile({ textDocument: { uri: MAIN } }).program;
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

const problems = (scripts: Record<string, string>) =>
  Object.entries(compile(scripts).diagnostics ?? {}).flatMap(([uri, list]) =>
    (list as { message?: unknown; range: { start: { line: number } } }[]).map(
      (d) => `${uri.slice(ROOT.length)}:${d.range.start.line + 1} ${message(d)}`,
    ),
  );

const duplicate = (
  originals: Record<string, string>,
  copyUri: (uri: string) => string,
  suffix: string,
  others: Record<string, string> = {},
) => {
  const scripts = { [MAIN]: MAIN_TEXT, ...others, ...originals };
  const documents = new SparkdownDocumentRegistry(["links", "references", "declarations"]);
  for (const [uri, text] of Object.entries(scripts)) {
    documents.add({ textDocument: { uri, languageId: "sparkdown", version: 1, text } });
  }
  const workspace = Object.create(SparkdownLanguageServerWorkspace.prototype) as SparkdownLanguageServerWorkspace;
  Object.assign(workspace, {
    _documents: documents,
    _watchedFiles: new Map(Object.keys(scripts).map((uri) => [uri, { uri }])),
    _programStates: new Map(),
    _documentVersions: new Map(),
  });
  const files = Object.entries(originals).map(([uri, text]) => ({ uri, text }));
  const texts = getCopiedScriptTexts(workspace, compile(scripts), files, suffix);
  const copies = Object.fromEntries(files.map(({ uri }, i) => [copyUri(uri), texts[i]!]));
  const context = compile({ ...scripts, ...copies }).context as Record<string, unknown>;
  const speaker = (cue: string) => cueCharacter(context, characterNames(context), cue);
  return { before: problems(scripts), after: problems({ ...scripts, ...copies }), copies, speaker };
};

const CHAPTER = `${ROOT}scripts/chapter_1.sd`;
const CHAPTER_COPY = `${ROOT}scripts/chapter_1_copy.sd`;
const copyOne = (text: string, suffix = "_copy") => {
  const { before, after, copies, speaker } = duplicate({ [CHAPTER]: text }, () => CHAPTER_COPY, suffix);
  return { before, after, copy: copies[CHAPTER_COPY]!, speaker };
};

describe("duplicating a script renames the declarations the copy would repeat", () => {
  test("the ticket's script: its function, store and scene take the suffix with their references, and the project gains no problem", () => {
    const { before, after, copy } = copyOne(
      lines(
        "function greet()",
        "  return 1",
        "end",
        "",
        "store score = 0",
        "",
        "scene chapter_1",
        "  local g = greet()",
        "  Hi {score}.",
        "  -> chapter_1",
        "end",
      ),
    );
    expect(before).toEqual([]);
    expect(after).toEqual([]);
    expect(copy).toBe(
      lines(
        "function greet_copy()",
        "  return 1",
        "end",
        "",
        "store score_copy = 0",
        "",
        "scene chapter_1_copy",
        "  local g = greet_copy()",
        "  Hi {score_copy}.",
        "  -> chapter_1_copy",
        "end",
      ),
    );
  });

  test("a const and both define forms take the suffix, and a property read through a define follows it", () => {
    const { before, after, copy } = copyOne(
      lines(
        "const limit = 3",
        "",
        "define thing with",
        "  x = 1",
        "end",
        "",
        "define companion as character with",
        "  name = \"Ada\"",
        "end",
        "",
        "scene chapter_1",
        "  Hi {thing.x} {limit}.",
        "end",
      ),
    );
    expect(before).toEqual([]);
    expect(after).toEqual([]);
    expect(copy).toBe(
      lines(
        "const limit_copy = 3",
        "",
        "define thing_copy with",
        "  x = 1",
        "end",
        "",
        "define companion_copy as character with",
        "  name = \"Ada_copy\"",
        "end",
        "",
        "scene chapter_1_copy",
        "  Hi {thing_copy.x} {limit_copy}.",
        "end",
      ),
    );
  });

  test("a character's display name and aliases take the suffix with the cues that use them, so each script's cues keep their own speaker", () => {
    const { before, after, copy, speaker } = copyOne(
      lines(
        "define companion as character with",
        "  name = \"Ada\"",
        "  aliases = { \"VISITOR\", 'GUEST' }",
        "end",
        "",
        "scene chapter_1",
        "  VISITOR: Hi.",
        "  GUEST: Hey.",
        "  Ada: Yo.",
        "  companion: Hm.",
        "end",
      ),
    );
    expect(before).toEqual([]);
    expect(after).toEqual([]);
    expect(copy).toBe(
      lines(
        "define companion_copy as character with",
        "  name = \"Ada_copy\"",
        "  aliases = { \"VISITOR_copy\", 'GUEST_copy' }",
        "end",
        "",
        "scene chapter_1_copy",
        "  VISITOR_copy: Hi.",
        "  GUEST_copy: Hey.",
        "  Ada_copy: Yo.",
        "  companion_copy: Hm.",
        "end",
      ),
    );
    expect(["VISITOR", "GUEST", "Ada", "companion"].map(speaker)).toEqual(Array(4).fill("companion"));
    expect(["VISITOR_copy", "GUEST_copy", "Ada_copy", "companion_copy"].map(speaker)).toEqual(
      Array(4).fill("companion_copy"),
    );
  });

  test("a single-quoted display name takes the suffix with its cues, so the original's cue keeps its speaker", () => {
    const { before, after, copy, speaker } = copyOne(
      lines(
        "define companion as character with",
        "  name = 'Ada'",
        "end",
        "",
        "scene chapter_1",
        "  Ada: Hi.",
        "end",
      ),
    );
    expect(before).toEqual([]);
    expect(after).toEqual([]);
    expect(copy).toBe(
      lines(
        "define companion_copy as character with",
        "  name = 'Ada_copy'",
        "end",
        "",
        "scene chapter_1_copy",
        "  Ada_copy: Hi.",
        "end",
      ),
    );
    expect([speaker("Ada"), speaker("Ada_copy")]).toEqual(["companion", "companion_copy"]);
  });

  test.each([
    ["a long-bracket string", ["  name = [[Ada]]"], ["  name = [[Ada_copy]]"]],
    ["a long-bracket string with level signs", ["  name = [==[Ada]==]"], ["  name = [==[Ada_copy]==]"]],
    ["a long-bracket string opening on its own line", ["  name = [[", "Ada]]"], ["  name = [[", "Ada_copy]]"]],
    ["a backtick string", ["  name = `Ada`"], ["  name = `Ada_copy`"]],
  ])("a display name written as %s takes the suffix with its cues, so the original's cue keeps its speaker", (_form, name, renamed) => {
    const script = (header: string, scene: string, cue: string, nameLines: string[]) =>
      lines(header, ...nameLines, "end", "", scene, `  ${cue}: Hi.`, "end");
    const { before, after, copy, speaker } = copyOne(
      script("define companion as character with", "scene chapter_1", "Ada", name),
    );
    expect(before).toEqual([]);
    expect(after).toEqual([]);
    expect(copy).toBe(
      script("define companion_copy as character with", "scene chapter_1_copy", "Ada_copy", renamed),
    );
    expect([speaker("Ada"), speaker("Ada_copy")]).toEqual(["companion", "companion_copy"]);
  });

  test("an escaped display name keeps its spelling, takes the suffix, and its cues follow it", () => {
    const { before, after, copy, speaker } = copyOne(
      lines(
        "define companion as character with",
        "  name = \"\\65da\"",
        "end",
        "",
        "scene chapter_1",
        "  Ada: Hi.",
        "end",
      ),
    );
    expect(before).toEqual([]);
    expect(after).toEqual([]);
    expect(copy).toBe(
      lines(
        "define companion_copy as character with",
        "  name = \"\\65da_copy\"",
        "end",
        "",
        "scene chapter_1_copy",
        "  Ada_copy: Hi.",
        "end",
      ),
    );
    expect([speaker("Ada"), speaker("Ada_copy")]).toEqual(["companion", "companion_copy"]);
  });

  test("a new name that a local in the copy already uses gets a number, so the renamed global is not captured by the local", () => {
    const { before, after, copy } = copyOne(
      lines(
        "store score = 0",
        "",
        "function tally()",
        "  local score_copy = 10",
        "  return score + score_copy",
        "end",
        "",
        "scene chapter_1",
        "  Hi {tally()}.",
        "end",
      ),
    );
    expect(before).toEqual([]);
    expect(after).toEqual([]);
    expect(copy).toBe(
      lines(
        "store score_copy_2 = 0",
        "",
        "function tally_copy()",
        "  local score_copy = 10",
        "  return score_copy_2 + score_copy",
        "end",
        "",
        "scene chapter_1_copy",
        "  Hi {tally_copy()}.",
        "end",
      ),
    );
  });

  test("however many numbered names locals already use, the renamed global takes the first one no local captures", () => {
    const locals = ["score_copy", ...Array.from({ length: 50 }, (_, i) => `score_copy_${i + 2}`)];
    const body = (global: string) => [
      "function tally()",
      ...locals.map((local, i) => `  local ${local} = ${i + 10}`),
      `  return ${[global, ...locals].join(" + ")}`,
      "end",
    ];
    const { before, after, copy } = copyOne(
      lines("store score = 0", "", ...body("score"), "", "scene chapter_1", "  Hi {tally()}.", "end"),
    );
    expect(before).toEqual([]);
    expect(after).toEqual([]);
    expect(copy).toBe(
      lines(
        "store score_copy_52 = 0",
        "",
        ...body("score_copy_52").map((line) => line.replace("function tally()", "function tally_copy()")),
        "",
        "scene chapter_1_copy",
        "  Hi {tally_copy()}.",
        "end",
      ),
    );
  });

  test("a local that reuses a top-level name keeps its name, and so do the uses it shadows", () => {
    const { after, copy } = copyOne(
      lines(
        "store score = 0",
        "",
        "function tally()",
        "  local score = 2",
        "  return score",
        "end",
        "",
        "scene chapter_1",
        "  Hi {score} {tally()}.",
        "end",
      ),
    );
    expect(after.filter((p) => p.includes("Duplicate"))).toEqual([]);
    expect(copy).toBe(
      lines(
        "store score_copy = 0",
        "",
        "function tally_copy()",
        "  local score = 2",
        "  return score",
        "end",
        "",
        "scene chapter_1_copy",
        "  Hi {score_copy} {tally_copy()}.",
        "end",
      ),
    );
  });

  test("a name written in a string or a comment is left alone", () => {
    const { after, copy } = copyOne(
      lines(
        "// greet and chapter_1 are named here",
        "function greet()",
        "  return \"greet\"",
        "end",
        "",
        "scene chapter_1",
        "  & local said = \"chapter_1 greet\"",
        "  Hi {greet()}.",
        "end",
      ),
    );
    expect(after).toEqual([]);
    expect(copy).toBe(
      lines(
        "// greet and chapter_1 are named here",
        "function greet_copy()",
        "  return \"greet\"",
        "end",
        "",
        "scene chapter_1_copy",
        "  & local said = \"chapter_1 greet\"",
        "  Hi {greet_copy()}.",
        "end",
      ),
    );
  });

  test("a reference written before its declaration follows it", () => {
    const { after, copy } = copyOne(
      lines(
        "scene chapter_1",
        "  Hi {greet()}.",
        "  -> ending",
        "end",
        "",
        "scene ending",
        "  Bye.",
        "end",
        "",
        "function greet()",
        "  return 1",
        "end",
      ),
    );
    expect(after).toEqual([]);
    expect(copy).toBe(
      lines(
        "scene chapter_1_copy",
        "  Hi {greet_copy()}.",
        "  -> ending_copy",
        "end",
        "",
        "scene ending_copy",
        "  Bye.",
        "end",
        "",
        "function greet_copy()",
        "  return 1",
        "end",
      ),
    );
  });

  test("a jump to a branch of a renamed scene renames the scene part of its path and keeps the branch's name", () => {
    const { before, after, copy } = copyOne(
      lines(
        "scene chapter_1",
        "  -> ending.last",
        "end",
        "",
        "scene ending",
        "  branch last",
        "    Bye.",
        "  end",
        "end",
      ),
    );
    expect(before).toEqual([]);
    expect(after).toEqual([]);
    expect(copy).toBe(
      lines(
        "scene chapter_1_copy",
        "  -> ending_copy.last",
        "end",
        "",
        "scene ending_copy",
        "  branch last",
        "    Bye.",
        "  end",
        "end",
      ),
    );
  });

  test("a name that already ends in the suffix gets a number instead of the original's name", () => {
    const { after, copy } = copyOne(
      lines(
        "store greet = 1",
        "store greet_copy = 2",
        "",
        "scene chapter_1",
        "  Hi {greet} {greet_copy}.",
        "end",
      ),
    );
    expect(after).toEqual([]);
    expect(copy).toBe(
      lines(
        "store greet_copy_2 = 1",
        "store greet_copy_copy = 2",
        "",
        "scene chapter_1_copy",
        "  Hi {greet_copy_2} {greet_copy_copy}.",
        "end",
      ),
    );
  });

  test("scene names the grammar reads are renamed whole: indented, Unicode, hyphenated and @ names", () => {
    const { copy } = copyOne(
      lines(
        "  scene élan",
        "  -> first-scene",
        "  end",
        "",
        "scene first-scene",
        "  -> a@b",
        "end",
        "",
        "scene a@b",
        "  Hi.",
        "end",
      ),
      "_copy_2",
    );
    expect(copy).toBe(
      lines(
        "  scene élan_copy_2",
        "  -> first-scene_copy_2",
        "  end",
        "",
        "scene first-scene_copy_2",
        "  -> a@b_copy_2",
        "end",
        "",
        "scene a@b_copy_2",
        "  Hi.",
        "end",
      ),
    );
  });

  test("a folder's scripts are copied together: a use in one script of a name declared in another follows it", () => {
    const A = `${ROOT}Drafts/a.sd`;
    const B = `${ROOT}Drafts/b.sd`;
    const { before, after, copies } = duplicate(
      {
        [A]: lines("function greet()", "  return 1", "end"),
        [B]: lines("scene chapter_1", "  Hi {greet()}.", "end"),
      },
      (uri) => uri.replace("Drafts/", "Drafts_copy/"),
      "_copy",
    );
    expect(before).toEqual([]);
    expect(after).toEqual([]);
    expect(copies[`${ROOT}Drafts_copy/a.sd`]).toBe(lines("function greet_copy()", "  return 1", "end"));
    expect(copies[`${ROOT}Drafts_copy/b.sd`]).toBe(lines("scene chapter_1_copy", "  Hi {greet_copy()}.", "end"));
  });

  test("a use of a name another script declares keeps pointing at that script", () => {
    const { before, after, copies } = duplicate(
      { [CHAPTER]: lines("scene chapter_1", "  Hi {shared()}.", "end") },
      () => CHAPTER_COPY,
      "_copy",
      { [`${ROOT}other.sd`]: lines("function shared()", "  return 1", "end") },
    );
    expect(before).toEqual([]);
    expect(after).toEqual([]);
    expect(copies[CHAPTER_COPY]).toBe(lines("scene chapter_1_copy", "  Hi {shared()}.", "end"));
  });
});
