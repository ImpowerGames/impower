// #654: the assembled context is the same for every compile of a project whose
// definitions, declarations and files are unchanged, so it is assembled once
// and shared. What an edit to a line of dialogue must not do is rebuild it, and
// what the sharing must not do is let one compile's speculative entries reach
// the next one.
//
// The base holds the builtins, the project's defines, the structs derived from
// its files and the `$default` merge over all of them. A compile layers its own
// implicit definitions over that base copy-on-write, so the shared tables never
// learn about an entry that belongs to one compile — which is what keeps a
// preview compile's filtered image out of the canonical compile that follows.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const URI = "file:///main.sd";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg"><g data-name="face.happy:default" id="happy"/><g data-name="face.sad" id="sad"/><g data-name="hat.on" id="hat"/></svg>`;

const image = (name: string) => ({
  uri: `file:///${name}.svg`,
  type: "image",
  name,
  ext: "svg",
  data: SVG,
});

/** A project with defines, a declaration, an image asset and several scenes. */
function screenplay(
  options: { speed?: number; extraDefine?: boolean; directive?: boolean } = {},
): string {
  const L: string[] = [];
  L.push("define hero as character with");
  L.push(`  name = "Hero"`);
  L.push("end");
  L.push("");
  L.push("define pace as config with");
  L.push(`  speed = ${options.speed ?? 5}`);
  L.push("end");
  if (options.extraDefine) {
    L.push("");
    L.push("define sidekick as character with");
    L.push(`  name = "Sidekick"`);
    L.push("end");
  }
  L.push("");
  L.push("store trust = 0");
  L.push("");
  for (let s = 0; s < 4; s++) {
    L.push(`scene scene_${s}`);
    L.push(":");
    L.push(`  Action describing room ${s}.`);
    L.push(`[[mia:happy]]`);
    if (options.directive && s === 2) {
      L.push(`[[mia:sad]]`);
    }
    L.push(`hero:`);
    L.push(`  Line one of dialogue in scene ${s}.`);
    L.push(`  Speed is {pace.speed} and trust is {trust}.`);
    L.push(`-> scene_${(s + 1) % 4}`);
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

function compilerFor(text: string) {
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
      image("mia"),
    ],
  } as never);
  return compiler;
}

const posAt = (text: string, offset: number) => {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length - 1, character: before.at(-1)!.length };
};

/** Apply a minimal-range edit turning the first `find` into `replace`. */
function edit(
  compiler: SparkdownCompiler,
  text: string,
  find: string,
  replace: string,
  version: number,
): string {
  const offset = text.indexOf(find);
  expect(offset, `"${find}" is in the text`).toBeGreaterThanOrEqual(0);
  compiler.updateDocument({
    textDocument: { uri: URI, version },
    contentChanges: [
      {
        range: {
          start: posAt(text, offset),
          end: posAt(text, offset + find.length),
        },
        text: replace,
      },
    ],
  } as never);
  return text.slice(0, offset) + replace + text.slice(offset + find.length);
}

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

const compile = (compiler: SparkdownCompiler) =>
  quiet(() => compiler.compile({ textDocument: { uri: URI } })).program;

const builds = (compiler: SparkdownCompiler) =>
  (compiler as unknown as { contextBaseBuilds: number }).contextBaseBuilds;

describe("the assembled context of an unchanged project (#654)", () => {
  it("is not rebuilt by an edit to a line of dialogue, and does not move the revision", () => {
    const text = screenplay();
    const compiler = compilerFor(text);
    const first = compile(compiler);
    const buildsAfterFirst = builds(compiler);
    expect(buildsAfterFirst).toBe(1);

    const after = edit(
      compiler,
      text,
      "Line one of dialogue in scene 2.",
      "Line one of dialogue in scene 2, rewritten.",
      2,
    );
    const second = compile(compiler);

    expect(builds(compiler)).toBe(buildsAfterFirst);
    expect(second.contextRevision).toBe(first.contextRevision);
    // The reused context is the one a compile from nothing produces.
    const coldProgram = compile(compilerFor(after));
    expect(stable(second.context)).toBe(stable(coldProgram.context));
    expect(second.context?.["character"]?.["hero"]?.["name"]).toBe("Hero");
  });

  it.each([
    {
      name: "a define's value changes",
      apply: (compiler: SparkdownCompiler, text: string) =>
        edit(compiler, text, "speed = 5", "speed = 9", 2),
    },
    {
      name: "a define is added",
      apply: (compiler: SparkdownCompiler, text: string) =>
        edit(
          compiler,
          text,
          "store trust = 0",
          'define sidekick as character with\n  name = "Sidekick"\nend\n\nstore trust = 0',
          2,
        ),
    },
    {
      name: "a declaration's value changes",
      apply: (compiler: SparkdownCompiler, text: string) =>
        edit(compiler, text, "store trust = 0", "store trust = 7", 2),
    },
  ])("is rebuilt and moves the revision when $name", ({ apply }) => {
    const text = screenplay();
    const compiler = compilerFor(text);
    const first = compile(compiler);
    const after = apply(compiler, text);
    const second = compile(compiler);

    expect(builds(compiler)).toBe(2);
    expect(second.contextRevision).not.toBe(first.contextRevision);
    expect(stable(second.context)).toBe(
      stable(compile(compilerFor(after)).context),
    );
  });

  it("is rebuilt and moves the revision when a file is added", () => {
    const compiler = compilerFor(screenplay());
    const first = compile(compiler);
    compiler.addFile({ file: image("rex") } as never);
    const second = compile(compiler);

    expect(builds(compiler)).toBe(2);
    expect(second.contextRevision).not.toBe(first.contextRevision);
    expect(second.context?.["image"]?.["rex"]).toBeDefined();
  });

  it("is rebuilt and moves the revision when the configuration changes", () => {
    const compiler = compilerFor(screenplay());
    const first = compile(compiler);
    expect(first.context?.["image"]?.["mia"]?.["data"]).toMatch(
      /^data:image\/svg\+xml,/,
    );
    compiler.configure({ stripImageData: true } as never);
    const second = compile(compiler);

    expect(builds(compiler)).toBe(2);
    expect(second.contextRevision).not.toBe(first.contextRevision);
    expect(second.context?.["image"]?.["mia"]?.["data"]).toBeFalsy();
  });
});

describe("a compile's own implicit definitions (#654)", () => {
  it("are layered over the shared base without writing into it", () => {
    const text = screenplay();
    const compiler = compilerFor(text);
    const first = compile(compiler);
    expect(first.context?.["filtered_image"]?.["mia~happy"]).toBeDefined();
    expect(first.context?.["filtered_image"]?.["mia~sad"]).toBeUndefined();

    // Add a directive implying a new filtered image.
    const withDirective = edit(
      compiler,
      text,
      "[[mia:happy]]\nhero:\n  Line one of dialogue in scene 2.",
      "[[mia:happy]]\n[[mia:sad]]\nhero:\n  Line one of dialogue in scene 2.",
      2,
    );
    const second = compile(compiler);
    const added = second.context?.["filtered_image"]?.["mia~sad"];
    expect(added).toBeDefined();
    expect(added?.["attributes"]).toEqual(["sad"]);
    // The layer carries the type's `$default` the same way the base does.
    expect(added?.["image"]).toBeDefined();
    expect(second.contextRevision).not.toBe(first.contextRevision);
    // The entry belongs to this compile, not to the shared base: the earlier
    // program never learns about it.
    expect(first.context?.["filtered_image"]?.["mia~sad"]).toBeUndefined();

    // Take the directive away again; the entry goes with it.
    edit(compiler, withDirective, "\n[[mia:sad]]", "", 3);
    const third = compile(compiler);
    expect(third.context?.["filtered_image"]?.["mia~sad"]).toBeUndefined();
    expect(third.contextRevision).toBe(first.contextRevision);
  });

  it("stay inside a preview compile and never reach the canonical one", () => {
    const text = screenplay();
    const compiler = compilerFor(text);
    const canonical = compile(compiler);
    expect(canonical.context?.["filtered_image"]?.["mia~sad"]).toBeUndefined();
    const buildsBefore = builds(compiler);

    const offset = text.indexOf("[[mia:happy]]");
    // The document is still at the version it was configured with; a preview
    // request naming any other version is refused as outdated.
    const preview = quiet(() =>
      compiler.previewCompile({
        root: { uri: URI },
        textDocument: { uri: URI, version: 1 },
        contentChanges: [
          {
            range: {
              start: posAt(text, offset),
              end: posAt(text, offset + "[[mia:happy]]".length),
            },
            text: "[[mia:sad]]",
          },
        ],
        startFrom: { file: URI, line: 0 },
      } as never),
    ) as { program?: { context?: Record<string, Record<string, any>> } };
    expect(preview.program).toBeDefined();
    expect(
      preview.program?.context?.["filtered_image"]?.["mia~sad"],
    ).toBeDefined();

    // The canonical compile of the unedited text still does not carry it, and
    // the preview did not force the shared base to be assembled again.
    const afterPreview = compile(compiler);
    expect(
      afterPreview.context?.["filtered_image"]?.["mia~sad"],
    ).toBeUndefined();
    expect(canonical.context?.["filtered_image"]?.["mia~sad"]).toBeUndefined();
    expect(builds(compiler)).toBe(buildsBefore);
  });
});
