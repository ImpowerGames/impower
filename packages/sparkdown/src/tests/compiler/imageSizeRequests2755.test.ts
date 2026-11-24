import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { programSummary } from "../../compiler/utils/programSummary";

const MAIN = "file:///proj/main.sd";
const P = "file:///proj/assets/Images/Portraits";
const BASE = `${P}/ava.png`;
const MOUTH = `${P}/ava mouth.closed default.png`;
const LIDS = `${P}/ava lids.on.png`;
const BACKDROP = "file:///proj/assets/Images/Backdrops/hall.png";

type Size = { width: number; height: number } | undefined;

const imageFile = (uri: string, size: Size) => {
  const leaf = decodeURIComponent(uri.slice(uri.lastIndexOf("/") + 1));
  return {
    uri,
    type: "image",
    name: leaf.slice(0, leaf.lastIndexOf(".")),
    ext: "png",
    src: `/src/${leaf}`,
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

const compile = (morphs: string, sizes: Record<string, Size>, scene = "  [[ava]]\n") => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: MAIN,
        type: "script",
        name: "main",
        ext: "sd",
        text: `${morphs}\nscene start\n${scene}end\n`,
        version: 1,
        languageId: "sparkdown",
      },
      ...Object.entries(sizes).map(([uri, size]) => imageFile(uri, size)),
    ] as never,
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program;
};

describe("the image files the compiler asks to have sized (#2755)", () => {
  test("a project with no morph asks for no sizes", () => {
    const program = compile("", { [BASE]: undefined, [MOUTH]: undefined, [LIDS]: undefined, [BACKDROP]: undefined });
    expect(program.imageSizeRequests).toBeUndefined();
  });

  test("a morph that fits no layered picture asks for no sizes", () => {
    const program = compile(BLINK, { [BACKDROP]: undefined }, "  [[hall]]\n");
    expect(program.imageSizeRequests).toBeUndefined();
  });

  test("a morph-fitted layered picture asks for exactly its unsized layer files", () => {
    const program = compile(BLINK, { [BASE]: undefined, [MOUTH]: undefined, [LIDS]: undefined, [BACKDROP]: undefined });
    expect([...(program.imageSizeRequests ?? [])].sort()).toEqual([BASE, LIDS, MOUTH].sort());
  });

  test("the summary a player's compiler sends carries the requests", () => {
    const program = compile(BLINK, { [BASE]: undefined, [MOUTH]: DOC, [LIDS]: DOC });
    expect(programSummary(program, true).imageSizeRequests).toEqual([BASE]);
    expect("imageSizeRequests" in programSummary(compile("", { [BASE]: undefined }), true)).toBe(false);
  });

  test("a layer file whose size is known is not asked for again", () => {
    const program = compile(BLINK, { [BASE]: DOC, [MOUTH]: undefined, [LIDS]: DOC });
    expect(program.imageSizeRequests).toEqual([MOUTH]);
  });

  test("a picture whose layer files are all sized asks for nothing", () => {
    const program = compile(BLINK, { [BASE]: DOC, [MOUTH]: DOC, [LIDS]: DOC });
    expect(program.imageSizeRequests).toBeUndefined();
  });

  test("the requests follow the sizes on a compiler that already compiled the project", () => {
    const compiler = new SparkdownCompiler();
    const script = { uri: MAIN, type: "script", name: "main", ext: "sd", text: `${BLINK}\nscene start\n  [[ava]]\nend\n`, version: 1, languageId: "sparkdown" };
    compiler.configure({ files: [script, imageFile(BASE, undefined), imageFile(MOUTH, undefined), imageFile(LIDS, undefined)] as never });
    expect(compiler.compile({ textDocument: { uri: MAIN } }).program.imageSizeRequests).toHaveLength(3);
    for (const uri of [BASE, MOUTH, LIDS]) compiler.updateFile({ file: imageFile(uri, DOC) } as never);
    expect(compiler.compile({ textDocument: { uri: MAIN } }).program.imageSizeRequests).toBeUndefined();
  });
});
