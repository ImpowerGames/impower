// A preview compile puts the script back by restoring the parse it saved
// (#652), so it reparses once rather than twice.
//
// The tree, its fragments and each annotator's ranges are persistent values:
// the edit builds new ones and leaves the old ones intact, so the registry can
// hand them back afterwards in constant time. These tests pin the saving: one
// incremental parse per preview, the same objects back in the registry, the
// same program out of the next real compile as a cold compile of the same
// text, and a restore even when the compile throws.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "inmemory:///main.sd";

function screenplay(scenes = 8): string {
  const L: string[] = [];
  L.push("title: Preview Restore");
  L.push("");
  L.push("define hero as character:");
  L.push(`  name = "Hero"`);
  L.push(`  color = "#3366cc"`);
  L.push("");
  L.push("define cfg as object:");
  L.push("  speed = 5");
  L.push("");
  L.push("store trust = 0");
  L.push("");
  L.push("function bonus(x):");
  L.push("  return x * 2 + 1");
  L.push("");
  for (let s = 0; s < scenes; s++) {
    L.push(`scene scene_${s}`);
    L.push(`= INT. ROOM ${s} - DAY`);
    L.push(":");
    L.push(`  Action describing room ${s} in some detail here.`);
    L.push(`hero:`);
    L.push(`  Line one of dialogue in scene ${s}.`);
    L.push(`  Speed is {cfg.speed} and trust is {trust}.`);
    L.push("if trust > 2 then");
    L.push(`  hero: I trust you in scene ${s}.`);
    L.push("else");
    L.push(`  hero: Not yet in scene ${s}.`);
    L.push("end");
    L.push(`& trust = bonus(trust)`);
    L.push(`-> scene_${(s + 1) % scenes}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

const FIELDS = [
  "compiled",
  "pathLocations",
  "dataLocations",
  "functionLocations",
  "sceneLocations",
  "knotLocations",
  "stitchLocations",
  "branchLocations",
  "labelLocations",
  "context",
  "diagnostics",
  "ui",
] as const;

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

function fieldSig(program: any): Record<string, string> {
  const sig: Record<string, string> = {};
  for (const f of FIELDS) sig[f] = stable(program[f]);
  sig["pathLocationsOrder"] = JSON.stringify(
    Object.keys(program.pathLocations ?? {}),
  );
  sig["dataLocationsOrder"] = JSON.stringify(
    Object.keys(program.dataLocations ?? {}),
  );
  return sig;
}

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

function compilerFor(text: string, version = 1) {
  const c = new SparkdownCompiler();
  c.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return c;
}

function coldProgram(text: string) {
  return quiet(
    () => compilerFor(text).compile({ textDocument: { uri: URI } }).program,
  );
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

/** A minimal-range change turning the first `find` in `text` into `replace`. */
function change(text: string, find: string, replace: string) {
  const offset = text.indexOf(find);
  expect(offset, `"${find}" is in the text`).toBeGreaterThanOrEqual(0);
  return {
    contentChanges: [
      {
        range: {
          start: posAt(text, offset),
          end: posAt(text, offset + find.length),
        },
        text: replace,
      },
    ],
    after: text.slice(0, offset) + replace + text.slice(offset + find.length),
  };
}

const previewOf = (c: SparkdownCompiler, version: number, contentChanges: any[]) =>
  quiet(() =>
    c.previewCompile({
      root: { uri: URI },
      textDocument: { uri: URI, version },
      contentChanges,
    } as never),
  );

/** The registry's per-document parse state, which the restore puts back. */
function parseState(c: SparkdownCompiler) {
  const registry = c.documents as any;
  return registry._documentStates.get(URI);
}

/** Counts calls into the grammar parser for the duration of `fn`. */
function countingParses<T>(c: SparkdownCompiler, fn: () => T): [T, number] {
  const parser = (c.documents as any).parser;
  const real = parser.parse.bind(parser);
  let calls = 0;
  parser.parse = (...args: any[]) => {
    calls += 1;
    return real(...args);
  };
  try {
    return [fn(), calls];
  } finally {
    parser.parse = real;
  }
}

describe("a preview compile", () => {
  it("parses the edit once instead of parsing its inverse back", () => {
    const base = screenplay();
    const c = compilerFor(base);
    quiet(() => c.compile({ textDocument: { uri: URI } }));
    const { contentChanges } = change(base, "speed = 5", "speed = 9");

    const [preview, parses] = countingParses(c, () =>
      previewOf(c, 1, contentChanges),
    );

    expect(preview.outdated).toBeUndefined();
    expect(parses).toBe(1);
  });

  it("leaves the registry's tree, fragments and annotations as the same objects", () => {
    const base = screenplay();
    const c = compilerFor(base);
    quiet(() => c.compile({ textDocument: { uri: URI } }));
    const before = parseState(c);
    const tree = before.tree;
    const fragments = before.treeFragments;
    const treeVersion = before.treeVersion;
    const annotations = c.documents.annotations(URI) as Record<string, unknown>;
    expect(tree).toBeTruthy();

    previewOf(c, 1, change(base, "speed = 5", "speed = 9").contentChanges);

    const after = parseState(c);
    // Compared as booleans: a failing `toBe` on a tree or a range set prints
    // the whole structure and exhausts the test process's heap.
    expect(after.tree === tree, "same tree").toBe(true);
    expect(after.treeFragments === fragments, "same fragments").toBe(true);
    expect(after.treeVersion).toBe(treeVersion);
    const afterAnnotations = c.documents.annotations(URI) as Record<
      string,
      unknown
    >;
    for (const key of Object.keys(annotations)) {
      expect(
        afterAnnotations[key] === annotations[key],
        `same ${key} annotations`,
      ).toBe(true);
    }
    expect(c.documents.get(URI)!.getText()).toBe(base);
    expect(c.documents.get(URI)!.version).toBe(1);
  });

  it("restores the registry when the compile throws", () => {
    const base = screenplay();
    const c = compilerFor(base);
    quiet(() => c.compile({ textDocument: { uri: URI } }));
    const before = parseState(c);
    const tree = before.tree;
    const fragments = before.treeFragments;
    const annotations = c.documents.annotations(URI) as Record<string, unknown>;

    const real = (c as any).compileStory.bind(c);
    (c as any).compileStory = () => {
      throw new Error("compile failed");
    };
    try {
      expect(() =>
        previewOf(c, 1, change(base, "speed = 5", "speed = 9").contentChanges),
      ).toThrow("compile failed");
    } finally {
      (c as any).compileStory = real;
    }

    const after = parseState(c);
    expect(after.tree === tree, "same tree").toBe(true);
    expect(after.treeFragments === fragments, "same fragments").toBe(true);
    expect(c.documents.get(URI)!.getText()).toBe(base);
    expect(c.documents.get(URI)!.version).toBe(1);
    const afterAnnotations = c.documents.annotations(URI) as Record<
      string,
      unknown
    >;
    for (const key of Object.keys(annotations)) {
      expect(
        afterAnnotations[key] === annotations[key],
        `same ${key} annotations`,
      ).toBe(true);
    }
    // The document is intact, so an ordinary compile still answers for it.
    const recompiled = quiet(() => c.compile({ textDocument: { uri: URI } }));
    expect(fieldSig(recompiled.program)).toEqual(fieldSig(coldProgram(base)));
  });

  it("is followed by a real edit elsewhere that compiles to the cold program", () => {
    const base = screenplay();
    const c = compilerFor(base);
    quiet(() => c.compile({ textDocument: { uri: URI } }));

    previewOf(
      c,
      1,
      change(base, "Line one of dialogue in scene 2.", "Line one changed.")
        .contentChanges,
    );

    const typed = change(base, "Action describing room 5", "Action in room 5");
    quiet(() =>
      c.updateDocument({
        textDocument: { uri: URI, version: 2 },
        contentChanges: typed.contentChanges,
      } as never),
    );
    const incremental = quiet(() =>
      c.compile({ textDocument: { uri: URI } }),
    ).program;

    expect(c.documents.get(URI)!.getText()).toBe(typed.after);
    expect(fieldSig(incremental)).toEqual(fieldSig(coldProgram(typed.after)));
  });

  it("interleaved with random edits never changes the cumulative program", () => {
    quiet(() => {
      let text = screenplay(10);
      const c = compilerFor(text);
      c.compile({ textDocument: { uri: URI } });

      // Deterministic LCG (no Math.random) so the fuzz is reproducible.
      let seed = 0x9e37a;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      const inserts = [
        "x",
        "\n",
        " ",
        "1",
        "}",
        "{",
        "{trust}",
        "// c",
        "->",
        "end",
        ")",
        "{scene_2}",
        "hero:",
        "-> scene_5",
        "\n& f = function() return 9 end\n",
      ];

      let version = 1;
      const failures: string[] = [];
      const EDITS = 60;
      for (let n = 0; n < EDITS; n++) {
        const insert = inserts[Math.floor(rand() * inserts.length)]!;
        const delLen = rand() < 0.4 ? Math.min(1 + Math.floor(rand() * 10), 16) : 0;
        const offset = Math.floor(rand() * text.length);
        // A preview of an edit that is never applied, at an unrelated offset.
        const previewOffset = Math.floor(rand() * text.length);
        const preview = previewOf(c, version, [
          {
            range: {
              start: posAt(text, previewOffset),
              end: posAt(text, previewOffset),
            },
            text: inserts[Math.floor(rand() * inserts.length)]!,
          },
        ]);
        if (preview.outdated) {
          failures.push(`#${n} preview refused at version ${version}`);
        }
        version += 1;
        c.updateDocument({
          textDocument: { uri: URI, version },
          contentChanges: [
            {
              range: {
                start: posAt(text, offset),
                end: posAt(text, Math.min(offset + delLen, text.length)),
              },
              text: insert,
            },
          ],
        } as never);
        text = text.slice(0, offset) + insert + text.slice(offset + delLen);
        const incrSig = fieldSig(
          c.compile({ textDocument: { uri: URI } }).program,
        );
        const coldSig = fieldSig(coldProgram(text));
        const diverged = Object.keys(incrSig).filter(
          (f) => incrSig[f] !== coldSig[f],
        );
        if (diverged.length) {
          failures.push(
            `#${n} insert=${JSON.stringify(insert)} del=${delLen} @${offset} fields={${diverged.join(",")}}`,
          );
        }
      }
      expect(
        failures,
        `divergences with preview compiles interleaved:\n${failures.join("\n")}`,
      ).toEqual([]);
    });
  });
});
