// Design-agnostic byte-identical oracle for compiler incrementality.
//
// For each of many DIVERSE edits, compares two programs compiled from the SAME
// resulting text:
//   - INCREMENTAL: one persistent compiler driven by updateDocument + compile
//     applying a MINIMAL-RANGE edit (a real keystroke-sized change), so the
//     incremental parser carries forward unchanged chunks and the per-chunk
//     reuse path is genuinely exercised.
//   - COLD: a fresh compiler configured from the post-edit text from scratch.
// They must be byte-identical across compiled ink JSON + every *Locations map +
// context + diagnostics + ui + colorAnnotations. Any incrementality bug (stale
// cache, missed cross-flow invalidation — visit counts, divert paths, renames,
// line shifts) flips this.
//
// A name minted from a source offset shows here only when an edit leaves the
// chunk holding it outside the reparse window; `shiftEquivalence.test.ts`
// finds such a name directly, by compiling each fixture cold with blank lines
// above it.
//
// This is the gold-standard safety net the incremental work is built against;
// it uses a screenplay with cross-flow coupling (diverts between scenes,
// read-counts, defines/tables, chained dialogue) — exactly where naive
// per-chunk reuse breaks — not the uniform perf fixture.
//
// The screenplay ends with the constructs of `constructs()`, and a second copy
// sits in an included script. The seeded edits check by chunk identity that
// each construct's chunk was carried rather than lowered again, and count the
// flows served from the serialized-flow cache,
// so that a comparison cannot pass over a construct the compile lowered again,
// or while a guard has turned reuse off.
import "../../inkjs/engine/Container";
import { describe, it, expect } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import { coupledScreenplay, includedChapter } from "./fixtures/coupledScreenplay";
import { servedFlowNames } from "./servedFlows";

// Each edit is a single find -> replace applied to the FIRST occurrence, turned
// into a minimal-range contentChange so only the affected region reparses.
interface Edit {
  name: string;
  find: string;
  replace: string;
}

const edits: Edit[] = [
  { name: "same-line char insert in dialogue", find: "Line one of dialogue in scene 5.", replace: "Line one of dialogue in scene 5x." },
  { name: "newline insert (shifts lines below)", find: "Action describing room 6 in some detail here.", replace: "Action describing room 6 in some detail here.\n  An extra action line." },
  { name: "edit define table value", find: "speed = 5", replace: "speed = 9" },
  { name: "add read-count reference (visit-count coupling)", find: "Not yet in scene 7.", replace: "Not yet in scene 7, {scene_2}." },
  { name: "remove a cross-flow divert", find: "-> scene_10", replace: "-> DONE" },
  { name: "lengthen a line above continuations (moves them)", find: "Line one of dialogue in scene 2.", replace: "Line one of dialogue in scene 2, said at much greater length." },
  { name: "add a continuation above others (renumbers their groups)", find: "-> scene_6", replace: "hero: A new glued line ..\n.. said here.\n-> scene_6" },
  { name: "change function body", find: "return x * 2 + 1", replace: "return x * 3 + 1" },
  { name: "edit store initial value", find: "store trust = 0", replace: "store trust = 1" },
  { name: "rename a scene (cross-flow divert target)", find: "scene scene_4", replace: "scene scene_renamed" },
  { name: "delete a whole line above many flows", find: "store visited_count = 0\n", replace: "" },
  // The layout is the last block of the fixture, so this appends at the end
  // of the document.
  { name: "append a whole new scene at end", find: 'layout hud with\n  text "{trust} {t.a}"\nend\n', replace: 'layout hud with\n  text "{trust} {t.a}"\nend\n\nscene scene_extra\n= INT. NEW - DAY\n:\n  Brand new action.\n-> DONE\nend\n' },
];

// A string that starts each construct of `constructs(p)` and occurs once in
// the fixture, keyed by the construct.
const constructMarkers = (p = "") => ({
  "tag line": `# ${p}chapter marker`,
  "tagged scene": `scene ${p}deep_choice # arc`,
  "choose with a then clause": "  choose\n  + [Press on]",
  "store named after an edit's define": `store ${p}thing = 1`,
  "store holding a method": `store ${p}acc =`,
  "function with assignments, loops and a closure": `function ${p}reckon()`,
  "layout with bindings": `layout ${p}hud with`,
});

type Construct = keyof ReturnType<typeof constructMarkers>;

const ALL_CONSTRUCTS = Object.keys(constructMarkers()) as Construct[];

const except = (...left: Construct[]) => ALL_CONSTRUCTS.filter((c) => !left.includes(c));

// An edit far enough from the constructs that the chunks named in `carries`
// are carried into the incremental compile, not lowered again. `flowReuse`
// says whether the compile serves flows from the serialized-flow cache; an
// edit that declares or renames a name, or changes a parameter list,
// correctly refuses it. `knownBug` names the open Bug the edit's comparison
// with a cold compile fails on; such a test is expected to fail until that
// Bug is fixed, and the sequential run leaves out an edit with a `knownBug`.
interface CarriedEdit extends Edit {
  bugs: string;
  carries: Construct[];
  flowReuse: boolean;
  knownBug?: string;
}

const FUNCTION_AT_TOP = "function later()\n  return 7\nend\n\n";
// `sidekick` makes `thing` a define type name, which the store of that name
// then shadows.
const DEFINE_AT_TOP = "define thing with\n  x = 1\nend\n\ndefine sidekick as thing with\n  x = 2\nend\n\n";

const carriedEdits: CarriedEdit[] = [
  {
    name: "edit a line of dialogue in the first scene",
    bugs: "any stale carried chunk",
    find: "Line one of dialogue in scene 0.",
    replace: "Line one of dialogue in scene 0, changed.",
    carries: ALL_CONSTRUCTS,
    flowReuse: true,
  },
  {
    // The closure in `reckon` calls `later`, which this declares; the fix of
    // #935 lowers that chunk again, and leaves the others carried.
    name: "insert a top-level function at the top of the file",
    bugs: "#912, #935",
    find: "define hero as character with",
    replace: FUNCTION_AT_TOP + "define hero as character with",
    carries: except("function with assignments, loops and a closure"),
    flowReuse: false,
  },
  {
    // The store `thing` now shadows a define type; the fix of #936 lowers its
    // chunk again, and leaves the others carried.
    name: "insert a define at the top of the file",
    bugs: "#936",
    find: "define hero as character with",
    replace: DEFINE_AT_TOP + "define hero as character with",
    carries: except("store named after an edit's define"),
    flowReuse: false,
  },
  {
    name: "insert a tag line at the top of the file",
    bugs: "#937",
    find: "define hero as character with",
    replace: "# opening\n\ndefine hero as character with",
    carries: ALL_CONSTRUCTS,
    flowReuse: true,
  },
  {
    name: "change a function's parameter list",
    bugs: "#841",
    find: "function bonus(x):",
    replace: "function bonus(x, y):",
    carries: ALL_CONSTRUCTS,
    flowReuse: false,
  },
  {
    name: "rename a callee",
    bugs: "#841",
    find: "function bonus(",
    replace: "function bonus_renamed(",
    carries: ALL_CONSTRUCTS,
    flowReuse: false,
  },
  {
    name: "edit a line of the then clause below a choice",
    bugs: "#668, #674",
    find: "The rest of the scene runs on here.",
    replace: "The rest of the scene runs on and on here.",
    carries: ["tag line", "store named after an edit's define", "store holding a method", "layout with bindings"],
    flowReuse: true,
  },
  {
    name: "edit a loop body inside a function",
    bugs: "#870, #912",
    find: "    t.a = t.a + i",
    replace: "    t.a = t.a + i * 2",
    carries: ["tag line", "tagged scene", "choose with a then clause", "store named after an edit's define", "store holding a method"],
    flowReuse: true,
  },
  {
    name: "edit a layout binding",
    bugs: "#848, #858",
    find: '  text "{trust} {t.a}"',
    replace: '  text "{trust} {t.b}"',
    carries: except("layout with bindings"),
    flowReuse: true,
  },
];

/** Counts the flows the last compile served from the serialized-flow cache. */
class Probe extends SparkdownCompiler {
  private previousCache?: Map<string, { value: unknown }>;

  protected override computeFlowReuse(story: RuntimeStory) {
    this.previousCache = this._flowJsonCache;
    return super.computeFlowReuse(story);
  }

  /** How many flows the last compile served from the cache. */
  served(): number {
    return servedFlowNames(this._flowJsonCache, this.previousCache).length;
  }
}

// Every compilation chunk of `uri`, with the source range it covers.
function chunkRanges(c: SparkdownCompiler, uri: string) {
  const out: { from: number; to: number; chunk: object }[] = [];
  const cur = c.documents.annotations(uri).compilations.iter();
  while (cur.value) {
    out.push({ from: cur.from, to: cur.to, chunk: cur.value.type });
    cur.next();
  }
  return out;
}

// The chunk each construct of `markers` starts in, in `text` as last compiled.
function constructChunks(c: SparkdownCompiler, uri: string, text: string, markers: Record<string, string>) {
  const ranges = chunkRanges(c, uri);
  const out = new Map<string, object>();
  for (const [construct, marker] of Object.entries(markers)) {
    const start = text.indexOf(marker);
    expect(start, `marker ${JSON.stringify(marker)} present`).toBeGreaterThanOrEqual(0);
    // A chunk starts at a line's first non-blank character.
    const at = start + marker.length - marker.trimStart().length;
    const found = ranges.find((r) => r.from <= at && at < r.to);
    expect(found, `a chunk holds ${construct}`).toBeDefined();
    out.set(construct, found!.chunk);
  }
  return out;
}

// The constructs of `before` whose chunk the compiler still holds for `uri`.
function carriedConstructs(c: SparkdownCompiler, uri: string, before: Map<string, object>) {
  const now = new Set(chunkRanges(c, uri).map((r) => r.chunk));
  return [...before].filter(([, chunk]) => now.has(chunk)).map(([construct]) => construct);
}

function pick(p: any) {
  return {
    compiled: p.compiled,
    pathLocations: p.pathLocations,
    dataLocations: p.dataLocations,
    functionLocations: p.functionLocations,
    sceneLocations: p.sceneLocations,
    knotLocations: p.knotLocations,
    stitchLocations: p.stitchLocations,
    branchLocations: p.branchLocations,
    labelLocations: p.labelLocations,
    context: p.context,
    diagnostics: p.diagnostics,
    ui: p.ui,
    colorAnnotations: p.colorAnnotations,
    // Capture the EMISSION ORDER of pathLocations/dataLocations as arrays.
    // stable() sorts object keys, so it would NOT catch a reordering — but a
    // source line is resolved by binary search over the path-location table,
    // which relies on its rows being in script, line and column order, so an
    // incremental scheme must reproduce that order exactly.
    pathLocationsOrder: p.pathLocations?.paths ?? [],
    dataLocationsOrder: Object.keys(p.dataLocations ?? {}),
  };
}

function stable(value: unknown): string {
  const seen = new WeakSet();
  const walk = (v: any): any => {
    if (v && typeof v === "object") {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
      if (Array.isArray(v)) return v.map(walk);
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

const URI = "inmemory:///main.sd";

function coldCompile(text: string) {
  const c = new SparkdownCompiler();
  c.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  });
  return pick(c.compile({ textDocument: { uri: URI } }).program);
}

// Translate an absolute offset into a {line, character} position in `text`.
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

// The script files of a project given as texts by URI.
const filesOf = (texts: Record<string, string>) =>
  Object.entries(texts).map(([uri, text]) => ({
    uri,
    type: "script",
    name: uri.slice("inmemory:///".length, -".sd".length),
    ext: "sd",
    text,
    version: 1,
    languageId: "sparkdown",
  }));

// The warm-up edits of `warmed`, each one character of a line of dialogue.
const WARM_EDITS: [string, string][] = [
  ["Line one of dialogue in scene 3.", "Line one of dialogue in scene 3!"],
  ["Line one of dialogue in scene 4.", "Line one of dialogue in scene 4!"],
];

// `text` with the warm-up edits applied.
const warmText = (text: string) => WARM_EDITS.reduce((t, [find, replace]) => t.replace(find, replace), text);

// Configures `c` with the scripts of `texts`, compiles `URI`, then makes the
// warm-up edits to the main script, compiling after each, and returns the
// texts after them. Most edits in an editor session reach a compiler whose
// chunks and serialized-flow cache were left by earlier incremental compiles,
// not by a cold one, and these edits put the compiler in that state before
// the edit under test; the first edit after a cold compile is pinned in
// `incrementalOutsideFlowReuse.test.ts`. The edits keep the text's length, so
// offsets into the fixture stay valid.
function warmed<T extends SparkdownCompiler>(c: T, texts: Record<string, string>): Record<string, string> {
  c.configure({ files: filesOf(texts) });
  c.compile({ textDocument: { uri: URI } });
  let main = texts[URI]!;
  let version = 1;
  for (const [find, replace] of WARM_EDITS) {
    const offset = main.indexOf(find);
    expect(offset, `the warm-up line "${find}" is present`).toBeGreaterThanOrEqual(0);
    version += 1;
    c.updateDocument({
      textDocument: { uri: URI, version },
      contentChanges: [{ range: { start: posAt(main, offset), end: posAt(main, offset + find.length) }, text: replace }],
    });
    main = main.slice(0, offset) + replace + main.slice(offset + find.length);
    c.compile({ textDocument: { uri: URI } });
  }
  return { ...texts, [URI]: main };
}

// The version of the first edit after `warmed`.
const AFTER_WARM = WARM_EDITS.length + 2;

describe("compiler incremental equivalence", () => {
  it("the fixture's continuations carry a group, one per continuation", () => {
    // The edits below move and add continuations; this keeps them from
    // passing on a fixture whose continuations carry no group at all.
    const text = coupledScreenplay();
    const continuations = text.split("Glued in scene").length - 1;
    const json = JSON.stringify(coldCompile(text).compiled);
    const groups = [...json.matchAll(/"\^group","\/str","str","\^([^"]*)"/g)].map((m) => m[1]);
    expect(continuations).toBeGreaterThan(0);
    expect(new Set(groups).size).toBe(continuations);
  });

  it("the end-of-document append edit appends at the end of the fixture", () => {
    // The sequential run below pins a reuse-ahead edit followed by an append
    // at the end of the document; an append with chunks after it would not.
    const append = edits.find((e) => e.name === "append a whole new scene at end")!;
    expect(coupledScreenplay().endsWith(append.find)).toBe(true);
  });

  // Each diverse edit is applied as a SINGLE minimal-range incremental update
  // from a freshly-configured compiler (after the warm-up edit of `warmed`),
  // then compared to a cold compile of the
  // resulting text. This isolates per-edit-type correctness (exactly what the
  // per-chunk caching must preserve). The cumulative path (many edits on ONE
  // persistent compiler) is separately stressed by the sequential + fuzz tests.
  for (const edit of edits) {
    it(`incremental == cold for edit: ${edit.name}`, () => {
      const realWarn = console.warn;
      const realError = console.error;
      console.warn = () => {};
      console.error = () => {};
      try {
        const incr = new SparkdownCompiler();
        const base = warmed(incr, { [URI]: coupledScreenplay() })[URI]!;
        const offset = base.indexOf(edit.find);
        expect(offset, `find "${edit.find}" present`).toBeGreaterThanOrEqual(0);
        const start = posAt(base, offset);
        const end = posAt(base, offset + edit.find.length);
        const after = base.slice(0, offset) + edit.replace + base.slice(offset + edit.find.length);
        incr.updateDocument({
          textDocument: { uri: URI, version: AFTER_WARM },
          contentChanges: [{ range: { start, end }, text: edit.replace }],
        });
        const incrProg = pick(incr.compile({ textDocument: { uri: URI } }).program);
        const coldProg = coldCompile(after);
        expect(stable(incrProg)).toBe(stable(coldProg));
      } finally {
        console.warn = realWarn;
        console.error = realError;
      }
    });
  }

  // Each edit leaves the chunks it names carried, asserted by chunk identity,
  // so the comparison with a cold compile covers a construct that the
  // incremental compile did not lower again. Without that check an edit that
  // happened to reach a construct's chunk, or a guard that disabled reuse,
  // would let the comparison pass without testing the carried chunk.
  //
  // The reuse verdict is a test of its own, over the same compile, so that
  // an edit whose verdict an open Bug gets wrong still has its output and its
  // carried chunks checked.
  const outcomes = new Map<CarriedEdit, { equal: boolean; carried: string[]; reused: boolean }>();
  const outcomeOf = (edit: CarriedEdit) => {
    let outcome = outcomes.get(edit);
    if (outcome) return outcome;
    const realWarn = console.warn;
    const realError = console.error;
    console.warn = () => {};
    console.error = () => {};
    try {
      const incr = new Probe();
      const base = warmed(incr, { [URI]: coupledScreenplay() })[URI]!;
      const offset = base.indexOf(edit.find);
      expect(offset, `find "${edit.find}" present`).toBeGreaterThanOrEqual(0);
      const after = base.slice(0, offset) + edit.replace + base.slice(offset + edit.find.length);
      const before = constructChunks(incr, URI, base, constructMarkers());
      incr.updateDocument({
        textDocument: { uri: URI, version: AFTER_WARM },
        contentChanges: [
          { range: { start: posAt(base, offset), end: posAt(base, offset + edit.find.length) }, text: edit.replace },
        ],
      });
      const incrProg = pick(incr.compile({ textDocument: { uri: URI } }).program);
      outcome = {
        equal: stable(incrProg) === stable(coldCompile(after)),
        carried: carriedConstructs(incr, URI, before),
        reused: incr.served() > 0,
      };
      outcomes.set(edit, outcome);
      return outcome;
    } finally {
      console.warn = realWarn;
      console.error = realError;
    }
  };
  const failingUntil = (bug: string | undefined) => (bug ? `, failing until ${bug} is fixed` : "");

  for (const edit of carriedEdits) {
    (edit.knownBug ? it.fails : it)(
      `incremental == cold with the constructs carried, for edit: ${edit.name} (${edit.bugs})${failingUntil(edit.knownBug)}`,
      () => {
        const outcome = outcomeOf(edit);
        expect(outcome.equal, "incremental == cold").toBe(true);
        expect(outcome.carried).toEqual(expect.arrayContaining(edit.carries));
      },
    );
    it(
      `flows ${edit.flowReuse ? "are" : "are not"} served from the cache, for edit: ${edit.name}`,
      () => {
        expect(outcomeOf(edit).reused).toBe(edit.flowReuse);
      },
    );
  }

  it("every construct is carried by at least one seeded edit", () => {
    const covered = new Set(carriedEdits.flatMap((e) => e.carries));
    expect(ALL_CONSTRUCTS.filter((c) => !covered.has(c))).toEqual([]);
  });

  it("incremental == cold across the full diverse edit sequence on ONE compiler", () => {
    // Drives all diverse edits SEQUENTIALLY through one persistent compiler,
    // comparing to a cold compile after each. This is the cumulative path that
    // exposed the `reparsedTo` append-drift bug (any reuse-ahead edit followed
    // by an end-of-document append diverged); it fails without that fix.
    const realWarn = console.warn;
    const realError = console.error;
    console.warn = () => {};
    console.error = () => {};
    try {
      let text = coupledScreenplay();
      const incr = new SparkdownCompiler();
      incr.configure({
        files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
      });
      incr.compile({ textDocument: { uri: URI } });
      let version = 1;
      for (const edit of [...edits, ...carriedEdits.filter((e) => !e.knownBug)]) {
        const offset = text.indexOf(edit.find);
        expect(offset, `find "${edit.find}" present`).toBeGreaterThanOrEqual(0);
        const start = posAt(text, offset);
        const end = posAt(text, offset + edit.find.length);
        version += 1;
        incr.updateDocument({
          textDocument: { uri: URI, version },
          contentChanges: [{ range: { start, end }, text: edit.replace }],
        });
        text = text.slice(0, offset) + edit.replace + text.slice(offset + edit.find.length);
        const incrProg = pick(incr.compile({ textDocument: { uri: URI } }).program);
        const coldProg = coldCompile(text);
        expect(stable(incrProg), `after sequential edit "${edit.name}"`).toBe(stable(coldProg));
      }
    } finally {
      console.warn = realWarn;
      console.error = realError;
    }
  });

  it("incremental == cold across reuse-repair sequences (flow-reuse hazards)", () => {
    // Multi-step sequences targeting the incremental-ExportRuntime failure
    // modes that only appear when an UNCHANGED (reused) flow's cached runtime
    // subtree must be repaired by re-resolution:
    //  - read-count removal: the target flow's `#f` count flag must DECAY on
    //    its reused container (set-only cross-flow flag reconcile);
    //  - rename-then-rename-back: a reused flow's divert must drop its stale
    //    resolved path when the target vanishes AND re-resolve when it
    //    returns (epoch-guarded targetContent + targetPath restore);
    //  - a global `store` declared INSIDE a scene registers into the story
    //    at GENERATION time, so that scene must be disqualified from reuse;
    //  - an anonymous fn added MID-DOCUMENT renumbers `__synth_<n>` ordinals
    //    baked into a LATER unchanged flow at generation (rename demotion).
    const SCENARIOS: {
      name: string;
      steps: { find: string; replace: string }[];
      /** Assert the reuse-demotion path actually ran (see that scenario). */
      expectsDemotion?: boolean;
    }[] = [
      {
        name: "remove last read-count reference, then edit elsewhere",
        steps: [
          // scene_2 holds the ONLY read-count of scene_3; removing it must
          // clear scene_3's visit flag even though scene_3 is reused.
          { find: "read-count {scene_3} here.", replace: "read-count gone." },
          { find: "Not yet in scene 9.", replace: "Not yet in scene 9!" },
        ],
      },
      {
        name: "rename a divert target away and back",
        steps: [
          { find: "scene scene_4", replace: "scene scene_4x" },
          { find: "scene scene_4x", replace: "scene scene_4" },
        ],
      },
      {
        name: "global store declared inside a scene, then edit elsewhere",
        steps: [
          {
            find: "  Action describing room 5 in some detail here.",
            replace:
              "  Action describing room 5 in some detail here.\nstore inscene_flag = 7",
          },
          { find: "Not yet in scene 10.", replace: "Not yet in scene 10?" },
        ],
      },
      {
        name: "anonymous fn added mid-document renumbers later synthetics",
        // Both inserts land MID-document on purpose. An insert near the top
        // re-lowers the front-matter chunk, which trips the root-region guard
        // and disables reuse for that compile — the scenario would then pass
        // without ever exercising demotion (verified: it did exactly that
        // before this was moved down). `expectsDemotion` asserts the path
        // really runs, so a future guard change can't silently un-cover it.
        expectsDemotion: true,
        steps: [
          // Seed a synthetic in a LATE scene first...
          {
            find: "  Action describing room 11 in some detail here.",
            replace:
              "  Action describing room 11 in some detail here.\n& local f11 = function(x) return x + 1 end",
          },
          // ...then add one EARLIER-BUT-STILL-MID: scenes after it are
          // unchanged (reused) yet their `__synth_<n>` ordinals shift, so they
          // must be demoted and regenerated.
          {
            find: "  Action describing room 6 in some detail here.",
            replace:
              "  Action describing room 6 in some detail here.\n& local f6 = function(x) return x + 2 end",
          },
          { find: "Not yet in scene 12.", replace: "Not yet in scene 12!" },
        ],
      },
      {
        name: "anonymous fn inside a stdlib call's arguments renumbered in a reused scene",
        // `print` generates without its proxy divert, which holds its
        // arguments, so after the first compile the carried call reaches the
        // function only through `args`. The second step renumbers it.
        expectsDemotion: true,
        steps: [
          {
            find: "  Action describing room 11 in some detail here.",
            replace:
              "  Action describing room 11 in some detail here.\n& print(function(x) return x + 1 end)",
          },
          {
            find: "  Action describing room 6 in some detail here.",
            replace:
              "  Action describing room 6 in some detail here.\n& local f6 = function(x) return x + 2 end",
          },
          { find: "Not yet in scene 12.", replace: "Not yet in scene 12!" },
        ],
      },
    ];
    const realWarn = console.warn;
    const realError = console.error;
    console.warn = () => {};
    console.error = () => {};
    try {
      for (const scenario of SCENARIOS) {
        let text = coupledScreenplay();
        const incr = new SparkdownCompiler();
        // Count demotions (a committed reuse invalidated mid-compile and
        // regenerated) so `expectsDemotion` can prove the path was covered.
        let demotions = 0;
        const anyIncr = incr as unknown as {
          resetSubtreeRuntime: (n: unknown) => void;
        };
        const originalReset = anyIncr.resetSubtreeRuntime;
        anyIncr.resetSubtreeRuntime = function (n: unknown) {
          demotions += 1;
          return originalReset.call(this, n);
        };
        incr.configure({
          files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
        });
        incr.compile({ textDocument: { uri: URI } });
        let version = 1;
        for (const [stepIdx, step] of scenario.steps.entries()) {
          const offset = text.indexOf(step.find);
          expect(
            offset,
            `${scenario.name}: find "${step.find}" present`,
          ).toBeGreaterThanOrEqual(0);
          const start = posAt(text, offset);
          const end = posAt(text, offset + step.find.length);
          version += 1;
          incr.updateDocument({
            textDocument: { uri: URI, version },
            contentChanges: [{ range: { start, end }, text: step.replace }],
          });
          text =
            text.slice(0, offset) +
            step.replace +
            text.slice(offset + step.find.length);
          const incrProg = pick(incr.compile({ textDocument: { uri: URI } }).program);
          const coldProg = coldCompile(text);
          expect(
            stable(incrProg),
            `${scenario.name}: step ${stepIdx + 1}`,
          ).toBe(stable(coldProg));
        }
        if (scenario.expectsDemotion) {
          expect(
            demotions,
            `${scenario.name}: expected the reuse-demotion path to run`,
          ).toBeGreaterThan(0);
        }
      }
    } finally {
      console.warn = realWarn;
      console.error = realError;
    }
  });

  it("incremental == cold location maps when a structural edit changes the flow set", () => {
    // Breaking the FIRST scene's header removes it from the flow set and shifts
    // the document-global `dataLocations` ownership (the first `& trust =`, which
    // is keyed by bare name and owned by the first writer across ALL flows). The
    // per-flow location cache must detect the flow-set change and full-recompute,
    // or it drops the entry. Compares the location-map fields only: malformed
    // input also trips a separate pre-existing parser diagnostics drift.
    const realWarn = console.warn;
    const realError = console.error;
    console.warn = () => {};
    console.error = () => {};
    try {
      const base = coupledScreenplay();
      const find = "scene scene_0";
      const offset = base.indexOf(find);
      expect(offset).toBeGreaterThanOrEqual(0);
      const start = posAt(base, offset);
      const end = posAt(base, offset + find.length);
      const replace = "scen scene_0"; // break the `scene` keyword
      const after = base.slice(0, offset) + replace + base.slice(offset + find.length);
      const incr = new SparkdownCompiler();
      incr.configure({
        files: [{ uri: URI, type: "script", name: "main", ext: "sd", text: base, version: 1, languageId: "sparkdown" }],
      });
      incr.compile({ textDocument: { uri: URI } });
      incr.updateDocument({
        textDocument: { uri: URI, version: 2 },
        contentChanges: [{ range: { start, end }, text: replace }],
      });
      const locOf = (p: any) => ({
        pathLocations: p.pathLocations,
        dataLocations: p.dataLocations,
        pathLocationsOrder: p.pathLocationsOrder,
        dataLocationsOrder: p.dataLocationsOrder,
      });
      const incrLoc = locOf(pick(incr.compile({ textDocument: { uri: URI } }).program));
      const coldLoc = locOf(coldCompile(after));
      expect(stable(incrLoc)).toBe(stable(coldLoc));
    } finally {
      console.warn = realWarn;
      console.error = realError;
    }
  });

  // A global's data location belongs to its first writer across all flows.
  // Removing that writer passes the name to the next one, here in a scene the
  // edit leaves unchanged, so the replay of that scene's cached locations must
  // hold its write to the name although it did not own it when captured.
  for (const edit of [
    { name: "delete the first writer line", find: "& trust = 1\n", replace: "" },
    { name: "comment out the first writer", find: "& trust = 1", replace: "& tr// cust = 1" },
  ]) {
    it(`incremental == cold data locations when an edit removes a global's first writer: ${edit.name}`, () => {
      const base = "store trust = 0\n\nscene one\n& trust = 1\n-> two\nend\n\nscene two\n& trust = 2\nend\n";
      const offset = base.indexOf(edit.find);
      expect(offset).toBeGreaterThanOrEqual(0);
      const after = base.slice(0, offset) + edit.replace + base.slice(offset + edit.find.length);
      const incr = new SparkdownCompiler();
      incr.configure({
        files: [{ uri: URI, type: "script", name: "main", ext: "sd", text: base, version: 1, languageId: "sparkdown" }],
      });
      incr.compile({ textDocument: { uri: URI } });
      incr.updateDocument({
        textDocument: { uri: URI, version: 2 },
        contentChanges: [
          { range: { start: posAt(base, offset), end: posAt(base, offset + edit.find.length) }, text: edit.replace },
        ],
      });
      const incrProg = pick(incr.compile({ textDocument: { uri: URI } }).program);
      const coldProg = coldCompile(after);
      expect(coldProg.dataLocations?.trust).toBeDefined();
      expect(stable(incrProg)).toBe(stable(coldProg));
    });
  }

  // A name declared a second time (#979). The fixture ends with one
  // `define dup` and a scene after it holding a divert to a missing target,
  // and the edit declares `dup` again at the top. The cold compile refuses the
  // carried `define dup` below as the duplicate and resolves past it to the
  // scene, while the incremental compile carries that define and scene from a
  // compile in which the define was the first declaration. Both compiles
  // report the duplicate and the missing target, and their diagnostics agree.
  describe("an edit that declares a name a second time", () => {
    const base = () =>
      coupledScreenplay() + "\ndefine dup with\n  x = 1\nend\n\nscene tail\n  Tail line.\n  -> nowhere\nend\n";
    const DUPLICATE = "define dup with\n  x = 2\nend\n\n";
    const messages = (p: any): string[] =>
      Object.values(p.diagnostics ?? {})
        .flat()
        .map((d: any) => (typeof d.message === "string" ? d.message : (d.message?.value ?? "")));
    let outcome: { incr: any; cold: any } | undefined;
    const outcomeOf = () => {
      if (outcome) return outcome;
      const realWarn = console.warn;
      const realError = console.error;
      console.warn = () => {};
      console.error = () => {};
      try {
        const incr = new Probe();
        const text = warmed(incr, { [URI]: base() })[URI]!;
        const anchor = "define hero as character with";
        const offset = text.indexOf(anchor);
        const at = posAt(text, offset);
        incr.updateDocument({
          textDocument: { uri: URI, version: AFTER_WARM },
          contentChanges: [{ range: { start: at, end: at }, text: DUPLICATE }],
        });
        const after = text.slice(0, offset) + DUPLICATE + text.slice(offset);
        outcome = { incr: pick(incr.compile({ textDocument: { uri: URI } }).program), cold: coldCompile(after) };
        return outcome;
      } finally {
        console.warn = realWarn;
        console.error = realError;
      }
    };

    it("the cold compile reports the duplicate and the missing target", () => {
      const { cold } = outcomeOf();
      expect(messages(cold).some((m) => m.startsWith("Duplicate identifier `dup`"))).toBe(true);
      expect(messages(cold).some((m) => m.includes("target not found: `-> nowhere`"))).toBe(true);
    });

    it("incremental == cold diagnostics", () => {
      const { incr, cold } = outcomeOf();
      expect(stable(incr.diagnostics)).toBe(stable(cold.diagnostics));
    });
  });

  // A project of three scripts: `main` includes `chapter` and `side`, and
  // `side` includes `chapter` again (#872). `chapter` holds a second copy of
  // the constructs below six short scenes, so an edit at its top, or any edit
  // in `main`, leaves their chunks carried (#404).
  describe("across included scripts", () => {
    const CHAPTER_URI = "inmemory:///chapter.sd";
    const SIDE_URI = "inmemory:///side.sd";
    const project = () => ({
      [URI]: coupledScreenplay().replace(
        "define hero as character with",
        "include chapter.sd\ninclude side.sd\n\ndefine hero as character with",
      ),
      [CHAPTER_URI]: includedChapter(),
      [SIDE_URI]: "include chapter.sd\n\nscene side_one\n  Side line.\nend\n",
    });
    const coldProject = (texts: Record<string, string>) => {
      const c = new SparkdownCompiler();
      c.configure({ files: filesOf(texts) });
      return pick(c.compile({ textDocument: { uri: URI } }).program);
    };

    // `carries` names the constructs of the edited script whose chunks the
    // edit leaves carried, `otherCarries` those of the other script that holds
    // a copy (`chapter` for an edit to `main`, `main` otherwise).
    const projectEdits: (Edit & {
      uri: string;
      bugs: string;
      carries: Construct[];
      otherCarries: Construct[];
      flowReuse: boolean;
    })[] = [
      {
        name: "edit a line of dialogue in the including script",
        bugs: "#404",
        uri: URI,
        find: "Line one of dialogue in scene 0.",
        replace: "Line one of dialogue in scene 0, changed.",
        carries: ALL_CONSTRUCTS,
        otherCarries: ALL_CONSTRUCTS,
        flowReuse: true,
      },
      {
        name: "edit a line at the top of the included script",
        bugs: "#404, #872",
        uri: CHAPTER_URI,
        find: "Chapter line 0.",
        replace: "Chapter line 0, changed.",
        carries: ALL_CONSTRUCTS,
        otherCarries: ALL_CONSTRUCTS,
        flowReuse: true,
      },
      {
        name: "declare the included closure's callee at the top of the included script",
        bugs: "#935",
        uri: CHAPTER_URI,
        find: "scene chapter_0",
        replace: "function ch_later()\n  return 7\nend\n\nscene chapter_0",
        carries: except("function with assignments, loops and a closure"),
        otherCarries: ALL_CONSTRUCTS,
        flowReuse: false,
      },
      {
        name: "declare the included closure's callee in the including script",
        bugs: "#935",
        uri: URI,
        find: "define hero as character with",
        replace: "function ch_later()\n  return 7\nend\n\ndefine hero as character with",
        carries: ALL_CONSTRUCTS,
        otherCarries: except("function with assignments, loops and a closure"),
        flowReuse: false,
      },
      {
        name: "insert a define the included store is named after, in the including script",
        bugs: "#936",
        uri: URI,
        find: "define hero as character with",
        replace: "define ch_thing with\n  x = 1\nend\n\ndefine ch_sidekick as ch_thing with\n  x = 2\nend\n\ndefine hero as character with",
        carries: ALL_CONSTRUCTS,
        otherCarries: except("store named after an edit's define"),
        flowReuse: false,
      },
    ];

    const markersOf = (uri: string) => constructMarkers(uri === URI ? "" : "ch_");

    for (const edit of projectEdits) {
      it(`incremental == cold for edit: ${edit.name} (${edit.bugs})`, () => {
        const realWarn = console.warn;
        const realError = console.error;
        console.warn = () => {};
        console.error = () => {};
        try {
          const incr = new Probe();
          const texts = warmed(incr, project());
          const base = texts[edit.uri]!;
          const offset = base.indexOf(edit.find);
          expect(offset, `find "${edit.find}" present`).toBeGreaterThanOrEqual(0);
          const other = edit.uri === URI ? CHAPTER_URI : URI;
          const editedBefore = constructChunks(incr, edit.uri, base, markersOf(edit.uri));
          const otherBefore = constructChunks(incr, other, texts[other]!, markersOf(other));
          incr.updateDocument({
            textDocument: { uri: edit.uri, version: AFTER_WARM },
            contentChanges: [
              { range: { start: posAt(base, offset), end: posAt(base, offset + edit.find.length) }, text: edit.replace },
            ],
          });
          const after = { ...texts, [edit.uri]: base.slice(0, offset) + edit.replace + base.slice(offset + edit.find.length) };
          const incrProg = pick(incr.compile({ textDocument: { uri: URI } }).program);
          expect(stable(incrProg)).toBe(stable(coldProject(after)));
          expect(carriedConstructs(incr, edit.uri, editedBefore), "edited script").toEqual(
            expect.arrayContaining(edit.carries),
          );
          expect(carriedConstructs(incr, other, otherBefore), "other script").toEqual(
            expect.arrayContaining(edit.otherCarries),
          );
          expect(incr.served() > 0, "flows served from the cache").toBe(edit.flowReuse);
        } finally {
          console.warn = realWarn;
          console.error = realError;
        }
      });
    }
  });

  it("incremental == cold under randomized structural edits (fuzz, full surface)", () => {
    // Each random edit (structural inserts AND mid-content deletions) is applied
    // as a SINGLE incremental update from a freshly configured compiler and
    // compared on the FULL program surface to a cold compile. This exercises the
    // location/ToJson reuse paths AND the incremental parser+annotation+validation
    // across a wide variety of edit sites/kinds. The seeded edits include one
    // that comments out scene 0's `& trust = …`, the first writer of `trust`.
    const realWarn = console.warn;
    const realError = console.error;
    console.warn = () => {};
    console.error = () => {};
    try {
      // The warm-up edit is the same for every compiler, so its text is the
      // base every random edit applies to.
      const base = warmText(coupledScreenplay());
      let compiles = 0;
      let reusing = 0;
      const failures: string[] = [];
      // Deterministic LCG so the fuzz is reproducible (no Math.random).
      let seed = 0x2f6e2b1;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      // The last seven write pieces of the fixture's constructs: a tag, a
      // `then`, a method call, a compound assignment, a binding, a closure
      // and a `define` header.
      const inserts = ["x", "\n", " ", "1", "}", "{", "{trust}", "// c", "->", "end", ")", "", "# t", "then", ":add(1)", " += 1", "{t.a}", "function() return 1 end", "\ndefine thing with\n"];
      for (let n = 0; n < 120; n++) {
        const insert = inserts[Math.floor(rand() * inserts.length)]!;
        const delLen = rand() < 0.4 ? Math.min(1 + Math.floor(rand() * 8), 14) : 0;
        if (insert === "" && delLen === 0) continue;
        const offset = Math.floor(rand() * base.length);
        const start = posAt(base, offset);
        const end = posAt(base, Math.min(offset + delLen, base.length));
        const after = base.slice(0, offset) + insert + base.slice(offset + delLen);

        const incr = new Probe();
        warmed(incr, { [URI]: coupledScreenplay() });
        incr.updateDocument({
          textDocument: { uri: URI, version: AFTER_WARM },
          contentChanges: [{ range: { start, end }, text: insert }],
        });
        const incrProg = pick(incr.compile({ textDocument: { uri: URI } }).program);
        compiles += 1;
        if (incr.served() > 0) reusing += 1;
        const coldProg = coldCompile(after);
        const diverged = (Object.keys(coldProg) as (keyof typeof coldProg)[]).filter(
          (f) => stable(incrProg[f]) !== stable(coldProg[f]),
        );
        if (diverged.length) {
          failures.push(`#${n} insert=${JSON.stringify(insert)} del=${delLen} @${offset} fields={${diverged.join(",")}}`);
        }
      }
      expect(failures, `incremental-vs-cold divergences:\n${failures.join("\n")}`).toEqual([]);
      // Most random edits declare no name and change no signature, so most
      // compiles serve flows from the cache; a guard that refused reuse on
      // every compile would pass the comparisons above without testing it.
      expect(reusing, `compiles that served flows from the cache, of ${compiles}`).toBeGreaterThan(compiles / 2);
    } finally {
      console.warn = realWarn;
      console.error = realError;
    }
  });
});
