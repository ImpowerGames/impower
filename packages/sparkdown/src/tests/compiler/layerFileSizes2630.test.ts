import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { layeredMorphArtwork } from "../../morph/layered";

const MAIN = "file:///proj/main.sd";
const P = "file:///proj/assets/Images/Portraits";

type Size = { width: number; height: number } | undefined;

const imageFile = (uri: string, size: Size) => {
  const leaf = decodeURIComponent(uri.slice(uri.lastIndexOf("/") + 1));
  return {
    uri,
    type: "image",
    name: leaf.slice(0, leaf.lastIndexOf(".")),
    ext: "png",
    src: `/src/${uri.slice(P.length + 1)}`,
    version: 1,
    ...size,
  };
};

const BLINK = `morph blink {
  blend = cut
  keyframes {
    from {
      lids {
        state = off
      }
    }
    50% {
      lids {
        state = on
      }
    }
    to {
      lids {
        state = off
      }
    }
  }
}
`;

const DOC = { width: 512, height: 768 };
const SMALL = { width: 480, height: 640 };

const compile = (morphs: string, sizes: Record<string, Size>) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: MAIN,
        type: "script",
        name: "main",
        ext: "sd",
        text: `${morphs}\nscene start\n  [[ava]]\nend\n`,
        version: 1,
        languageId: "sparkdown",
      },
      ...Object.entries(sizes).map(([uri, size]) => imageFile(uri, size)),
    ] as never,
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program;
};

const BASE = `${P}/ava.png`;
const MOUTH = `${P}/ava mouth.closed default.png`;
const LIDS = `${P}/ava lids.on.png`;

const sizeWarnings = (program: ReturnType<typeof compile>) =>
  Object.entries(program.diagnostics ?? {}).flatMap(([uri, list]) =>
    list
      .filter((diagnostic) => {
        const message = diagnostic.message as unknown as { value: string } | string;
        return /document size/.test(typeof message === "string" ? message : message.value);
      })
      .map((diagnostic) => ({ uri, diagnostic })),
  );

const text = (diagnostic: { message: unknown }) => {
  const message = diagnostic.message as { value: string } | string;
  return typeof message === "string" ? message : message.value;
};

describe("a layered picture whose layer files differ in pixel size (#2630)", () => {
  test("one warning on the odd file, naming both sizes, and no morph reference", () => {
    const program = compile(BLINK, { [BASE]: DOC, [MOUTH]: DOC, [LIDS]: SMALL });
    const warnings = sizeWarnings(program);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.uri).toBe(LIDS);
    const message = text(warnings[0]!.diagnostic);
    expect(message).toContain("480×640");
    expect(message).toContain("512×768");
    expect(message).toContain('"ava"');
    expect(message).toContain('"ava.png"');
    expect(warnings[0]!.diagnostic.severity).toBe(2);
    expect(program.morphs?.variants["ava"]).toBeUndefined();
  });

  test("no warning when no morph fits the picture", () => {
    const program = compile("", { [BASE]: DOC, [MOUTH]: DOC, [LIDS]: SMALL });
    expect(sizeWarnings(program)).toEqual([]);
  });

  test("no warning when a file's size is unknown", () => {
    const program = compile(BLINK, { [BASE]: DOC, [MOUTH]: undefined, [LIDS]: DOC });
    expect(sizeWarnings(program)).toEqual([]);
    expect(program.morphs?.variants["ava"]).toHaveLength(1);
  });

  test("no warning when the bottom layer's size is unknown", () => {
    const program = compile(BLINK, { [BASE]: undefined, [MOUTH]: DOC, [LIDS]: SMALL });
    expect(sizeWarnings(program)).toEqual([]);
  });

  test("a picture whose files all match keeps its reference, and its artwork carries the picture's rectangle", () => {
    const program = compile(BLINK, { [BASE]: DOC, [MOUTH]: DOC, [LIDS]: DOC });
    expect(sizeWarnings(program)).toEqual([]);
    expect(program.morphs?.variants["ava"]).toHaveLength(1);
    const artwork = layeredMorphArtwork(program.context, program.context?.["layered_image"]?.["ava"]);
    expect(artwork?.size).toEqual(DOC);
    expect(artwork?.text).toContain('viewBox="0 0 512 768" width="512" height="768"');
    expect(artwork?.text).toContain('x="0" y="0" width="512" height="768"');
  });
});
