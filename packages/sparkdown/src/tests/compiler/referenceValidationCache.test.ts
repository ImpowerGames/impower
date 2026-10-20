// #411: `validateReferences` keeps each chunk's validated references while the
// chunk's block is carried by the incremental parse, so an edit validates only
// the references of the chunks it changed. What a reference's validity reads
// besides itself is story-wide: the context (the project's defines, its files
// and the implicit definitions scene content implies), the functions a handler
// can name, the types a define declares as parents and the elements a layout
// declares. An edit to any of those in another chunk has to reach a chunk the
// cache would otherwise serve, so each case below compares the diagnostics of
// the incremental compile with a cold compile of the same text.
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import {
  ReferenceValidationCache,
  type ReferenceValidationInputs,
} from "../../compiler/utils/ReferenceValidationCache";

const URI = "file:///main.sd";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg"><g data-name="face.happy:default" id="happy"/><g data-name="face.sad" id="sad"/></svg>`;

const svgImage = (name: string) => ({
  uri: `file:///${name}.svg`,
  type: "image",
  name,
  ext: "svg",
  data: SVG,
});

const pngImage = (name: string) => ({
  uri: `file:///${name}.png`,
  type: "image",
  name,
  ext: "png",
  src: `/file:/local/${name}.png`,
});

const SCENES = 8;

/** Scenes that each hold references, two of which never resolve, so every
 *  scene reports warnings whose ranges an edit above them moves. */
function screenplay(): string {
  const L: string[] = [];
  L.push("define pace as config with");
  L.push("  speed = 5");
  L.push("end");
  L.push("");
  L.push("layout hud with");
  L.push("  column {");
  L.push('    button "Go" @click=go_on');
  L.push("  }");
  L.push("end");
  L.push("");
  // Each scene's body is indented under its header, so a scene is one
  // top-level chunk, as a scene of the Raffles and Bunny project is.
  for (let s = 0; s < SCENES; s++) {
    L.push(`scene scene_${s}`);
    L.push(`  Action describing room ${s}.`);
    L.push(`  [[show backdrop missing_${s}]]`);
    L.push(`  [[show portrait mia]]`);
    L.push(`  [[show backdrop rex]]`);
    L.push(`  [[show weather mia]]`);
    L.push(`  [[mia:happy]]`);
    L.push(`  [[show backdrop mia~sad]]`);
    L.push("  hero:");
    L.push(`    Line one of dialogue in scene ${s}.`);
    L.push(`    Speed is {pace.speed}.`);
    L.push(`  [[show backdrop late_${s}]]`);
    L.push(`  -> scene_${(s + 1) % SCENES}`);
    L.push("end");
    L.push("");
  }
  return L.join("\n");
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

function compilerFor(text: string, files: object[] = [svgImage("mia")]) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
      ...files,
    ],
  } as never);
  return compiler;
}

const posAt = (text: string, offset: number) => {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length - 1, character: before.at(-1)!.length };
};

const change = (text: string, find: string, replace: string) => {
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
};

/** Apply a minimal-range edit turning the first `find` into `replace`. */
function edit(
  compiler: SparkdownCompiler,
  text: string,
  find: string,
  replace: string,
  version: number,
): string {
  const { contentChanges, after } = change(text, find, replace);
  compiler.updateDocument({
    textDocument: { uri: URI, version },
    contentChanges,
  } as never);
  return after;
}

const compile = (compiler: SparkdownCompiler) =>
  quiet(() => compiler.compile({ textDocument: { uri: URI } })).program;

const stats = (compiler: SparkdownCompiler) => compiler.referenceValidationStats;

const message = (d: any): string =>
  typeof d?.message === "string" ? d.message : (d?.message?.value ?? "");

/** Every diagnostic, in order, with its range and message. */
const diagnostics = (program: ReturnType<typeof compile>) =>
  Object.keys(program.diagnostics ?? {})
    .sort()
    .flatMap((uri) =>
      (program.diagnostics![uri] ?? []).map(
        (d) =>
          `${uri} ${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${d.severity} ${message(d)}`,
      ),
    );

const coldDiagnostics = (text: string, files?: object[]) =>
  diagnostics(compile(compilerFor(text, files)));

const missing = (program: ReturnType<typeof compile>, name: string) =>
  diagnostics(program).filter((d) => d.includes(`named \`${name}\``)).length;

const mentions = (program: ReturnType<typeof compile>, name: string) =>
  diagnostics(program).filter((d) => d.includes(`\`${name}\``)).length;

describe("reference validation per chunk (#411)", () => {
  it("validates only the references of the chunk an edit changed", () => {
    const text = screenplay();
    const compiler = compilerFor(text);
    compile(compiler);
    const cold = { ...stats(compiler) };
    expect(cold.validated).toBeGreaterThan(SCENES * 6);
    expect(cold.chunksServed).toBe(0);
    // The first incremental parse inside a block parses all of it again and
    // marks where a later one can start (`Compiler.reparseRange`), so every
    // reference in it is annotated anew; the language server meets it once
    // per block, on the first keystroke there. An edit reparses only up to
    // the next line between top-level constructs (#1637), so the warming
    // edit spans the line before the dialogue block and the block's first
    // line, which the edit below restarts from.
    const warmed = edit(
      compiler,
      text,
      "mia~sad]]\n  hero:\n    Line one of dialogue in scene 2.",
      "mia~sad]]\n  hero:\n    Line one of dialogue in scene 2!",
      2,
    );
    compile(compiler);

    // A new line in scene 2 moves every chunk below it.
    const after = edit(
      compiler,
      warmed,
      "Line one of dialogue in scene 2!",
      "Line one of dialogue in scene 2!\n    And another line.",
      3,
    );
    const program = compile(compiler);
    const warm = stats(compiler);
    // Only scene 2's references are validated again: a scene holds a ninth of
    // them at most.
    expect(warm.validated).toBeGreaterThan(0);
    expect(warm.validated).toBeLessThanOrEqual(Math.ceil(cold.validated / SCENES));
    expect(warm.chunksValidated).toBeLessThan(warm.chunksServed);
    expect(warm.chunksServed).toBeGreaterThanOrEqual(SCENES - 1);
    // The edited chunk's own references outside the edit keep their outcomes.
    expect(warm.reused).toBeGreaterThan(warm.validated);
    // The served chunks' warnings stand where their references moved to.
    expect(missing(program, "missing_7")).toBe(1);
    expect(diagnostics(program)).toEqual(coldDiagnostics(after));
  });

  it("validates the reference an edit changes in a chunk whose others it reuses", () => {
    const text = screenplay();
    const compiler = compilerFor(text);
    compile(compiler);
    // Warmed in the dialogue block above the edit, which the edit's reparse
    // restarts in: an edit to the scene's first line no longer reparses the
    // rest of the scene (see the first case).
    const warm = edit(compiler, text, "scene 3.\n    Speed is {pace.speed}.", "scene 3.\n    Speed is {pace.speed}!", 2);
    compile(compiler);

    const after = edit(compiler, warm, "late_3", "mia", 3);
    const program = compile(compiler);
    expect(stats(compiler).validated).toBeGreaterThanOrEqual(1);
    expect(stats(compiler).reused).toBeGreaterThan(0);
    expect(missing(program, "late_3")).toBe(0);
    expect(diagnostics(program)).toEqual(coldDiagnostics(after));

    const restored = edit(compiler, after, "[[show backdrop mia]]", "[[show backdrop late_3]]", 4);
    const again = compile(compiler);
    expect(stats(compiler).reused).toBeGreaterThan(0);
    expect(missing(again, "late_3")).toBe(1);
    expect(diagnostics(again)).toEqual(coldDiagnostics(restored));
  });

  it("validates every reference again when an asset is added or removed", () => {
    const text = screenplay();
    const compiler = compilerFor(text);
    const first = compile(compiler);
    expect(missing(first, "rex")).toBe(SCENES);

    compiler.addFile({ file: pngImage("rex") } as never);
    const added = compile(compiler);
    expect(stats(compiler).chunksServed).toBe(0);
    expect(missing(added, "rex")).toBe(0);
    expect(diagnostics(added)).toEqual(
      coldDiagnostics(text, [svgImage("mia"), pngImage("rex")]),
    );

    compiler.removeFile({ file: { uri: pngImage("rex").uri } } as never);
    const removed = compile(compiler);
    expect(stats(compiler).chunksServed).toBe(0);
    expect(missing(removed, "rex")).toBe(SCENES);
    expect(diagnostics(removed)).toEqual(coldDiagnostics(text));
  });

  it.each([
    {
      name: "a define another chunk declares",
      find: "define pace as config with",
      replace:
        'define rex as image with\n  src = "https://example.com/rex.png"\nend\n\ndefine pace as config with',
      reaches: "rex",
    },
    {
      name: "an element another chunk's layout declares",
      find: "  column {",
      replace: "  column {\n    weather",
      reaches: "weather",
    },
    {
      name: "a function another chunk declares for a handler",
      find: "define pace as config with",
      replace: "function go_on()\nend\n\ndefine pace as config with",
      reaches: "go_on",
    },
  ])("reaches a kept chunk through $name", ({ find, replace, reaches }) => {
    const text = screenplay();
    const compiler = compilerFor(text);
    compile(compiler);
    // A warm compile first, so every chunk is in the cache.
    const warm = edit(compiler, text, "room 0.", "room 0!", 2);
    const before = compile(compiler);
    expect(stats(compiler).chunksServed).toBeGreaterThanOrEqual(SCENES - 1);

    const after = edit(compiler, warm, find, replace, 3);
    const program = compile(compiler);
    expect(diagnostics(program)).toEqual(coldDiagnostics(after));
    // The edit changes what the scenes it did not touch report.
    expect(mentions(program, reaches)).toBeLessThan(mentions(before, reaches));

    // And back again.
    const restored = edit(compiler, after, replace, find, 4);
    expect(diagnostics(compile(compiler))).toEqual(coldDiagnostics(restored));
  });

  it("keeps the chunks that read nothing a directive's implicit definition changes", () => {
    // A directive implies a filtered image in the context's layer, which an
    // edit to it changes. Only a chunk that looked that entry up is validated
    // again; an image reference implies its own entry, so the edited chunk is
    // the one that reads it here.
    const text = screenplay();
    const compiler = compilerFor(text);
    compile(compiler);
    const warm = edit(compiler, text, "room 0.", "room 0!", 2);
    const before = compile(compiler);

    const after = edit(
      compiler,
      warm,
      "[[mia:happy]]\n  [[show backdrop mia~sad]]\n  hero:\n    Line one of dialogue in scene 6.",
      "[[mia:wink]]\n  [[show backdrop mia~sad]]\n  hero:\n    Line one of dialogue in scene 6.",
      3,
    );
    const program = compile(compiler);
    expect(program.contextRevision).not.toBe(before.contextRevision);
    expect(program.context?.["filtered_image"]?.["mia~wink"]).toBeDefined();
    expect(stats(compiler).chunksServed).toBeGreaterThanOrEqual(SCENES - 1);
    expect(diagnostics(program)).toEqual(coldDiagnostics(after));
  });

  it("validates the same references after a preview compile as without one", () => {
    const text = screenplay();
    const run = (preview: boolean) => {
      const compiler = compilerFor(text);
      compile(compiler);
      let current = edit(compiler, text, "room 0.", "room 0!", 2);
      compile(compiler);
      if (preview) {
        // A preview that adds the define every scene's `rex` reference reads,
        // and moves every chunk below the first.
        const { contentChanges } = change(
          current,
          "define pace as config with",
          'define rex as image with\n  src = "https://example.com/rex.png"\nend\n\ndefine pace as config with',
        );
        const previewed = quiet(() =>
          compiler.previewCompile({
            root: { uri: URI },
            textDocument: { uri: URI, version: 2 },
            contentChanges,
            startFrom: { file: URI, line: 0 },
          } as never),
        );
        expect(previewed.outdated).toBeFalsy();
        expect(missing(previewed.program!, "rex")).toBe(0);
      }
      current = edit(compiler, current, "room 4.", "room 4!", 3);
      const program = compile(compiler);
      return { stats: { ...stats(compiler) }, diagnostics: diagnostics(program), text: current };
    };
    const without = run(false);
    const withPreview = run(true);
    expect(withPreview.stats).toEqual(without.stats);
    expect(withPreview.diagnostics).toEqual(without.diagnostics);
    expect(withPreview.diagnostics).toEqual(coldDiagnostics(withPreview.text));
    expect(without.stats.chunksValidated).toBeLessThan(without.stats.chunksServed);
  });

  it("validates every reference again when the configured definitions change", () => {
    const text = screenplay();
    const compiler = compilerFor(text);
    compile(compiler);
    compile(compiler);
    compiler.configure({ definitions: { builtins: { mia: {} } } } as never);
    const program = compile(compiler);
    expect(stats(compiler).chunksServed).toBe(0);
    expect(stats(compiler).reused).toBe(0);
    const cold = compilerFor(text);
    cold.configure({ definitions: { builtins: { mia: {} } } } as never);
    expect(diagnostics(program)).toEqual(diagnostics(compile(cold)));
  });
});

// The cache's invalidation, driven directly: no Sparkdown construct today makes
// one chunk's reference depend on an implicit definition another chunk implies
// (an image reference implies its own), so the compiler cannot reach these
// paths through a script alone.
describe("ReferenceValidationCache (#411)", () => {
  const inputs = (
    overrides: Partial<ReferenceValidationInputs> = {},
  ): ReferenceValidationInputs => ({
    base: "root",
    baseIds: [],
    definitions: undefined,
    builtins: undefined,
    handlerCallables: "",
    declaredParentTypes: "",
    ...overrides,
  });
  const entry = (keys: string[], types: string[] = []) => ({
    length: 1,
    references: 1,
    outcomes: [],
    keys: new Set(keys),
    types: new Set(types),
  });

  it("drops a chunk and a reference that read a layer entry the layer changed, and keeps the rest", () => {
    const cache = new ReferenceValidationCache();
    const reads = { block: {}, annotation: {} };
    const other = { block: {}, annotation: {} };
    const whole = { block: {}, annotation: {} };
    cache.begin(inputs(), "r1", ["filtered_image/a~x"]);
    cache.keep("main", reads.block, entry(["filtered_image/b~y"]));
    cache.keepReference(reads.annotation, 1, [], { keys: new Set(["filtered_image/b~y"]) });
    cache.keep("main", other.block, entry(["image/c"]));
    cache.keepReference(other.annotation, 1, [], { keys: new Set(["image/c"]) });
    cache.keep("main", whole.block, entry([], ["filtered_image"]));
    cache.keepReference(whole.annotation, 1, [], { types: new Set(["filtered_image"]) });
    cache.end();

    // Another chunk's directive now implies `b~y`.
    cache.begin(inputs(), "r2", ["filtered_image/a~x", "filtered_image/b~y"]);
    expect(cache.take("main", reads.block)).toBeUndefined();
    expect(cache.reference(reads.annotation)).toBeUndefined();
    expect(cache.take("main", whole.block)).toBeUndefined();
    expect(cache.reference(whole.annotation)).toBeUndefined();
    expect(cache.take("main", other.block)).toBeDefined();
    expect(cache.reference(other.annotation)).toBeDefined();
  });

  it("drops everything when a story-wide input changes", () => {
    const cache = new ReferenceValidationCache();
    const block = {};
    const annotation = {};
    const ids = [{}];
    cache.begin(inputs({ baseIds: ids }), "r1", []);
    cache.keep("main", block, entry([]));
    cache.keepReference(annotation, 1, [], {});
    cache.end();
    // Each case changes exactly one input from the primed ones.
    const definitions = {};
    const builtins = {};
    const primed = () =>
      inputs({ baseIds: ids, definitions, builtins });
    for (const changed of [
      { ...primed(), baseIds: [{}] },
      { ...primed(), base: "other root" },
      { ...primed(), declaredParentTypes: "item" },
      { ...primed(), handlerCallables: "go_on" },
      { ...primed(), definitions: {} },
      { ...primed(), builtins: {} },
    ]) {
      cache.begin(primed(), "r1", []);
      cache.keep("main", block, entry([]));
      cache.keepReference(annotation, 1, [], {});
      cache.end();
      // Unchanged inputs keep both entries.
      cache.begin(primed(), "r1", []);
      expect(cache.take("main", block)).toBeDefined();
      expect(cache.reference(annotation)).toBeDefined();
      cache.end();
      cache.begin(changed, "r1", []);
      expect(cache.take("main", block)).toBeUndefined();
      expect(cache.reference(annotation)).toBeUndefined();
      cache.end();
    }
  });

  it("starts over after 32 layer changes and on a change to a `$` entry", () => {
    const cache = new ReferenceValidationCache();
    const annotation = {};
    cache.begin(inputs(), "r0", []);
    cache.keepReference(annotation, 1, [], { keys: new Set(["image/unrelated"]) });
    cache.end();
    for (let i = 1; i <= 32; i++) {
      cache.begin(inputs(), `r${i}`, [`filtered_image/n${i}`]);
      expect(cache.reference(annotation)).toBeDefined();
      cache.end();
    }
    cache.begin(inputs(), "r33", ["filtered_image/n33"]);
    expect(cache.reference(annotation)).toBeUndefined();
    cache.end();

    cache.keepReference(annotation, 1, [], { keys: new Set(["image/unrelated"]) });
    cache.begin(inputs(), "r34", ["filtered_image/$default"]);
    expect(cache.reference(annotation)).toBeUndefined();
  });
});
