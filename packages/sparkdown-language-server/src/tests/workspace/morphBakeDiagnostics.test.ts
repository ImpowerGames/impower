import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { resolvePreviewLayers } from "@impower/sparkdown/src/compiler/utils/getImageComposite";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import { getHover } from "../../utils/providers/getHover";
import { createImageCompositeOptions } from "../../utils/providers/imagePreviewOptions";
import { resolveCompletion } from "../../utils/providers/resolveCompletion";

const main = "file:///project/main.sd";
const asset = "file:///project/bunny.svg";
const twin = "file:///project/rabbit.svg";

const UPPER = "M0,50 C30,5 70,5 100,50 C70,25 30,25 0,50Z";
const LOWER = "M0,50 C30,75 70,75 100,50 C70,85 30,85 0,50Z";
const CLOSED = "M0,50 C30,44 70,44 100,50 C70,50 30,50 0,50Z";
const EYEBALL = "M-5,50 C-5,20 105,20 105,50 C105,80 -5,80 -5,50Z";
/** An eye whose upper lash points at a gradient the file never defines. */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100">
<g data-name="eyes.open:default">
<path data-name="eyeball-white-left" d="${EYEBALL}" fill="#fff"/>
<path data-name="eyelash-left" d="${UPPER}" fill="#111" stroke="url(#gone)"/>
<path data-name="eyelash-left" d="${LOWER}" fill="#111"/>
</g>
<g data-name="eyes.closed"><path data-name="eyelash-left" d="${CLOSED}" fill="#111"/></g>
</svg>`;

const SCRIPT = `morph blink with
  method = bend
  keyframes {
    0% {
      eyes {
        state = open
      }
    }
    50% {
      eyes {
        state = closed
      }
    }
    100% {
      eyes {
        state = open
      }
    }
  }
  clips {
    {
      between {
        eyelash-left
      }
      targets {
        eyeball-white-left
      }
    }
  }
end

[[bunny]]
`;

/** The web editor's compile: the program carries no SVG source. */
function compileServed(script = SCRIPT): any {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    stripImageData: true,
    files: [
      { uri: main, type: "script", name: "main", ext: "sd", text: script, version: 1, languageId: "sparkdown" },
      { uri: asset, type: "image", name: "bunny", ext: "svg", src: "/file:/local/bunny.svg?v=1-1", text: SVG },
    ],
  } as any);
  return compiler.compile({ textDocument: { uri: main } }).program;
}

/**
 * VS Code's compile: the art is inline, so two files holding the same SVG
 * give their variants one artifact key.
 */
function compileInlineTwins(script: string): any {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: main, type: "script", name: "main", ext: "sd", text: script, version: 1, languageId: "sparkdown" },
      { uri: asset, type: "image", name: "bunny", ext: "svg", data: SVG },
      { uri: twin, type: "image", name: "rabbit", ext: "svg", data: SVG },
    ],
  } as any);
  return compiler.compile({ textDocument: { uri: main } }).program;
}

/** The decoded image an LSP preview's markup shows. */
const previewImage = (markup: string | undefined) => {
  const src = /<img src="([^"]*)"/.exec(markup ?? "")?.[1] ?? "";
  return decodeURIComponent(src);
};

function setup() {
  const workspace = Object.create(SparkdownLanguageServerWorkspace.prototype) as SparkdownLanguageServerWorkspace;
  Object.assign(workspace, {
    _documents: new SparkdownDocumentRegistry([]),
    _scriptFilePattern: /\.sd$/,
    _imageFilePattern: /\.svg$/,
    _documentVersions: new Map([[main, 1]]),
    _lastPublishedDiagnostics: new Map(),
    _lastFormattedText: new Map(),
    // The server keeps every watched file's text, served program or not.
    _watchedFiles: new Map<string, any>([[main, {}], [asset, { uri: asset, text: SVG }]]),
    _programStates: new Map(),
    _entryPrograms: new Map(),
    sendNotification: vi.fn(),
    sendRequest: vi.fn(),
  });
  const publishes = () =>
    vi.mocked(workspace.sendNotification).mock.calls
      .filter(([method]) => method === "textDocument/publishDiagnostics")
      .map(([, params]) => params as any);
  return { workspace, publishes };
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 10));
};

afterEach(() => vi.restoreAllMocks());

describe("morph bake diagnostics", () => {
  it("bakes each compiled reference from the server's own copy of the art and publishes what it reports on the art", async () => {
    const { workspace, publishes } = setup();
    const program = compileServed();
    expect(program.context.image.bunny.data).toBeFalsy();
    workspace.onCompiledTextDocument({ textDocument: { uri: main }, program });
    await until(() => publishes().some((p) => p.uri === asset));
    const published = publishes().filter((p) => p.uri === asset);
    expect(published).toHaveLength(1);
    expect(published[0].diagnostics).toEqual([
      expect.objectContaining({
        severity: 2,
        code: "morph-resource-missing",
        message: expect.stringContaining("Morph `blink` on `bunny`"),
      }),
    ]);
    // Nothing about the art lands on the script.
    expect(publishes().filter((p) => p.uri === main).flatMap((p) => p.diagnostics).filter((d: any) => String(d.code).startsWith("morph-"))).toEqual([]);
  }, 60_000);

  it("one problem in the art shows once, naming every variant it affects", async () => {
    const { workspace, publishes } = setup();
    workspace.onCompiledTextDocument({ textDocument: { uri: main }, program: compileServed(`${SCRIPT}\n[[bunny~eyes.open]]\n`) });
    await until(() => publishes().some((p) => p.uri === asset));
    const diagnostics = publishes().filter((p) => p.uri === asset).at(-1).diagnostics;
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("Morph `blink` on `bunny`, `bunny~eyes.open`");
  });

  it("a `paints` target the pose does not draw is warned about on the art, once, naming the variants", async () => {
    const { workspace, publishes } = setup();
    const painted = SCRIPT.replace(
      "  clips {",
      "  paints {\n    { targets { eyelash-left; eyelash-right }; state = eyes.closed; fill = #c9c9c9; span = 40% }\n  }\n  clips {",
    );
    const program = compileServed(`${painted}\n[[bunny~eyes.open]]\n`);
    expect(program.diagnostics?.[main]?.filter((d: any) => d.code === "morph" && d.severity === 1) ?? []).toEqual([]);
    workspace.onCompiledTextDocument({ textDocument: { uri: main }, program });
    await until(() => publishes().some((p) => p.uri === asset));
    const diagnostics = publishes().filter((p) => p.uri === asset).at(-1).diagnostics;
    const missing = diagnostics.filter((d: any) => d.code === "morph-paint-target-missing");
    expect(missing).toEqual([expect.objectContaining({ severity: 2 })]);
    expect(missing[0].message).toContain("Morph `blink` on `bunny`, `bunny~eyes.open`");
    expect(missing[0].message).toContain('"eyelash-right"');
    expect(missing[0].message).not.toContain('"eyelash-left"');
  });

  it("a recompile with the same keys republishes the bake's diagnostics at once", async () => {
    const { workspace, publishes } = setup();
    workspace.onCompiledTextDocument({ textDocument: { uri: main }, program: compileServed() });
    await until(() => publishes().some((p) => p.uri === asset));
    const count = publishes().length;
    workspace.onCompiledTextDocument({ textDocument: { uri: main }, program: compileServed() });
    // Unchanged, so nothing new is sent, and nothing was cleared in between.
    expect(publishes().filter((p) => p.uri === asset)).toHaveLength(1);
    expect(publishes().length).toBe(count);
  });

  it("the same art in two files reports on both files, each naming its own variant", async () => {
    const { workspace, publishes } = setup();
    const program = compileInlineTwins(`${SCRIPT}\n[[rabbit]]\n`);
    const [bunnyRef] = program.morphs.variants.bunny;
    const [rabbitRef] = program.morphs.variants.rabbit;
    expect(rabbitRef.key).toBe(bunnyRef.key);
    workspace.onCompiledTextDocument({ textDocument: { uri: main }, program });
    await until(() => publishes().some((p) => p.uri === asset) && publishes().some((p) => p.uri === twin));
    const on = (uri: string) => publishes().filter((p) => p.uri === uri).at(-1)?.diagnostics ?? [];
    expect(on(asset).map((d: any) => d.message)).toEqual([expect.stringContaining("Morph `blink` on `bunny`:")]);
    expect(on(twin).map((d: any) => d.message)).toEqual([expect.stringContaining("Morph `blink` on `rabbit`:")]);
  });
});

describe("morph previews through the providers", () => {
  const lineOf = (text: string, needle: string) => text.split("\n").findIndex((line) => line.includes(needle));

  it("hovering a variant the morph plays on shows its rest render", async () => {
    const { workspace } = setup();
    const program = compileServed();
    workspace.onCompiledTextDocument({ textDocument: { uri: main }, program });
    const documents = new SparkdownDocumentRegistry(["references"]);
    documents.set({ textDocument: { uri: main, text: SCRIPT, version: 1, languageId: "sparkdown" } });
    const position = { line: lineOf(SCRIPT, "[[bunny]]"), character: 4 };
    const hover = await getHover(documents.get(main), documents.tree(main), documents.annotations(main), program, undefined, position, createImageCompositeOptions(workspace));
    const shown = previewImage((hover?.contents as any)?.value);
    expect(shown).toContain("<mask");
    // Without the morph hook the same hover shows the plain static image.
    const plain = await getHover(documents.get(main), documents.tree(main), documents.annotations(main), program, undefined, position, {});
    expect(previewImage((plain?.contents as any)?.value)).not.toContain("<mask");
  });

  it("a + composition previews its blinking layer as that layer's rest render", async () => {
    const { workspace } = setup();
    const program = compileServed();
    workspace.onCompiledTextDocument({ textDocument: { uri: main }, program });
    // The layers a composition hands the compositor, bottom first.
    const composed = { $type: "layered_image", $name: "bunny+bunny~eyes.closed", assets: [{ $name: "bunny" }, { $name: "bunny~eyes.closed" }] };
    program.context.filtered_image["bunny~eyes.closed"] ??= { $type: "filtered_image", $name: "bunny~eyes.closed", image: { $name: "bunny" }, attributes: ["eyes.closed"] };
    const layers = await resolvePreviewLayers(program.context, composed, createImageCompositeOptions(workspace));
    expect(layers).toHaveLength(2);
    expect(decodeURIComponent(layers[0]!.src)).toContain("<mask");
    // The closed-eyes layer is dormant for the blink, so it stays as filtered.
    expect(layers[1]!.src).toContain("attributes=");
  });

  it("a completion candidate no script names yet previews as its rest render", async () => {
    const { workspace } = setup();
    const program = compileServed();
    workspace.onCompiledTextDocument({ textDocument: { uri: main }, program });
    expect(program.morphs.variants["bunny~eyes.open"]).toBeUndefined();
    const item = { label: "open", data: { uri: main, type: "image", name: "bunny", filtered: { image: "bunny", attributes: ["eyes.open"] } } };
    const resolved = await resolveCompletion({ ...item }, program, createImageCompositeOptions(workspace));
    expect(previewImage((resolved.documentation as any)?.value)).toContain("<mask");
    // A candidate the morph does not play on keeps its static preview.
    const closed = { label: "closed", data: { uri: main, type: "image", name: "bunny", filtered: { image: "bunny", attributes: ["eyes.closed"] } } };
    const still = await resolveCompletion(closed, program, createImageCompositeOptions(workspace));
    expect(previewImage((still.documentation as any)?.value)).not.toContain("<mask");
  });
});
