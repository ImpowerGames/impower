// Preview compiles (#634): the program an autocomplete suggestion would
// produce, compiled without applying the suggestion.
//
// The preview shows what accepting would show, so a preview compile has to be
// the program an ordinary compile of the edited text produces, byte for byte.
// And it must leave nothing of the hypothetical text behind: the document, its
// version, the verdict on whether the real program is outdated, and the next
// real compile are all exactly what they would have been without it.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { invertContentChanges } from "../../compiler/utils/invertContentChanges";

const URI = "inmemory:///main.sd";

function screenplay(): string {
  const L: string[] = [];
  L.push("define hero as character:");
  L.push(`  name = "Hero"`);
  L.push(`  color = "#3366cc"`);
  L.push("");
  L.push("define cfg as object:");
  L.push("  speed = 5");
  L.push("");
  L.push("store trust = 0");
  L.push("");
  for (let s = 0; s < 6; s++) {
    L.push(`scene scene_${s}`);
    L.push(`= INT. ROOM ${s} - DAY`);
    L.push(":");
    L.push(`  Action describing room ${s}.`);
    L.push(`hero:`);
    L.push(`  Line one of dialogue in scene ${s}.`);
    L.push(`  Speed is {cfg.speed} and trust is {trust}.`);
    L.push(`-> scene_${(s + 1) % 6}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
}

const pick = (p: any) => ({
  compiled: p.compiled,
  pathLocations: p.pathLocations,
  pathLocationsOrder: p.pathLocations?.paths ?? [],
  dataLocations: p.dataLocations,
  functionLocations: p.functionLocations,
  sceneLocations: p.sceneLocations,
  context: p.context,
  diagnostics: p.diagnostics,
  sceneAssets: p.sceneAssets,
});

function stable(value: unknown): string {
  const walk = (v: any): any => {
    if (v && typeof v === "object") {
      if (Array.isArray(v)) return v.map(walk);
      const out: Record<string, any> = {};
      for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
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
      { uri: URI, type: "script", name: "main", ext: "sd", text, version, languageId: "sparkdown" },
    ],
  } as never);
  return c;
}

const cold = (text: string) =>
  stable(pick(quiet(() => compilerFor(text).compile({ textDocument: { uri: URI } })).program));

const posAt = (text: string, offset: number) => {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length - 1, character: before.at(-1)!.length };
};

/** A minimal-range change turning the first `find` in `text` into `replace`. */
function change(text: string, find: string, replace: string) {
  const offset = text.indexOf(find);
  expect(offset, `"${find}" is in the text`).toBeGreaterThanOrEqual(0);
  return {
    contentChanges: [
      {
        range: { start: posAt(text, offset), end: posAt(text, offset + find.length) },
        text: replace,
      },
    ],
    after: text.slice(0, offset) + replace + text.slice(offset + find.length),
  };
}

const EDITS = [
  { name: "a word in dialogue", find: "Line one of dialogue in scene 2.", replace: "Line one of dialogue in scene 2, changed." },
  { name: "a definition's value", find: "speed = 5", replace: "speed = 9" },
  { name: "a multiline insertion", find: "  Action describing room 3.", replace: "  Action describing room 3.\n  Another action line.\n  And one more." },
  { name: "a divert target", find: "-> scene_4", replace: "-> scene_1" },
  { name: "text that does not compile", find: "-> scene_5", replace: "-> " },
];

const previewOf = (
  c: SparkdownCompiler,
  version: number,
  contentChanges: any[],
  line = 0,
) =>
  quiet(() =>
    c.previewCompile({
      root: { uri: URI },
      textDocument: { uri: URI, version },
      contentChanges,
      startFrom: { file: URI, line },
    }),
  );

describe("a preview compile", () => {
  for (const edit of EDITS) {
    it(`is the ordinary compile of the edited text (${edit.name})`, () => {
      const base = screenplay();
      const c = compilerFor(base);
      quiet(() => c.compile({ textDocument: { uri: URI } }));
      const { contentChanges, after } = change(base, edit.find, edit.replace);

      const preview = previewOf(c, 1, contentChanges);

      expect(preview.outdated).toBeUndefined();
      expect(stable(pick(preview.program))).toBe(cold(after));
    });
  }

  it("leaves the document, its version and the next real compile as they were", () => {
    const base = screenplay();
    const c = compilerFor(base);
    const before = stable(pick(quiet(() => c.compile({ textDocument: { uri: URI } })).program));
    const outdatedBefore = c.isProgramOutdated();

    for (const edit of EDITS) {
      previewOf(c, 1, change(base, edit.find, edit.replace).contentChanges);
    }

    expect(c.documents.get(URI)!.getText()).toBe(base);
    expect(c.documents.get(URI)!.version).toBe(1);
    expect(c.isProgramOutdated()).toBe(outdatedBefore);
    const next = quiet(() => c.compile({ textDocument: { uri: URI } }));
    expect(stable(pick(next.program))).toBe(before);
    expect(next.program.scripts[URI]).toBe(1);
  });

  it("follows the real document through edits made between suggestions", () => {
    const base = screenplay();
    const c = compilerFor(base);
    quiet(() => c.compile({ textDocument: { uri: URI } }));
    const typed = change(base, "Action describing room 1.", "Action describing room 1!");
    c.updateDocument({ textDocument: { uri: URI, version: 2 }, contentChanges: typed.contentChanges } as never);

    const suggestion = change(typed.after, "speed = 5", "speed = 7");
    const preview = previewOf(c, 2, suggestion.contentChanges);

    expect(stable(pick(preview.program))).toBe(cold(suggestion.after));
    expect(c.documents.get(URI)!.getText()).toBe(typed.after);
    // The real edit is still waiting for its own compile.
    expect(c.isProgramOutdated()).toBe(true);
  });

  it("refuses an edit made against a version the document has left", () => {
    const base = screenplay();
    const c = compilerFor(base);
    quiet(() => c.compile({ textDocument: { uri: URI } }));
    const { contentChanges } = change(base, "speed = 5", "speed = 9");

    const preview = previewOf(c, 7, contentChanges);

    expect(preview).toMatchObject({ outdated: true });
    expect(preview.program).toBeUndefined();
    expect(c.documents.get(URI)!.getText()).toBe(base);
  });

  it("is announced to preview listeners only, with the runtime story", () => {
    const base = screenplay();
    const c = compilerFor(base);
    quiet(() => c.compile({ textDocument: { uri: URI } }));
    const compiled: unknown[] = [];
    const previewed: any[] = [];
    c.addEventListener("compiler/didCompile", (p) => compiled.push(p));
    c.addEventListener("compiler/didPreviewCompile", (p) => {
      previewed.push(p);
      p.checkpoint = "from the listener";
    });

    const preview = previewOf(c, 1, change(base, "speed = 5", "speed = 9").contentChanges, 12);

    expect(compiled).toEqual([]);
    expect(previewed).toHaveLength(1);
    expect(previewed[0].story).toBeTruthy();
    expect(previewed[0].startFrom).toEqual({ file: URI, line: 12 });
    expect(preview.checkpoint).toBe("from the listener");
  });

  it("is followed by a real compile before the next selection is routed", () => {
    // The listeners route a selection against the runtime story the last
    // compile left, and a preview compile took over that story's unchanged
    // flows. With no real edit pending, nothing else would recompile.
    const base = screenplay();
    const c = compilerFor(base);
    const real = stable(pick(quiet(() => c.compile({ textDocument: { uri: URI } })).program));
    previewOf(c, 1, change(base, "speed = 5", "speed = 9").contentChanges);
    const recompiled: any[] = [];
    c.addEventListener("compiler/didCompile", (p) => recompiled.push(p));

    const selected = quiet(() =>
      c.selectDocument({
        textDocument: { uri: URI },
        selectedRange: { start: { line: 12, character: 0 }, end: { line: 12, character: 0 } },
        docChanged: false,
        userEvent: true,
      }),
    );

    expect(recompiled).toHaveLength(1);
    expect(stable(pick(recompiled[0].program))).toBe(real);
    expect(selected.programOutdated).toBe(false);

    // Once restored, a further selection needs no compile.
    quiet(() =>
      c.selectDocument({
        textDocument: { uri: URI },
        selectedRange: { start: { line: 13, character: 0 }, end: { line: 13, character: 0 } },
        docChanged: false,
        userEvent: true,
      }),
    );
    expect(recompiled).toHaveLength(1);
  });
});

describe("the changes that undo an edit", () => {
  const apply = (text: string, changes: any[]) => {
    for (const c of changes) {
      if (!("range" in c)) {
        text = c.text;
        continue;
      }
      const lines = text.split("\n");
      const offset = (p: { line: number; character: number }) =>
        lines.slice(0, p.line).reduce((n, l) => n + l.length + 1, 0) + p.character;
      text = text.slice(0, offset(c.range.start)) + c.text + text.slice(offset(c.range.end));
    }
    return text;
  };

  it("restore the text after sequential, multiline and whole-document changes", () => {
    const text = "one\ntwo\nthree\n";
    const changes = [
      { range: { start: { line: 1, character: 0 }, end: { line: 1, character: 3 } }, text: "TWO\nAND A HALF" },
      { range: { start: { line: 0, character: 3 }, end: { line: 0, character: 3 } }, text: "!" },
      { range: { start: { line: 3, character: 0 }, end: { line: 3, character: 5 } }, text: "" },
    ];
    const edited = apply(text, changes);
    expect(edited).toBe("one!\nTWO\nAND A HALF\n\n");
    expect(apply(edited, invertContentChanges(text, changes))).toBe(text);

    const whole = [{ text: "replaced" }];
    expect(apply(apply(text, whole), invertContentChanges(text, whole))).toBe(text);
  });

  it("measure inserted line breaks as the registry stores them", () => {
    const text = "a\nb\n";
    const changes = [
      { range: { start: { line: 0, character: 1 }, end: { line: 0, character: 1 } }, text: "x\r\ny" },
    ];
    const edited = apply(text, [{ ...changes[0], text: "x\ny" }]);
    expect(apply(edited, invertContentChanges(text, changes))).toBe(text);
  });
});
