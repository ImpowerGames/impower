import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../src/compiler/classes/SparkdownCompiler";
import { layeredMorphArtwork } from "../../src/morph/layered";
import { imageSizeOf } from "../../src/workspace/utils/imageSize";

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
    expect(program.morphs?.variants["ava"]).toHaveLength(1);
  });

  test.each([
    ["an overlay", "kit_base", "lid_look", "file:///proj/lid_file.png"],
    ["the bottom layer", "base_look", "lid_file", "file:///proj/lid_file.png"],
  ])("a layer drawn through a filtered_image is sized by its file: %s", (_which, base, lids, warnedUri) => {
    const compiler = new SparkdownCompiler();
    const text = `${BLINK}
define base_look as filtered_image with
  image = kit_base,
  attributes = {}
end

define lid_look as filtered_image with
  image = lid_file,
  attributes = {}
end

define kit as layered_image with
  assets = {
    ["base"] = ${base},
    ["lids.on"] = ${lids},
  }
end

scene start
  [[kit]]
end
`;
    compiler.configure({
      files: [
        { uri: MAIN, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
        { ...imageFile("file:///proj/kit_base.png", DOC), name: "kit_base" },
        { ...imageFile("file:///proj/lid_file.png", SMALL), name: "lid_file" },
      ] as never,
    });
    const program = compiler.compile({ textDocument: { uri: MAIN } }).program;
    expect(sizeWarnings(program).map(({ uri }) => uri)).toEqual([warnedUri]);
    expect(program.morphs?.variants["kit"]).toBeUndefined();
  });

  test("JPEG layers read from their headers are checked, and ones carrying Exif or broken before their scan are not checked", () => {
    const scan = [0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 0x12, 0x34];
    const exif = [0xff, 0xe1, 0, 34, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0];
    const jpeg = (width: number, height: number, before: number[], after: number[]) =>
      new Uint8Array([0xff, 0xd8, ...before, 0xff, 0xc0, 0, 17, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, ...new Array(9).fill(0), ...after]);
    const sizes = (lids: Uint8Array) => ({
      [BASE]: imageSizeOf(jpeg(200, 300, [], scan)),
      [MOUTH]: imageSizeOf(jpeg(200, 300, [], scan)),
      [LIDS]: imageSizeOf(lids),
    });
    const matching = compile(BLINK, sizes(jpeg(200, 300, [], scan)));
    expect(sizeWarnings(matching)).toEqual([]);
    expect(matching.morphs?.variants["ava"]).toHaveLength(1);
    const odd = compile(BLINK, sizes(jpeg(180, 240, [], scan)));
    expect(sizeWarnings(odd).map(({ uri }) => uri)).toEqual([LIDS]);
    expect(text(sizeWarnings(odd)[0]!.diagnostic)).toContain("180×240");
    expect(odd.morphs?.variants["ava"]).toBeUndefined();
    for (const lids of [
      jpeg(180, 240, exif, scan),
      jpeg(180, 240, [], [...exif, ...scan]),
      jpeg(180, 240, [0x12, 0x34], scan),
      jpeg(180, 240, [], [0x12, 0x34, 0x56, ...scan]),
      jpeg(180, 240, [], [0x12, 0x34, 0x56, 0x78, 0x9a]),
    ]) {
      expect(imageSizeOf(lids)).toBeUndefined();
      const unchecked = compile(BLINK, sizes(lids));
      expect(sizeWarnings(unchecked)).toEqual([]);
      expect(unchecked.morphs?.variants["ava"]).toHaveLength(1);
    }
  });

  test("sizes that arrive after a first compile take the reference away and add the warning on the next compile", () => {
    const compiler = new SparkdownCompiler();
    const script = {
      uri: MAIN,
      type: "script",
      name: "main",
      ext: "sd",
      text: `${BLINK}\nscene start\n  [[ava]]\nend\n`,
      version: 1,
      languageId: "sparkdown",
    };
    compiler.configure({ files: [script, imageFile(BASE, undefined), imageFile(MOUTH, undefined), imageFile(LIDS, undefined)] as never });
    const before = compiler.compile({ textDocument: { uri: MAIN } }).program;
    expect(before.morphs?.variants["ava"]).toHaveLength(1);
    expect(sizeWarnings(before)).toEqual([]);
    for (const [uri, size] of [[BASE, DOC], [MOUTH, DOC], [LIDS, SMALL]] as const) {
      compiler.updateFile({ file: imageFile(uri, size) as never });
    }
    const after = compiler.compile({ textDocument: { uri: MAIN } }).program;
    expect(sizeWarnings(after).map(({ uri }) => uri)).toEqual([LIDS]);
    expect(after.morphs?.variants["ava"]).toBeUndefined();
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
