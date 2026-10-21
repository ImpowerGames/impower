// `scopeDefineInstances` gives each typed define a global key: its bare name
// when any user script uses the name as a type (`as X`, `new X()`), else the
// synthetic `$<type>_<name>`. Which keys the program holds is a whole-program
// property, and a compile found the declarations by walking the whole
// assembled story, although almost every chunk it walked was carried
// unchanged from the compile before (#709).
//
// These checks pin both halves of the contract:
//
//  - RESULT. Through a sequence of edits across scripts (an `as X` use of a
//    name another script defines added and removed, a define deleted and
//    moved between chunks, a script removed from the project and restored, a
//    preview that
//    renames a define and is rolled back), every global the program holds is
//    named as a cold compile of the same text names it. And with
//    `DefineScopeRecord.verify`, every pass is checked against a walk of the
//    whole story: the same declarations, each holding the key the walk gives.
//    Both on the language server's compiler and on the player's, which seeds
//    the builtins prelude into the story, and for the compile of the prelude
//    as its own root, whose defines are its own chunks.
//  - COST. An edit walks only the chunks it lowered anew, and classifies no
//    declaration again unless the union of type names moved
//    (`defineScopeStats`).
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { ProgramStory } from "../../program/ProgramStory";
import { scriptFiles } from "../program/programHarness";

const MAIN = "inmemory:///main.sd";
const DEFS = "inmemory:///defs.sd";
const CHAPTER = "inmemory:///chapter.sd";

// The record's whole-story check, when the record exists (it does not on
// the base this ticket's counter is red against).
const record = await import("../../compiler/utils/DefineScopeRecord").catch(
  () => undefined,
);
// The declarations each checked pass held.
const checked: number[] = [];
if (record) {
  const R = record.DefineScopeRecord;
  R.verify = true;
  const check = R.check;
  R.check = (story, held, skip, typeNames) => {
    checked.push(held.length);
    check.call(R, story, held, skip, typeNames);
  };
}
const verifyFailures = (): string[] => {
  if (!record) {
    return [];
  }
  const failures = record.DefineScopeRecord.verifyFailures.slice();
  record.DefineScopeRecord.verifyFailures.length = 0;
  return failures;
};

// The first compiler configured compiles the builtins prelude as its own
// root, once per process (`getCompiledPrelude`); its defines are that
// compile's own chunks, which are not the prelude a project's compile
// injects. What that compile's pass checked, taken before any other compile.
new SparkdownCompiler().configure({
  files: scriptFiles({ [MAIN]: "Hello.\n" }) as never,
});
const preludeCompile = { checked: checked.slice(), failures: verifyFailures() };

/** `SparkdownCompiler.defineScopeStats`. */
interface ScopeStats {
  blocks: number;
  blocksWalked: number;
  objectsVisited: number;
  declarations: number;
  classified: number;
  renamed: number;
}

const defs = (): string =>
  [
    "define Actor as character with",
    "  store hp = 7",
    "end",
    "",
    "define hero as Actor with",
    '  name = "Hero"',
    "end",
    "",
    "define spawner as object with",
    "  rate = 1",
    "end",
    "",
    "define lamp as object with",
    "  lit = true",
    "end",
    "",
  ].join("\n");

const chapter = (): string => {
  const L: string[] = [];
  for (let s = 0; s < 8; s++) {
    L.push(`scene chapter_${s}`);
    L.push(`  Prose of chapter scene ${s}.`);
    L.push(`  Hero walks into room ${s}.`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
};

const main = (): string => {
  const L: string[] = [];
  L.push("define villain as character with");
  L.push('  name = "Villain"');
  L.push("end");
  L.push("");
  L.push("function make()");
  L.push("  local s = new spawner()");
  L.push("  return s");
  L.push("end");
  L.push("");
  for (let s = 0; s < 8; s++) {
    L.push(`scene main_${s}`);
    L.push(`  Prose of main scene ${s}.`);
    L.push("  -> chapter_0");
    L.push("end");
    L.push("");
  }
  return L.join("\n");
};

function posAt(text: string, offset: number) {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: offset - lineStart };
}

function quiet<T>(fn: () => T): T {
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return fn();
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
}

/** Every global a program's story holds after its state is reset, by the
 *  key it is stored under. */
function globalKeys(program: SparkProgram): string[] {
  expect(program.chunks, "the compile made a program").toBeDefined();
  const story = new ProgramStory(program.chunks!);
  const globals = (story.variablesState as unknown as {
    _globalVariables: Map<string, unknown>;
  })._globalVariables;
  return [...globals.keys()].sort();
}

/** How a compiler is configured: as the language server's, or as the
 *  player's, which seeds the builtins prelude into the story. */
type Config = { seedBuiltinsIntoStory?: boolean };

function compilerOver(texts: Record<string, string>, config: Config) {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: scriptFiles(texts) as never, ...config });
  return compiler;
}

function cold(texts: Record<string, string>, config: Config): string[] {
  const compiler = compilerOver(texts, config);
  const keys = globalKeys(
    quiet(() => compiler.compile({ textDocument: { uri: MAIN } })).program,
  );
  verifyFailures();
  return keys;
}

/** A compiler over the three scripts, editing them one minimal change at a
 *  time, with each compile checked against a cold compile of the same text
 *  and against a walk of the whole story. */
function sessionOver(config: Config) {
  const texts: Record<string, string> = {
    [MAIN]: main(),
    [DEFS]: defs(),
    [CHAPTER]: chapter(),
  };
  const compiler = compilerOver(texts, config);
  let version = 1;
  const compile = () => {
    verifyFailures();
    const { program } = quiet(() =>
      compiler.compile({ textDocument: { uri: MAIN } }),
    );
    const keys = globalKeys(program);
    expect(verifyFailures(), "the record against a walk of the story").toEqual([]);
    expect(keys, "the global keys a cold compile gives").toEqual(cold(texts, config));
    return keys;
  };
  const changeAt = (uri: string, find: string, replace: string) => {
    const text = texts[uri]!;
    const offset = text.indexOf(find);
    expect(offset, `${uri} holds ${JSON.stringify(find)}`).toBeGreaterThanOrEqual(0);
    return {
      next: text.slice(0, offset) + replace + text.slice(offset + find.length),
      change: {
        range: {
          start: posAt(text, offset),
          end: posAt(text, offset + find.length),
        },
        text: replace,
      },
    };
  };
  return {
    compiler,
    texts,
    compile,
    /** Replaces the first `find` in `uri` with `replace`, and compiles. */
    edit(uri: string, find: string, replace: string) {
      const { next, change } = changeAt(uri, find, replace);
      version += 1;
      compiler.updateDocument({
        textDocument: { uri, version },
        contentChanges: [change],
      });
      texts[uri] = next;
      return compile();
    },
    /** Compiles `uri` with `find` replaced, as a preview, and checks it
     *  against a cold compile of the previewed text. */
    preview(uri: string, find: string, replace: string) {
      const { next, change } = changeAt(uri, find, replace);
      verifyFailures();
      const result = quiet(() =>
        compiler.previewCompile({
          root: { uri: MAIN },
          textDocument: { uri, version },
          contentChanges: [change],
        } as never),
      ) as { program: SparkProgram };
      expect(verifyFailures(), "the preview's record against a walk").toEqual([]);
      const keys = globalKeys(result.program);
      expect(keys, "the preview's global keys").toEqual(cold({ ...texts, [uri]: next }, config));
      return keys;
    },
    get stats() {
      // Read without the record's type, which the base does not have.
      return (compiler as unknown as { defineScopeStats: ScopeStats })
        .defineScopeStats;
    },
  };
}

describe("define scoping of the prelude compiled as its own root (#709)", () => {
  it.runIf(record)("scopes the prelude's defines as that compile's own chunks", () => {
    // The prelude's compile checked a pass holding its hundreds of defines,
    // and the pass agreed with a walk of its story.
    expect(Math.max(0, ...preludeCompile.checked)).toBeGreaterThan(100);
    expect(preludeCompile.failures).toEqual([]);
  });
});

describe.each<[string, Config]>([
  ["the language server's compiler", {}],
  ["the player's compiler, which seeds the prelude into the story", { seedBuiltinsIntoStory: true }],
])("define scoping across edits on %s (#709)", (_, config) => {
  const session = () => sessionOver(config);
  it("gives every define the key a cold compile gives through a sequence of edits across scripts", () => {
    const s = session();
    const first = s.compile();
    // A leaf no script uses as a type is scoped; a type stays bare.
    expect(first).toContain("$character_villain");
    expect(first).toContain("$Actor_hero");
    expect(first).toContain("Actor");
    expect(first).toContain("spawner");
    expect(first).toContain("$object_lamp");

    // Prose: nothing moves.
    s.edit(CHAPTER, "Prose of chapter scene 3.", "Prose of chapter scene three.");
    // An `as X` use, in main, of a name defs defines as a leaf: `lamp` is
    // now a type, so its key in defs is bare.
    let keys = s.edit(
      MAIN,
      "function make()",
      'define glow as lamp with\n  hue = "red"\nend\n\nfunction make()',
    );
    expect(keys).toContain("lamp");
    expect(keys).not.toContain("$object_lamp");
    expect(keys).toContain("$lamp_glow");
    // And removed again: `lamp` is a leaf once more.
    keys = s.edit(MAIN, 'define glow as lamp with\n  hue = "red"\nend\n\n', "");
    expect(keys).toContain("$object_lamp");
    expect(keys).not.toContain("lamp");

    // A `new X()` target removed: `spawner` stops being a type.
    keys = s.edit(MAIN, "new spawner()", "0");
    expect(keys).toContain("$object_spawner");
    keys = s.edit(MAIN, "local s = 0", "local s = new spawner()");
    expect(keys).toContain("spawner");

    // A define deleted, then written in another chunk of another script.
    keys = s.edit(DEFS, "define lamp as object with\n  lit = true\nend\n", "");
    expect(keys).not.toContain("$object_lamp");
    keys = s.edit(
      CHAPTER,
      "scene chapter_5",
      "define lamp as object with\n  lit = false\nend\n\nscene chapter_5",
    );
    expect(keys).toContain("$object_lamp");
    // A chunk rebuilt without its declaration changing.
    s.edit(DEFS, '  name = "Hero"', '  name = "Heroine"');
    // A declaration whose classification hangs on another file: `villain`
    // used as a type in chapter, then not.
    keys = s.edit(
      CHAPTER,
      "scene chapter_0",
      'define henchman as villain with\n  name = "H"\nend\n\nscene chapter_0',
    );
    expect(keys).toContain("villain");
    keys = s.edit(CHAPTER, 'define henchman as villain with\n  name = "H"\nend\n\n', "");
    expect(keys).toContain("$character_villain");
  });

  it("classifies a script's defines again when the script is removed from the project and restored across a type change", () => {
    const s = session();
    s.compile();
    // Without defs, nothing uses `lamp`; while it is out, main makes `lamp`
    // a type, so defs' defines come back under a union they were never
    // classified under.
    const [defsFile] = scriptFiles({ [DEFS]: s.texts[DEFS]! });
    s.compiler.removeFile({ file: defsFile } as never);
    delete s.texts[DEFS];
    s.compile();
    s.edit(
      MAIN,
      "function make()",
      'define glow as lamp with\n  hue = "red"\nend\n\nfunction make()',
    );
    s.compiler.addFile({ file: defsFile } as never);
    s.texts[DEFS] = defsFile!.text;
    const keys = s.compile();
    expect(keys).toContain("lamp");
    expect(keys).not.toContain("$object_lamp");
  });

  it("scopes as if a preview that renamed a define had not happened, once it is rolled back", () => {
    const s = session();
    s.compile();
    // The preview makes `lamp` a type, which renames the define a carried
    // chunk of defs holds; the rollback puts its key back.
    const previewed = s.preview(
      MAIN,
      "function make()",
      'define glow as lamp with\n  hue = "red"\nend\n\nfunction make()',
    );
    expect(previewed).toContain("lamp");
    let keys = s.compile();
    expect(keys).toContain("$object_lamp");
    expect(keys).not.toContain("lamp");
    // The preview recorded no classification, so the compile after it finds
    // every carried chunk classified as the last real compile left it.
    expect(s.stats.classified).toBe(0);
    // And the real edit after it renames it again.
    keys = s.edit(
      MAIN,
      "function make()",
      'define glow as lamp with\n  hue = "red"\nend\n\nfunction make()',
    );
    expect(keys).toContain("lamp");
    // A preview that undoes it, rolled back, then a prose edit.
    s.preview(MAIN, 'define glow as lamp with\n  hue = "red"\nend\n\n', "");
    keys = s.edit(MAIN, "Prose of main scene 2.", "Prose of main scene two.");
    expect(keys).toContain("lamp");
  });

  // A preview compiles the requested root and then, when that root's project
  // does not hold the edited script, the edited script on its own, both
  // before the rollback (`previewCompile`). Two roots whose projects both hold
  // one defining script (`side.sd`, whose folder holds `inner/`, and
  // `inner/story.sd`, which is not named main.sd and so leaves `inner/` in
  // side's project) classify its define under their own unions, so the second
  // compile must see the key the first left, not the one the last real
  // compile recorded (PR #1863, round 1).
  it("scopes a shared define for each root a preview compiles", () => {
    const ROOT = "inmemory:///inner/story.sd";
    const SHARED = "inmemory:///inner/defs.sd";
    const SIDE = "inmemory:///side.sd";
    const texts: Record<string, string> = {
      [ROOT]: "scene inner\n  Inner.\nend\n",
      [SHARED]: "define lamp as object with\n  lit = true\nend\n",
      [SIDE]: 'define glow as lamp with\n  hue = "red"\nend\n\nscene side\n  Side.\nend\n',
    };
    const c = compilerOver(texts, config);
    quiet(() => c.compile({ textDocument: { uri: ROOT } }));
    quiet(() => c.compile({ textDocument: { uri: SIDE } }));
    const at = texts[SIDE]!.indexOf("Side.");
    verifyFailures();
    const preview = quiet(() =>
      c.previewCompile({
        root: { uri: ROOT },
        textDocument: { uri: SIDE, version: 1 },
        contentChanges: [
          {
            range: {
              start: posAt(texts[SIDE]!, at),
              end: posAt(texts[SIDE]!, at + "Side.".length),
            },
            text: "Side changed.",
          },
        ],
      } as never),
    ) as { program: SparkProgram };
    expect(verifyFailures(), "both preview compiles against a walk").toEqual([]);
    const edited = { ...texts, [SIDE]: texts[SIDE]!.replace("Side.", "Side changed.") };
    const coldSide = compilerOver(edited, config);
    const coldKeys = globalKeys(
      quiet(() => coldSide.compile({ textDocument: { uri: SIDE } })).program,
    );
    verifyFailures();
    expect(globalKeys(preview.program)).toEqual(coldKeys);
    expect(globalKeys(preview.program)).toContain("lamp");
    // And after the rollback each root compiles as a cold compile does.
    expect(
      globalKeys(quiet(() => c.compile({ textDocument: { uri: ROOT } })).program),
    ).toContain("$object_lamp");
    expect(verifyFailures()).toEqual([]);
    expect(
      globalKeys(quiet(() => c.compile({ textDocument: { uri: SIDE } })).program),
    ).toEqual(globalKeys(quiet(() => compilerOver(texts, config).compile({ textDocument: { uri: SIDE } })).program));
    expect(verifyFailures()).toEqual([]);
  });

  it("walks only the chunks an edit lowered anew, and classifies nothing again unless the type names moved", () => {
    const s = session();
    s.compile();
    const coldStats = { ...s.stats };
    expect(coldStats.blocksWalked).toBe(coldStats.blocks);
    expect(coldStats.declarations).toBeGreaterThanOrEqual(5);

    s.edit(CHAPTER, "Prose of chapter scene 3.", "Prose of chapter scene three.");
    expect(s.stats.blocks).toBe(coldStats.blocks);
    // The edited scene's chunks, which the reparse window lowers anew.
    expect(s.stats.blocksWalked).toBeGreaterThan(0);
    expect(s.stats.blocksWalked).toBeLessThan(coldStats.blocks / 8);
    expect(s.stats.objectsVisited).toBeLessThan(coldStats.objectsVisited / 4);
    expect(s.stats.classified).toBe(0);
    expect(s.stats.declarations).toBe(coldStats.declarations);

    // A type name that appears classifies every declaration again, without
    // walking the chunks that hold them.
    s.edit(
      MAIN,
      "function make()",
      'define glow as lamp with\n  hue = "red"\nend\n\nfunction make()',
    );
    expect(s.stats.blocksWalked).toBeLessThan(coldStats.blocks / 8);
    expect(s.stats.classified).toBe(s.stats.declarations);
    expect(s.stats.renamed).toBeGreaterThanOrEqual(1);
  });
});
