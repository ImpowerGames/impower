// How a compiled program crosses from the compiler worker to its workspace
// (#634). Every compile, and every autocomplete suggestion previewed, sends a
// program across that boundary, and on an illustrated project nearly all of its
// bytes are the portraits' attribute vocabularies, which do not change from one
// compile to the next. These tests pin that what arrives is the program that
// was compiled, and that an unchanged vocabulary is not sent again.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import {
  ProgramTransportDecoder,
  ProgramTransportEncoder,
} from "../../workspace/utils/programTransport";

const MAIN = "inmemory:///main.sd";
const PORTRAIT = "inmemory:///portrait.svg";

const svg = (extra = "") =>
  `<svg><g id="face" data-name="face.happy:default"><path/></g><g id="sad" data-name="face.sad"><path/></g><g id="hat" data-name="hat.on"><path/></g>${extra}</svg>`;

const script = (line: string) =>
  ["-> START", "", "scene START", "  [[portrait]]", `  ${line}`, "  Another line.", "end", ""].join("\n");

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

function compiler() {
  const c = new SparkdownCompiler();
  c.configure({
    files: [
      { uri: MAIN, type: "script", name: "main", ext: "sd", text: script("Hello."), version: 1, languageId: "sparkdown" },
      { uri: PORTRAIT, type: "image", name: "portrait", ext: "svg", src: "/file:/portrait.svg?v=1", text: svg(), version: 1 },
    ],
  } as never);
  return c;
}

const compile = (c: SparkdownCompiler) =>
  quiet(() => c.compile({ textDocument: { uri: MAIN } })).program;

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

/** Every shared-part marker in an encoded program. */
function markers(encoded: unknown) {
  const found: { $shared: number; value?: unknown }[] = [];
  const walk = (v: any) => {
    if (!v || typeof v !== "object") return;
    if (typeof v.$shared === "number") {
      found.push(v);
      return;
    }
    for (const k of Object.keys(v)) walk(v[k]);
  };
  walk(encoded);
  return found;
}

describe("a compiled program's asset channel", () => {
  it("is a copy of the context that shares each attribute vocabulary", () => {
    const program: any = compile(compiler());
    const context = program.context.image.portrait;
    const asset = program.assets.image.portrait;

    expect(context.attribute_vocabulary?.layers?.length).toBeGreaterThan(0);
    expect(asset).not.toBe(context);
    expect(asset.attribute_vocabulary).toBe(context.attribute_vocabulary);
    expect(stable(asset)).toBe(stable(context));
  });
});

describe("the program transport", () => {
  it("delivers the program that was compiled", () => {
    const c = compiler();
    const encoder = new ProgramTransportEncoder();
    const decoder = new ProgramTransportDecoder();
    const program = compile(c);
    const expected = stable(program);
    const expectedPaths = [...(program.pathLocations?.paths ?? [])];

    const received = decoder.decode(structuredClone(encoder.encode(program)));

    expect(stable(received)).toBe(expected);
    expect(received.pathLocations?.paths).toEqual(expectedPaths);
    // Encoding copies; the compiler's own program is untouched.
    expect(stable(program)).toBe(expected);
  });

  it("sends an unchanged vocabulary once and a changed one again", () => {
    const c = compiler();
    const encoder = new ProgramTransportEncoder();
    const decoder = new ProgramTransportDecoder();
    const first = encoder.encode(compile(c));
    decoder.decode(structuredClone(first));
    expect(markers(first).some((m) => "value" in m)).toBe(true);

    c.updateDocument({
      textDocument: { uri: MAIN, version: 2 },
      contentChanges: [{ text: script("Hello again.") }],
    } as never);
    const program = compile(c);
    const second = encoder.encode(program);
    expect(markers(second).length).toBeGreaterThan(0);
    expect(markers(second).every((m) => !("value" in m))).toBe(true);
    expect(stable(decoder.decode(structuredClone(second)))).toBe(stable(program));

    quiet(() =>
      c.updateFile({
        file: { uri: PORTRAIT, type: "image", name: "portrait", ext: "svg", src: "/file:/portrait.svg?v=2", text: svg('<g id="scarf" data-name="scarf.on"><path/></g>'), version: 2 },
      } as never),
    );
    const changed = compile(c);
    const third = encoder.encode(changed);
    expect(markers(third).some((m) => "value" in m)).toBe(true);
    expect(stable(decoder.decode(structuredClone(third)))).toBe(stable(changed));
    // Both sides now hold only what the newest program uses.
    expect((decoder as any)._held.size).toBe(new Set(markers(third).map((m) => m.$shared)).size);
  });

  it("refuses a program whose vocabularies it was never sent", () => {
    const c = compiler();
    const encoder = new ProgramTransportEncoder();
    encoder.encode(compile(c));
    const second = encoder.encode(compile(c));

    expect(() => new ProgramTransportDecoder().decode(structuredClone(second))).toThrow(
      /out of step/,
    );
  });
});
