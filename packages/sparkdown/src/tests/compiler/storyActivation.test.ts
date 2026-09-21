// Keeping an earlier compile's runtime story runnable (#680).
//
// An incremental compile carries the unchanged flows of the story before it
// into the new one: the same runtime objects, moved under the new root, with
// the new compile's resolution written into them. The player's worker shows
// the real document again after a suggestion was compiled, and a suggestion
// again after a later one was compiled, from the stories it kept, so a kept
// story, once activated, has to be exactly the story a cold compile of its
// text builds, and the compiles after it have to be unaffected.
//
// `Story.ToJson()` without the compiler's per-flow memo serializes every
// runtime object from the tree as it stands: every field the page's game is
// built from, including each divert's target as resolved through its parents.
// It is the oracle here, beside running the story.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

const URI = "inmemory:///main.sd";

// Cross-flow coupling (diverts between scenes, read counts, a function, a
// define), as the incremental equivalence oracle uses.
function coupledScreenplay(): string {
  const L: string[] = [];
  L.push("title: Activation Fixture");
  L.push("");
  L.push("define hero as character:");
  L.push(`  name = "Hero"`);
  L.push("");
  L.push("define cfg as object:");
  L.push("  speed = 5");
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

/** A compiler over one script that hands back the story of each compile. */
function compilerFor(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  let story: RuntimeStory | undefined;
  const take = (params: any) => {
    story = params.story;
  };
  compiler.addEventListener("compiler/didCompile", take);
  compiler.addEventListener("compiler/didPreviewCompile", take);
  let version = 1;
  return {
    compiler,
    compile: () => {
      story = undefined;
      const result = quiet(() => compiler.compile({ textDocument: { uri: URI } }));
      return { result, story };
    },
    edit: (contentChanges: any[]) => {
      version += 1;
      compiler.updateDocument({ textDocument: { uri: URI, version }, contentChanges });
    },
    preview: (contentChanges: any[]) => {
      story = undefined;
      quiet(() =>
        compiler.previewCompile({
          root: { uri: URI },
          textDocument: { uri: URI, version },
          contentChanges,
          startFrom: { file: URI, line: 0 },
        }),
      );
      return story;
    },
  };
}

const coldCache = new Map<string, { json: string; compiled: unknown }>();
/** What a cold compile of `text` builds: its story serialized, and the
 *  compiled program. */
function cold(text: string) {
  let found = coldCache.get(text);
  if (!found) {
    const c = compilerFor(text);
    const { result, story } = c.compile();
    found = { json: serialized(story), compiled: result.program.compiled };
    coldCache.set(text, found);
  }
  return found;
}

/** The story serialized, and whether every object in its tree reaches the
 *  story's own root through its parents. The serialization names divert
 *  targets by path, which reads the same under either story's root; where a
 *  path resolves at run time depends on the parents. */
const serialized = (story: RuntimeStory | undefined) => {
  if (!story) {
    return "(no story)";
  }
  const root = story.mainContentContainer;
  const stack: any[] = [root];
  const seen = new Set<any>();
  let strays = 0;
  while (stack.length) {
    const obj = stack.pop();
    if (seen.has(obj)) {
      continue;
    }
    seen.add(obj);
    if (obj.rootContentContainer !== root) {
      strays += 1;
    }
    for (const child of obj.content ?? []) {
      stack.push(child);
    }
    for (const [, child] of obj.namedContent ?? []) {
      stack.push(child);
    }
  }
  const json = story.ToJson() as string;
  return strays ? `${strays} objects under another root; ${json}` : json;
};

/** The text a story prints from the start of `path`, over `lines` lines. */
function run(story: RuntimeStory, path: string, lines = 8): string[] {
  story.ResetState();
  story.ChoosePathString(path);
  const out: string[] = [];
  while (story.canContinue && out.length < lines) {
    out.push(story.Continue()!.trim());
  }
  return out;
}

describe("a story kept across later compiles", () => {
  it("runs like a cold compile of the real text after a preview compile", () => {
    // Scenes that only divert, so any one of them runs without the root.
    const base = Array.from(
      { length: 6 },
      (_, s) =>
        `scene scene_${s}\n= INT. ROOM ${s} - DAY\n:\n  Action describing room ${s}.\n-> scene_${(s + 3) % 6}\nend\n`,
    ).join("\n");
    const c = compilerFor(base);
    const canonical = c.compile().story!;
    expect(c.compiler.keepStory(canonical)).toBe(true);
    c.preview(change(base, "Action describing room 4.", "Action describing room 4, as the suggestion has it.").contentChanges);

    c.compiler.activateStory(canonical);
    // scene_1 is unchanged, so the preview compile carried it over; its
    // divert to scene_4 must reach the real scene_4.
    const coldStory = compilerFor(base).compile().story!;
    expect(run(canonical, "scene_1")).toEqual(run(coldStory, "scene_1"));
  });

  for (const edit of EDITS) {
    it(`is the cold compile of its text once activated (${edit.name})`, () => {
      const base = coupledScreenplay();
      const c = compilerFor(base);
      const canonical = c.compile().story!;
      c.compiler.keepStory(canonical);
      const first = change(base, edit.find, edit.replace);
      const suggestion = c.preview(first.contentChanges);
      if (suggestion) {
        c.compiler.keepStory(suggestion);
      }
      // A later suggestion carries both stories' flows over again.
      c.preview(change(base, "Line one of dialogue in scene 1.", "Line one, later suggestion.").contentChanges);

      c.compiler.activateStory(canonical);
      expect(serialized(canonical)).toBe(cold(base).json);
      if (suggestion) {
        c.compiler.activateStory(suggestion);
        expect(serialized(suggestion)).toBe(cold(first.after).json);
        c.compiler.activateStory(canonical);
        expect(serialized(canonical)).toBe(cold(base).json);
      }

      // The next real compile is the one it would have been.
      const typed = change(base, "Line one of dialogue in scene 2.", "Line one of dialogue in scene 2, typed.");
      c.edit(typed.contentChanges);
      const next = c.compile();
      expect(next.result.program.compiled).toEqual(cold(typed.after).compiled);
      expect(serialized(next.story)).toBe(cold(typed.after).json);
    });
  }

  it("stays the cold compile of its text across many real and preview compiles", () => {
    let text = coupledScreenplay();
    const c = compilerFor(text);
    let canonical = c.compile().story!;
    c.compiler.keepStory(canonical);
    let shown: { story: RuntimeStory; text: string } | undefined;

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
    const check = (label: string, story: RuntimeStory, storyText: string) => {
      c.compiler.activateStory(story);
      if (serialized(story) !== cold(storyText).json) {
        failures.push(label);
      }
    };
    for (let n = 0; n < 60; n++) {
      const roll = rand();
      if (roll < 0.3) {
        // The author types: a real compile, which becomes the canonical story.
        const typed = randomChange(text);
        c.edit(typed.contentChanges);
        text = typed.after;
        const { story } = c.compile();
        if (story) {
          c.compiler.releaseStory(canonical);
          canonical = story;
          c.compiler.keepStory(canonical);
        }
      } else {
        // A suggestion is compiled, and sometimes becomes the one shown.
        const suggested = randomChange(text);
        const story = c.preview(suggested.contentChanges);
        if (story && rand() < 0.5) {
          if (shown) {
            c.compiler.releaseStory(shown.story);
          }
          shown = { story, text: suggested.after };
          c.compiler.keepStory(story);
        }
      }
      if (rand() < 0.5) {
        check(`#${n} canonical`, canonical, text);
      }
      if (shown && rand() < 0.5) {
        check(`#${n} shown`, shown.story, shown.text);
      }
    }
    expect(failures).toEqual([]);
  });
});
