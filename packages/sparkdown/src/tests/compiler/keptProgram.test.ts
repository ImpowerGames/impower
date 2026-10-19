// Keeping an earlier compile's program runnable (#680).
//
// The player's worker shows the real document again after a suggestion was
// compiled, and a suggestion again after a later one was compiled, from the
// programs it kept, so a kept program has to stay exactly the program a cold
// compile of its text builds however many compiles follow, and the compiles
// after it have to be unaffected. A program's statement chunks are not
// written after they are built, and a later compile shares the ones it keeps
// (docs/engine/binary-program.md, section 1); these tests hold that to the
// cold compile of each text.
//
// The root described by content (`describeRoot`) is the oracle here, beside
// running the program.
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { ProgramStory } from "../../program/ProgramStory";
import { describeRoot } from "../program/describeRoot";

const URI = "inmemory:///main.sd";

// Cross-flow coupling (diverts between scenes, read counts, a function, a
// define), as the incremental equivalence oracle uses.
function coupledScreenplay(): string {
  const L: string[] = [];
  L.push("title: Activation Fixture");
  L.push("");
  L.push("define hero as character with");
  L.push(`  name = "Hero"`);
  L.push("end");
  L.push("");
  L.push("define cfg as object with");
  L.push("  speed = 5");
  L.push("end");
  L.push("");
  L.push("store trust = 0");
  L.push("");
  L.push("function bonus(x):");
  L.push("  return x * 2 + 1");
  L.push("");
  const SC = 10;
  for (let s = 0; s < SC; s++) {
    L.push(`scene scene_${s}`);
    L.push(`= INT. ROOM ${s} - DAY`);
    L.push(":");
    L.push(`  Action describing room ${s}.`);
    L.push(`hero:`);
    L.push(`  Line one of dialogue in scene ${s}.`);
    L.push(`  Trust {trust}, read-count {scene_${(s + 1) % SC}}.`);
    L.push("if trust > 2 then");
    L.push(`  hero: I trust you in scene ${s}.`);
    L.push("else");
    L.push(`  hero: Not yet in scene ${s}.`);
    L.push("end");
    L.push(`& trust = bonus(trust)`);
    L.push(`-> scene_${(s + 3) % SC}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

const EDITS: { name: string; find: string; replace: string }[] = [
  { name: "a word in dialogue", find: "Line one of dialogue in scene 5.", replace: "Line one of dialogue in scene 5x." },
  { name: "a line inserted", find: "Action describing room 6.", replace: "Action describing room 6.\n  An extra action line." },
  { name: "a define's value", find: "speed = 5", replace: "speed = 9" },
  { name: "a read count added", find: "Not yet in scene 7.", replace: "Not yet in scene 7, {scene_2}." },
  { name: "a read count removed", find: "read-count {scene_3}.", replace: "read-count gone." },
  { name: "a divert removed", find: "-> scene_8", replace: "-> DONE" },
  { name: "a function body", find: "return x * 2 + 1", replace: "return x * 3 + 1" },
  { name: "a store's initial value", find: "store trust = 0", replace: "store trust = 1" },
  { name: "a divert target renamed", find: "scene scene_4", replace: "scene scene_renamed" },
  { name: "an anonymous function added", find: "  Action describing room 6.", replace: "  Action describing room 6.\n& local f6 = function(x) return x + 2 end" },
];

function quiet<T>(fn: () => T): T {
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = realWarn;
    console.error = realError;
  }
}

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

function changeAt(text: string, offset: number, deleteLength: number, insert: string) {
  return {
    contentChanges: [
      {
        range: { start: posAt(text, offset), end: posAt(text, offset + deleteLength) },
        text: insert,
      },
    ],
    after: text.slice(0, offset) + insert + text.slice(offset + deleteLength),
  };
}

function change(text: string, find: string, replace: string) {
  const offset = text.indexOf(find);
  expect(offset, `"${find}" is in the text`).toBeGreaterThanOrEqual(0);
  return changeAt(text, offset, find.length, replace);
}

/** A compiler over one script that hands back the root of each compile. */
function compilerFor(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  let version = 1;
  return {
    compiler,
    compile: () => {
      const result = quiet(() => compiler.compile({ textDocument: { uri: URI } }));
      return { result, root: result.program.chunks };
    },
    edit: (contentChanges: any[]) => {
      version += 1;
      compiler.updateDocument({ textDocument: { uri: URI, version }, contentChanges });
    },
    preview: (contentChanges: any[]): ProgramRoot | undefined => {
      const previewed = quiet(() =>
        compiler.previewCompile({
          root: { uri: URI },
          textDocument: { uri: URI, version },
          contentChanges,
          startFrom: { file: URI, line: 0 },
        }),
      );
      return previewed.program?.chunks;
    },
  };
}

const coldCache = new Map<string, string>();
/** The root a cold compile of `text` builds, described by content. */
function cold(text: string): string {
  let found = coldCache.get(text);
  if (found === undefined) {
    found = described(compilerFor(text).compile().root);
    coldCache.set(text, found);
  }
  return found;
}

/** A root described by content, or a note that the compile made none. */
const described = (root: ProgramRoot | undefined): string =>
  root ? JSON.stringify(describeRoot(root)) : "(no program)";

/** The text the program of `root` prints from the start of `path`, over
 *  `lines` lines. */
function run(root: ProgramRoot, path: string, lines = 8): string[] {
  const story = new ProgramStory(root);
  story.ChoosePathString(path);
  const out: string[] = [];
  while (story.canContinue && out.length < lines) {
    out.push(story.Continue()!.trim());
  }
  return out;
}

describe("a program kept across later compiles", () => {
  it("runs like a cold compile of the real text after a preview compile", () => {
    // Scenes that only divert, so any one of them runs without the root.
    const base = Array.from(
      { length: 6 },
      (_, s) =>
        `scene scene_${s}\n= INT. ROOM ${s} - DAY\n:\n  Action describing room ${s}.\n-> scene_${(s + 3) % 6}\nend\n`,
    ).join("\n");
    const c = compilerFor(base);
    const canonical = c.compile().root!;
    c.preview(change(base, "Action describing room 4.", "Action describing room 4, as the suggestion has it.").contentChanges);

    // scene_1 is unchanged, so the preview compile kept its chunk; its
    // divert to scene_4 must reach the real scene_4.
    const coldRoot = compilerFor(base).compile().root!;
    expect(run(canonical, "scene_1")).toEqual(run(coldRoot, "scene_1"));
  });

  for (const edit of EDITS) {
    it(`is the cold compile of its text after later compiles (${edit.name})`, () => {
      const base = coupledScreenplay();
      const c = compilerFor(base);
      const canonical = c.compile().root!;
      const first = change(base, edit.find, edit.replace);
      const suggestion = c.preview(first.contentChanges);
      // A later suggestion keeps both programs' chunks again.
      c.preview(change(base, "Line one of dialogue in scene 1.", "Line one, later suggestion.").contentChanges);

      expect(described(canonical)).toBe(cold(base));
      if (suggestion) {
        expect(described(suggestion)).toBe(cold(first.after));
      }

      // The next real compile is the one it would have been.
      const typed = change(base, "Line one of dialogue in scene 2.", "Line one of dialogue in scene 2, typed.");
      c.edit(typed.contentChanges);
      const next = c.compile();
      expect(described(next.root)).toBe(cold(typed.after));
    });
  }

  it("stays the cold compile of its text across many real and preview compiles", () => {
    let text = coupledScreenplay();
    const c = compilerFor(text);
    let canonical = c.compile().root!;
    let shown: { root: ProgramRoot; text: string } | undefined;

    // Deterministic LCG, as the cumulative equivalence fuzz uses.
    let seed = 0x680;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const inserts = ["x", "\n", " ", "1", "}", "{", "{trust}", "->", "end", "", "{scene_2}", "hero:", "-> scene_5", "\n& f = function() return 9 end\n"];
    const randomChange = (from: string) => {
      const insert = inserts[Math.floor(rand() * inserts.length)]!;
      const deleteLength = rand() < 0.4 ? 1 + Math.floor(rand() * 10) : insert ? 0 : 1;
      const offset = Math.floor(rand() * (from.length - deleteLength));
      return changeAt(from, offset, deleteLength, insert);
    };

    const failures: string[] = [];
    const check = (label: string, root: ProgramRoot, rootText: string) => {
      if (described(root) !== cold(rootText)) {
        failures.push(label);
      }
    };
    for (let n = 0; n < 60; n++) {
      const roll = rand();
      if (roll < 0.3) {
        // The author types: a real compile, which becomes the canonical one.
        const typed = randomChange(text);
        c.edit(typed.contentChanges);
        text = typed.after;
        const { root } = c.compile();
        if (root) {
          canonical = root;
        }
      } else {
        // A suggestion is compiled, and sometimes becomes the one shown.
        const suggested = randomChange(text);
        const root = c.preview(suggested.contentChanges);
        if (root && rand() < 0.5) {
          shown = { root, text: suggested.after };
        }
      }
      if (rand() < 0.5) {
        check(`#${n} canonical`, canonical, text);
      }
      if (shown && rand() < 0.5) {
        check(`#${n} shown`, shown.root, shown.text);
      }
    }
    expect(failures).toEqual([]);
  });

  it("reports a runtime error at its own line after a suggestion moved it", () => {
    const base = [
      "scene first",
      "  First.",
      "end",
      "",
      "scene second",
      `& assert(false, "oops")`,
      "  Third.",
      "end",
    ].join("\n");
    const errorsOf = (root: ProgramRoot) => {
      const errors: string[] = [];
      const story = new ProgramStory(root);
      story.onError = (message: string) => {
        errors.push(message);
      };
      try {
        story.ChoosePathString("second");
        while (story.canContinue) {
          story.Continue();
        }
      } catch (e) {
        errors.push(String((e as Error)?.message ?? e));
      }
      return errors;
    };
    const coldErrors = errorsOf(compilerFor(base).compile().root!);
    expect(coldErrors.join()).toContain("oops");

    const c = compilerFor(base);
    const canonical = c.compile().root!;
    // The suggestion adds two lines above `second`, whose chunk it keeps.
    c.preview(change(base, "  First.", "  First.\n  Added one.\n  Added two.").contentChanges);
    expect(errorsOf(canonical)).toEqual(coldErrors);
    expect(described(canonical)).toBe(cold(base));
  });
});
