import { describe, it, expect } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { programListing } from "../programListing";
import { describeRoot } from "../program/describeRoot";
import { coupledScreenplay, includedChapter } from "./fixtures/coupledScreenplay";

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
  { name: "append a whole new scene at end", find: 'layout hud with\n  text "{trust} {t.a}"\nend\n', replace: 'layout hud with\n  text "{trust} {t.a}"\nend\n\nscene scene_extra\n= INT. NEW - DAY\n:\n  Brand new action.\n-> DONE\nend\n' },
];

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

interface CarriedEdit extends Edit {
  bugs: string;
  carries: Construct[];
  knownBug?: string;
}

const FUNCTION_AT_TOP = "function later()\n  return 7\nend\n\n";
const DEFINE_AT_TOP = "define thing with\n  x = 1\nend\n\ndefine sidekick as thing with\n  x = 2\nend\n\n";

const carriedEdits: CarriedEdit[] = [
  {
    name: "edit a line of dialogue in the first scene",
    bugs: "any stale carried chunk",
    find: "Line one of dialogue in scene 0.",
    replace: "Line one of dialogue in scene 0, changed.",
    carries: ALL_CONSTRUCTS,
  },
  {
    name: "insert a top-level function at the top of the file",
    bugs: "#912, #935",
    find: "define hero as character with",
    replace: FUNCTION_AT_TOP + "define hero as character with",
    carries: except("function with assignments, loops and a closure"),
  },
  {
    name: "insert a define at the top of the file",
    bugs: "#936",
    find: "define hero as character with",
    replace: DEFINE_AT_TOP + "define hero as character with",
    carries: except("store named after an edit's define"),
  },
  {
    name: "insert a tag line at the top of the file",
    bugs: "#937",
    find: "define hero as character with",
    replace: "# opening\n\ndefine hero as character with",
    carries: ALL_CONSTRUCTS,
  },
  {
    name: "change a function's parameter list",
    bugs: "#841",
    find: "function bonus(x):",
    replace: "function bonus(x, y):",
    carries: ALL_CONSTRUCTS,
  },
  {
    name: "rename a callee",
    bugs: "#841",
    find: "function bonus(",
    replace: "function bonus_renamed(",
    carries: ALL_CONSTRUCTS,
  },
  {
    name: "edit a line of the then clause below a choice",
    bugs: "#668, #674",
    find: "The rest of the scene runs on here.",
    replace: "The rest of the scene runs on and on here.",
    carries: ["tag line", "store named after an edit's define", "store holding a method", "layout with bindings"],
  },
  {
    name: "edit a loop body inside a function",
    bugs: "#870, #912",
    find: "    t.a = t.a + i",
    replace: "    t.a = t.a + i * 2",
    carries: ["tag line", "tagged scene", "choose with a then clause", "store named after an edit's define", "store holding a method"],
  },
  {
    name: "edit a layout binding",
    bugs: "#848, #858",
    find: '  text "{trust} {t.a}"',
    replace: '  text "{trust} {t.b}"',
    carries: except("layout with bindings"),
  },
];

function chunkRanges(c: SparkdownCompiler, uri: string) {
  const out: { from: number; to: number; chunk: object }[] = [];
  const cur = c.documents.annotations(uri).compilations.iter();
  while (cur.value) {
    out.push({ from: cur.from, to: cur.to, chunk: cur.value.type });
    cur.next();
  }
  return out;
}

function constructChunks(c: SparkdownCompiler, uri: string, text: string, markers: Record<string, string>) {
  const ranges = chunkRanges(c, uri);
  const out = new Map<string, object>();
  for (const [construct, marker] of Object.entries(markers)) {
    const start = text.indexOf(marker);
    expect(start, `marker ${JSON.stringify(marker)} present`).toBeGreaterThanOrEqual(0);
    const at = start + marker.length - marker.trimStart().length;
    const found = ranges.find((r) => r.from <= at && at < r.to);
    expect(found, `a chunk holds ${construct}`).toBeDefined();
    out.set(construct, found!.chunk);
  }
  return out;
}

function carriedConstructs(c: SparkdownCompiler, uri: string, before: Map<string, object>) {
  const now = new Set(chunkRanges(c, uri).map((r) => r.chunk));
  return [...before].filter(([, chunk]) => now.has(chunk)).map(([construct]) => construct);
}

function pick(p: any) {
  return {
    chunks: p.chunks ? describeRoot(p.chunks) : null,
    functionLocations: p.functionLocations,
    sceneLocations: p.sceneLocations,
    knotLocations: p.knotLocations,
    branchLocations: p.branchLocations,
    labelLocations: p.labelLocations,
    context: p.context,
    diagnostics: p.diagnostics,
    ui: p.ui,
    colorAnnotations: p.colorAnnotations,
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

const WARM_EDITS: [string, string][] = [
  ["Line one of dialogue in scene 3.", "Line one of dialogue in scene 3!"],
  ["Line one of dialogue in scene 4.", "Line one of dialogue in scene 4!"],
];

const warmText = (text: string) => WARM_EDITS.reduce((t, [find, replace]) => t.replace(find, replace), text);

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

const AFTER_WARM = WARM_EDITS.length + 2;

describe("compiler incremental equivalence", () => {
  it("the fixture's continuations carry a group, one per continuation", () => {
    const text = coupledScreenplay();
    const continuations = text.split("Glued in scene").length - 1;
    const c = new SparkdownCompiler();
    c.configure({
      files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
    });
    const listing = programListing(c.compile({ textDocument: { uri: URI } }).program.chunks!);
    const groups = listing.filter((_, i) => listing[i - 1] === 'Str "group"');
    expect(continuations).toBeGreaterThan(0);
    expect(new Set(groups).size).toBe(continuations);
  });

  it("the end-of-document append edit appends at the end of the fixture", () => {
    const append = edits.find((e) => e.name === "append a whole new scene at end")!;
    expect(coupledScreenplay().endsWith(append.find)).toBe(true);
  });

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

  const outcomes = new Map<CarriedEdit, { equal: boolean; carried: string[] }>();
  const outcomeOf = (edit: CarriedEdit) => {
    let outcome = outcomes.get(edit);
    if (outcome) return outcome;
    const realWarn = console.warn;
    const realError = console.error;
    console.warn = () => {};
    console.error = () => {};
    try {
      const incr = new SparkdownCompiler();
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
  }

  it("every construct is carried by at least one seeded edit", () => {
    const covered = new Set(carriedEdits.flatMap((e) => e.carries));
    expect(ALL_CONSTRUCTS.filter((c) => !covered.has(c))).toEqual([]);
  });

  it("incremental == cold across the full diverse edit sequence on ONE compiler", () => {
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

  it("incremental == cold across multi-step sequences that couple flows", () => {
    const SCENARIOS: {
      name: string;
      steps: { find: string; replace: string }[];
    }[] = [
      {
        name: "remove last read-count reference, then edit elsewhere",
        steps: [
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
        name: "global store declared between scenes mid-document, then edit elsewhere",
        steps: [
          {
            find: "scene scene_5\n",
            replace: "store midway_flag = 7\n\nscene scene_5\n",
          },
          { find: "Not yet in scene 10.", replace: "Not yet in scene 10?" },
        ],
      },
      {
        name: "local inside a scene edited, then a branch added after it",
        steps: [
          {
            find: "  Action describing room 5 in some detail here.",
            replace:
              "  Action describing room 5 in some detail here.\n  local seen = 1\n  local function peek() return seen end\n  & local read = function() return seen end\n  Seen {seen} {peek()} {read()}.",
          },
          { find: "  local seen = 1", replace: "  local seen = 2" },
          {
            find: "-> scene_8\nend\n",
            replace: "-> scene_8\n  branch aside\n    Aside {tostring(seen)}.\n  end\nend\n",
          },
          { find: "Not yet in scene 9.", replace: "Not yet in scene 9!" },
        ],
      },
      {
        name: "anonymous fn added mid-document renumbers later synthetics",
        steps: [
          {
            find: "  Action describing room 11 in some detail here.",
            replace:
              "  Action describing room 11 in some detail here.\n& local f11 = function(x) return x + 1 end",
          },
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
      }
    } finally {
      console.warn = realWarn;
      console.error = realError;
    }
  });

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
        const incr = new SparkdownCompiler();
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

  describe("an edit above a colon call on a missing stdlib member", () => {
    const CALL = "  n = table:nogetn()";
    const base = () => coupledScreenplay() + `\nfunction colon_member()\n${CALL}\nend\n`;
    const warnings = (p: any, text: string) =>
      Object.values(p.diagnostics ?? {})
        .flat()
        .filter((d: any) => (d.message?.value ?? d.message) === "Cannot find item or path named `table.nogetn`")
        .map((d: any) => ({ range: d.range, line: text.split("\n")[d.range.start.line] }));
    let outcome: { incr: any; cold: any; after: string } | undefined;
    const outcomeOf = () => {
      if (outcome) return outcome;
      const realWarn = console.warn;
      const realError = console.error;
      console.warn = () => {};
      console.error = () => {};
      try {
        const incr = new SparkdownCompiler();
        const text = warmed(incr, { [URI]: base() })[URI]!;
        const anchor = "define hero as character with";
        const offset = text.indexOf(anchor);
        const at = posAt(text, offset);
        const INSERT = "store colon_shift = 0\n";
        incr.updateDocument({
          textDocument: { uri: URI, version: AFTER_WARM },
          contentChanges: [{ range: { start: at, end: at }, text: INSERT }],
        });
        const after = text.slice(0, offset) + INSERT + text.slice(offset);
        outcome = { incr: pick(incr.compile({ textDocument: { uri: URI } }).program), cold: coldCompile(after), after };
        return outcome;
      } finally {
        console.warn = realWarn;
        console.error = realError;
      }
    };

    it("the cold compile spans the call's receiver and member", () => {
      const { cold, after } = outcomeOf();
      const found = warnings(cold, after);
      expect(found).toHaveLength(1);
      const { range, line } = found[0]!;
      expect(range.start.line).toBe(range.end.line);
      expect(line).toBe(CALL);
      expect(line?.slice(range.start.character, range.end.character)).toBe("table:nogetn");
    });

    it("incremental == cold diagnostics", () => {
      const { incr, cold } = outcomeOf();
      expect(stable(incr.diagnostics)).toBe(stable(cold.diagnostics));
    });
  });

  describe("across the project's scripts", () => {
    const CHAPTER_URI = "inmemory:///chapter.sd";
    const SIDE_URI = "inmemory:///side.sd";
    const project = () => ({
      [URI]: coupledScreenplay(),
      [CHAPTER_URI]: includedChapter().replace(`${constructMarkers("ch_")["tag line"]}\n\n`, ""),
      [SIDE_URI]: "scene side_one\n  Side line.\nend\n",
    });
    const chapterExcept = (...left: Construct[]) => except("tag line", ...left);
    const coldProject = (texts: Record<string, string>) => {
      const c = new SparkdownCompiler();
      c.configure({ files: filesOf(texts) });
      return pick(c.compile({ textDocument: { uri: URI } }).program);
    };

    const projectEdits: (Edit & {
      uri: string;
      bugs: string;
      carries: Construct[];
      otherCarries: Construct[];
    })[] = [
      {
        name: "edit a line of dialogue in the main script",
        bugs: "#404",
        uri: URI,
        find: "Line one of dialogue in scene 0.",
        replace: "Line one of dialogue in scene 0, changed.",
        carries: ALL_CONSTRUCTS,
        otherCarries: chapterExcept(),
      },
      {
        name: "edit a line at the top of the chapter script",
        bugs: "#404, #872",
        uri: CHAPTER_URI,
        find: "Chapter line 0.",
        replace: "Chapter line 0, changed.",
        carries: chapterExcept(),
        otherCarries: ALL_CONSTRUCTS,
      },
      {
        name: "declare the chapter closure's callee at the top of the chapter script",
        bugs: "#935",
        uri: CHAPTER_URI,
        find: "scene chapter_0",
        replace: "function ch_later()\n  return 7\nend\n\nscene chapter_0",
        carries: chapterExcept("function with assignments, loops and a closure"),
        otherCarries: ALL_CONSTRUCTS,
      },
      {
        name: "declare the chapter closure's callee in the main script",
        bugs: "#935",
        uri: URI,
        find: "define hero as character with",
        replace: "function ch_later()\n  return 7\nend\n\ndefine hero as character with",
        carries: ALL_CONSTRUCTS,
        otherCarries: chapterExcept("function with assignments, loops and a closure"),
      },
      {
        name: "insert a define the chapter store is named after, in the main script",
        bugs: "#936",
        uri: URI,
        find: "define hero as character with",
        replace: "define ch_thing with\n  x = 1\nend\n\ndefine ch_sidekick as ch_thing with\n  x = 2\nend\n\ndefine hero as character with",
        carries: ALL_CONSTRUCTS,
        otherCarries: chapterExcept("store named after an edit's define"),
      },
    ];

    const markersOf = (uri: string) => {
      if (uri === URI) return constructMarkers();
      const { "tag line": _, ...markers } = constructMarkers("ch_");
      return markers;
    };

    for (const edit of projectEdits) {
      it(`incremental == cold for edit: ${edit.name} (${edit.bugs})`, () => {
        const realWarn = console.warn;
        const realError = console.error;
        console.warn = () => {};
        console.error = () => {};
        try {
          const incr = new SparkdownCompiler();
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
          const flows = JSON.stringify(incrProg.chunks);
          expect(flows).toContain("chapter_0");
          expect(flows).toContain("side_one");
          expect(stable(incrProg)).toBe(stable(coldProject(after)));
          expect(carriedConstructs(incr, edit.uri, editedBefore), "edited script").toEqual(
            expect.arrayContaining(edit.carries),
          );
          expect(carriedConstructs(incr, other, otherBefore), "other script").toEqual(
            expect.arrayContaining(edit.otherCarries),
          );
        } finally {
          console.warn = realWarn;
          console.error = realError;
        }
      });
    }
  });

  it("incremental == cold under randomized structural edits (fuzz, full surface)", () => {
    const realWarn = console.warn;
    const realError = console.error;
    console.warn = () => {};
    console.error = () => {};
    try {
      const base = warmText(coupledScreenplay());
      const failures: string[] = [];
      let seed = 0x2f6e2b1;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      const inserts = ["x", "\n", " ", "1", "}", "{", "{trust}", "// c", "->", "end", ")", "", "# t", "then", ":add(1)", " += 1", "{t.a}", "function() return 1 end", "\ndefine thing with\n"];
      for (let n = 0; n < 120; n++) {
        const insert = inserts[Math.floor(rand() * inserts.length)]!;
        const delLen = rand() < 0.4 ? Math.min(1 + Math.floor(rand() * 8), 14) : 0;
        if (insert === "" && delLen === 0) continue;
        const offset = Math.floor(rand() * base.length);
        const start = posAt(base, offset);
        const end = posAt(base, Math.min(offset + delLen, base.length));
        const after = base.slice(0, offset) + insert + base.slice(offset + delLen);

        const incr = new SparkdownCompiler();
        warmed(incr, { [URI]: coupledScreenplay() });
        incr.updateDocument({
          textDocument: { uri: URI, version: AFTER_WARM },
          contentChanges: [{ range: { start, end }, text: insert }],
        });
        const incrProg = pick(incr.compile({ textDocument: { uri: URI } }).program);
        const coldProg = coldCompile(after);
        const diverged = (Object.keys(coldProg) as (keyof typeof coldProg)[]).filter(
          (f) => stable(incrProg[f]) !== stable(coldProg[f]),
        );
        if (diverged.length) {
          failures.push(`#${n} insert=${JSON.stringify(insert)} del=${delLen} @${offset} fields={${diverged.join(",")}}`);
        }
      }
      expect(failures, `incremental-vs-cold divergences:\n${failures.join("\n")}`).toEqual([]);
    } finally {
      console.warn = realWarn;
      console.error = realError;
    }
  });
});
