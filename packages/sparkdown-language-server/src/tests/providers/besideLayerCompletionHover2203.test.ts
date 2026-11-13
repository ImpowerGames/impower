// @vitest-environment node
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getHover } from "../../utils/providers/getHover";
import { resolveCompletion } from "../../utils/providers/resolveCompletion";
import { complete } from "./completionHarness";

const ROOT = "file:///proj";
const MAIN = `${ROOT}/main.sd`;
const P = `${ROOT}/assets/Images/Portraits`;
const B = `${ROOT}/assets/Images/Backdrops`;
const AVA = [
  `${P}/ava.png`,
  `${P}/ava@night.png`,
  `${P}/ava~face.happy.png`,
  `${P}/ava~face.sad.png`,
  `${P}/ava~mouth.closed~default.png`,
  `${P}/ava~mouth.open.png`,
  `${P}/ava~hat.on.png`,
  `${P}/ava@night~face.happy.png`,
];
const FILES = [
  ...AVA,
  `${P}/imani.png`,
  `${P}/imani~20_face.happy.png`,
  `${P}/imani~10_hat.on.png`,
  `${P}/imani~30_scarf.png`,
  `${P}/mia/90_body.png`,
  `${P}/mia/30_face.happy.png`,
  `${B}/beach.png`,
  `${B}/beach@night.png`,
  `${B}/beach@night~sky.stars.png`,
  `${B}/beach@night~sky.clouds.png`,
  `${ROOT}/assets/Images/office.png`,
];

const compile = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: MAIN, name: "main", type: "script", ext: "sd", text, languageId: "sparkdown", version: 1 },
      ...FILES.map((uri) => {
        const leaf = uri.split("/").at(-1)!;
        return { uri, type: "image", name: leaf.split(/[.~]/)[0]!, ext: "png", src: uri, version: 1 };
      }),
    ] as never,
  });
  return compiler.compile({ textDocument: { uri: MAIN } }).program!;
};

const program = compile("");

const labels = (source: string, trigger?: string, from = program) =>
  complete(source, { program: from, trigger }).labels.filter((label) => !label.startsWith("$")).sort();

let drawn: string[] = [];

const stubComposition = () => {
  drawn = [];
  vi.stubGlobal("fetch", async (url: string) => ({
    ok: true,
    blob: async () => new Blob([url]),
    headers: { get: () => null },
  }));
  vi.stubGlobal("createImageBitmap", async (blob: Blob) => ({ width: 100, height: 200, close() {}, tag: await blob.text() }));
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        return { drawImage: (bitmap: { tag: string }) => drawn.push(bitmap.tag) };
      }
      async convertToBlob() {
        return new Blob([new Uint8Array(16)], { type: "image/webp" });
      }
    },
  );
};

afterEach(() => vi.unstubAllGlobals());

const hoverAt = async (text: string, column: number) => {
  const documents = new SparkdownDocumentRegistry(["references"]);
  documents.set({ textDocument: { uri: MAIN, text, version: 1, languageId: "sparkdown" } });
  const compiled = compile(text);
  const hover = await getHover(documents.get(MAIN), documents.tree(MAIN), documents.annotations(MAIN), compiled, undefined, { line: 0, character: column });
  return (hover?.contents as { value: string } | undefined)?.value ?? "";
};

const listed = (markup: string) => [...markup.matchAll(/^- `([^`]+)`$/gm)].map((match) => match[1]);

describe("completion offers a beside-layer picture's own options (#2203)", () => {
  it("offers ava's options and groups after [[ava:", () => {
    expect(labels("[[ava:@0]]")).toEqual(["closed", "face", "happy", "hat", "mouth", "open", "sad"]);
  });

  it("offers only night's own options after [[ava@night:", () => {
    expect(labels("[[ava@night:@0]]")).toEqual(["face", "happy"]);
  });

  it("offers a group's options after its dot", () => {
    expect(labels("[[ava:face.@0]]", ".")).toEqual(["happy", "sad"]);
    expect(labels("[[ava@night:face.@0]]", ".")).toEqual(["happy"]);
  });

  it("offers the same options after ~", () => {
    expect(labels("[[ava~@0]]")).toEqual(["closed", "face", "happy", "hat", "mouth", "open", "sad"]);
    expect(labels("[[ava@night~@0]]")).toEqual(["face", "happy"]);
  });

  it("offers the named picture's options inside a + composition", () => {
    expect(labels("[[office + ava@night:@0]]")).toEqual(["face", "happy"]);
    expect(labels("[[ava@night:happy + ava:@0]]")).toEqual(["closed", "face", "happy", "hat", "mouth", "open", "sad"]);
  });

  it("offers a backdrop alternate's options after [[show backdrop beach@night:", () => {
    expect(labels("[[show backdrop beach@night:@0]]")).toEqual(["clouds", "sky", "stars"]);
  });

  it("offers the filtered picture's options inside a filtered_image's attributes", () => {
    const text = 'define ava@party as filtered_image with\n  image = image.ava@night\n  attributes = { "@0" }\nend\n';
    const compiled = compile(text.replace("@0", ""));
    expect(labels(text, undefined, compiled)).toEqual(["face", "happy"]);
  });
});

describe("the suggestion preview draws a beside-layer option (#2203)", () => {
  const preview = async (source: string, label: string) => {
    stubComposition();
    const item = complete(source, { program, trigger: "." }).items.find((candidate) => candidate.label === label);
    expect(item, label).toBeDefined();
    const resolved = await resolveCompletion(item!, program);
    expect((resolved.documentation as { value: string } | undefined)?.value).toMatch(/<img src="data:image\/webp;base64,/);
    return drawn;
  };

  it("draws ava's own file, the default mouth and the highlighted face", async () => {
    expect(await preview("[[ava:face.@0]]", "sad")).toEqual([`${P}/ava.png`, `${P}/ava~face.sad.png`, `${P}/ava~mouth.closed~default.png`]);
  });

  it("draws night's own file and night's own layer", async () => {
    expect(await preview("[[ava@night:face.@0]]", "happy")).toEqual([`${P}/ava@night.png`, `${P}/ava@night~face.happy.png`]);
  });
});

describe("hover lists the files a beside-layer picture is made from (#2203)", () => {
  it("lists ava's files bottom to top on [[ava:happy]]", async () => {
    expect(listed(await hoverAt("[[ava:happy]]", 3))).toEqual([
      "ava.png",
      "ava~face.happy.png",
      "ava~face.sad.png",
      "ava~hat.on.png",
      "ava~mouth.closed~default.png",
      "ava~mouth.open.png",
    ]);
  });

  it("lists only an alternate's own files", async () => {
    expect(listed(await hoverAt("[[ava@night:happy]]", 3))).toEqual(["ava@night.png", "ava@night~face.happy.png"]);
  });

  it("lists numbered layers with the highest number at the bottom", async () => {
    expect(listed(await hoverAt("[[imani:happy]]", 3))).toEqual([
      "imani.png",
      "imani~30_scarf.png",
      "imani~20_face.happy.png",
      "imani~10_hat.on.png",
    ]);
  });

  it("lists the files on a define's image.ava@night", async () => {
    const text = 'define ava@party as filtered_image with\n  image = image.ava@night\nend\n';
    const documents = new SparkdownDocumentRegistry(["references"]);
    documents.set({ textDocument: { uri: MAIN, text, version: 1, languageId: "sparkdown" } });
    const hover = await getHover(documents.get(MAIN), documents.tree(MAIN), documents.annotations(MAIN), compile(text), undefined, { line: 1, character: 18 });
    expect(listed((hover?.contents as { value: string } | undefined)?.value ?? "")).toEqual(["ava@night.png", "ava@night~face.happy.png"]);
  });

  it("lists no files for a plain picture or a picture a define replaces", async () => {
    expect(listed(await hoverAt("[[office]]", 3))).toEqual([]);
    const text = "[[ava:happy]]\n\ndefine ava as layered_image with\n  assets = { base = image.office }\nend\n";
    expect(listed(await hoverAt(text, 3))).toEqual([]);
  });
});
