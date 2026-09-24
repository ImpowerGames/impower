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
// runtime object from the tree as it stands: every field PLAY's game is
// built from, including each divert's target as resolved through its parents.
// It is the oracle here, beside running the story.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { StoryJournal } from "../../compiler/classes/StoryJournal";
import { activation } from "../../inkjs/engine/StoryActivation";
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
      // Set by the listener during the compile, which narrowing cannot see.
      return { result, story: story as RuntimeStory | undefined };
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

/** The story serialized, whether every object in its tree reaches the
 *  story's own root through its parents, and the source position each object's
 *  debug metadata gives, which the serialization leaves out. The
 *  serialization names divert targets by path, which reads the same under
 *  either story's root; where a path resolves at run time depends on the
 *  parents. */
const serialized = (story: RuntimeStory | undefined) => {
  if (!story) {
    return "(no story)";
  }
  const root = story.mainContentContainer;
  const seen = new Set<any>();
  let strays = 0;
  const positions: string[] = [];
  const visit = (obj: any) => {
    if (seen.has(obj)) {
      return;
    }
    seen.add(obj);
    if (obj.rootContentContainer !== root) {
      strays += 1;
    }
    const dm = obj.ownDebugMetadata;
    positions.push(dm ? `${dm.startLineNumber}-${dm.endLineNumber}` : "");
    for (const child of obj.content ?? []) {
      visit(child);
    }
    const named = [...(obj.namedContent ?? [])].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    for (const [, child] of named) {
      visit(child);
    }
  };
  visit(root);
  const described = `${story.ToJson() as string} | positions ${positions.join(",")}`;
  return strays ? `${strays} objects under another root; ${described}` : described;
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
    const errorsOf = (story: RuntimeStory) => {
      const errors: string[] = [];
      story.onError = (message: string) => {
        errors.push(message);
      };
      try {
        run(story, "second");
      } catch (e) {
        errors.push(String((e as Error)?.message ?? e));
      }
      return errors;
    };
    const coldErrors = errorsOf(compilerFor(base).compile().story!);
    expect(coldErrors.join()).toContain("oops");

    const c = compilerFor(base);
    const canonical = c.compile().story!;
    c.compiler.keepStory(canonical);
    // The suggestion adds two lines above `second`, which it carries over.
    c.preview(change(base, "  First.", "  First.\n  Added one.\n  Added two.").contentChanges);
    c.compiler.activateStory(canonical);
    expect(errorsOf(canonical)).toEqual(coldErrors);
    expect(serialized(canonical)).toBe(cold(base).json);
  });

  it("holds only what each retained story holds as the retained stories roll", () => {
    // Real edits alternate between two scenes, the three newest stories are
    // kept, and the one two compiles behind is shown after every compile, so
    // each compile carries objects an older story replaced long ago.
    let text = [
      `scene first\n= INT. ROOM - DAY\n:\n  First scene.\n-> second\nend\n`,
      `scene second\n= EXT. YARD - NIGHT\n:\n  Second scene.\n-> first\nend\n`,
    ].join("\n");
    const c = compilerFor(text);
    const journal = (c.compiler as any)._storyJournal;
    const kept: { story: RuntimeStory; text: string }[] = [];
    const keep = (story: RuntimeStory, storyText: string) => {
      c.compiler.keepStory(story);
      kept.push({ story, text: storyText });
      if (kept.length > 3) {
        c.compiler.releaseStory(kept.shift()!.story);
      }
    };
    keep(c.compile().story!, text);
    const ownObjects = (story: RuntimeStory) => {
      const own = new Set<object>();
      const visit = (obj: any) => {
        if (own.has(obj)) {
          return;
        }
        own.add(obj);
        if (obj.ownDebugMetadata) {
          own.add(obj.ownDebugMetadata);
        }
        for (const child of obj.content ?? []) {
          visit(child);
        }
        for (const [, child] of obj.namedContent ?? []) {
          visit(child);
        }
      };
      visit(story.mainContentContainer);
      return own;
    };
    const totals: number[] = [];
    for (let n = 0; n < 60; n++) {
      const find = n % 2 === 0 ? /  First scene[^\n]*/ : /  Second scene[^\n]*/;
      const found = text.match(find)!;
      const next = changeAt(text, found.index!, found[0].length, `${found[0].split(".")[0]}, edit ${n}.`);
      c.edit(next.contentChanges);
      text = next.after;
      const { story } = c.compile();
      keep(story!, text);
      if (kept.length === 3) {
        c.compiler.activateStory(kept[0]!.story);
      }
      if (n % 10 === 9) {
        let total = 0;
        for (const table of journal._tables.values()) total += table.entries.size;
        totals.push(total);
      }
    }
    expect(journal._tables.size).toBe(3);
    expect(totals.at(-1)).toBeLessThanOrEqual(Math.max(...totals.slice(0, 2)));
    const foreign: string[] = [];
    for (const [i, { story, text: storyText }] of kept.entries()) {
      c.compiler.activateStory(story);
      const own = ownObjects(story);
      const entries = journal._tables.get(story).entries as Map<object, unknown>;
      const strays = [...entries.keys()].filter((obj) => !own.has(obj)).length;
      if (strays) {
        foreign.push(`story ${i}: ${strays} objects it does not hold`);
      }
      expect(serialized(story)).toBe(cold(storyText).json);
    }
    expect(foreign).toEqual([]);
  });

  it("takes back what an aborted compile wrote when only an older story is kept", () => {
    const journal = new StoryJournal();
    const A = { name: "A" };
    const B = { name: "B" };
    journal.beginCompile();
    const carried: any = { _birth: activation.generation, parent: "in A" };
    journal.endCompile(A);
    journal.keep(A);
    // B carries the object and is the newest story, not kept.
    journal.beginCompile();
    journal.recordParent(carried);
    carried.parent = "in B";
    journal.endCompile(B);
    // A compile that moves it and then produces no story.
    journal.beginCompile();
    journal.recordParent(carried);
    carried.parent = "in a discarded half-compile";
    journal.abortCompile();
    expect(journal.active).toBe(B);
    expect(carried.parent).toBe("in B");
    journal.activate(A);
    expect(carried.parent).toBe("in A");
    journal.activate(B);
    expect(carried.parent).toBe("in B");
  });

  it("records no debug metadata that only a parsed object holds", () => {
    // Stored declarations and scenes whose identifiers' metadata the compiler
    // restamps on every compile, though no runtime object holds it.
    const stores = Array.from({ length: 100 }, (_, n) => `store x${n} = ${n}`).join("\n");
    let text = [
      stores,
      ``,
      `scene first\n= INT. ROOM - DAY\n:\n  First scene.\n-> second\nend\n`,
      `scene second\n= EXT. YARD - NIGHT\n:\n  Second scene.\n-> first\nend\n`,
    ].join("\n");
    const c = compilerFor(text);
    const journal = (c.compiler as any)._storyJournal;
    const original = c.compile().story!;
    c.compiler.keepStory(original);
    for (let n = 0; n < 4; n++) {
      const find = n % 2 === 0 ? "  First scene" : "  Second scene";
      const next = change(text, find, `${find}, edit ${n}`);
      c.edit(next.contentChanges);
      text = next.after;
      c.compile();
    }
    c.compiler.activateStory(original);
    const own = new Set<object>();
    const visit = (obj: any) => {
      if (own.has(obj)) {
        return;
      }
      own.add(obj);
      if (obj.ownDebugMetadata) {
        own.add(obj.ownDebugMetadata);
      }
      for (const child of obj.content ?? []) {
        visit(child);
      }
      for (const [, child] of obj.namedContent ?? []) {
        visit(child);
      }
    };
    visit(original.mainContentContainer);
    const entries = journal._tables.get(original).entries as Map<object, unknown>;
    const foreign = [...entries.keys()].filter((obj) => !own.has(obj));
    expect(foreign.length).toBe(0);
  });

  it("holds nothing for the stories it no longer keeps", () => {
    // A kept canonical story while suggestions change a different scene each
    // time: every suggestion carries objects the one before it created, and
    // none of those is the canonical story's.
    const base = Array.from(
      { length: 6 },
      (_, s) =>
        `scene scene_${s}\n= INT. ROOM ${s} - DAY\n:\n  Action describing room ${s}.\n-> scene_${(s + 3) % 6}\nend\n`,
    ).join("\n");
    const c = compilerFor(base);
    const canonical = c.compile().story!;
    c.compiler.keepStory(canonical);
    const journal = (c.compiler as any)._storyJournal;
    const canonicalEntries = () => journal._tables.get(canonical).entries as Map<object, unknown>;
    const newest: RuntimeStory[] = [];
    const counts: number[] = [];
    for (let n = 0; n < 150; n++) {
      const s = n % 6;
      const story = c.preview(
        change(base, `Action describing room ${s}.`, `Suggestion ${n} for room ${s}.`).contentChanges,
      );
      if (story) {
        c.compiler.keepStory(story);
        newest.push(story);
        if (newest.length > 2) {
          c.compiler.releaseStory(newest.shift()!);
        }
        c.compiler.activateStory(story);
      }
      if (n % 10 === 9) {
        counts.push(canonicalEntries().size);
      }
    }
    expect(journal._tables.size).toBe(3);
    expect(counts.at(-1)).toBeLessThanOrEqual(Math.max(...counts.slice(0, 2)));

    // Every object the canonical story's table holds is one of its own.
    c.compiler.activateStory(canonical);
    const own = new Set<object>();
    const visit = (obj: any) => {
      if (own.has(obj)) {
        return;
      }
      own.add(obj);
      if (obj.ownDebugMetadata) {
        own.add(obj.ownDebugMetadata);
      }
      for (const child of obj.content ?? []) {
        visit(child);
      }
      for (const [, child] of obj.namedContent ?? []) {
        visit(child);
      }
    };
    visit(canonical.mainContentContainer);
    c.compiler.activateStory(newest.at(-1)!);
    const foreign = [...canonicalEntries().keys()].filter((obj) => !own.has(obj));
    expect(foreign).toEqual([]);
    c.compiler.activateStory(canonical);
    expect(serialized(canonical)).toBe(cold(base).json);
  });
});
