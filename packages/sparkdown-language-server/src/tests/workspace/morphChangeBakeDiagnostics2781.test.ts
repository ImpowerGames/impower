import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";

const main = "file:///project/main.sd";
const asset = "file:///project/mia.svg";

const lips = (...ys: number[]) => ys.map((y) => `<path data-name="lip" d="M0,${y} C30,${y + 25} 70,${y + 25} 100,${y}Z"/>`).join("");
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<g data-name="mouth.smile default">${lips(40, 60)}</g>
<g data-name="mouth.frown">${lips(30, 50, 70)}</g>
<g data-name="mouth.open">${lips(45, 65)}</g>
</svg>`;

const morph = (trigger: string, keyframes = "") => `morph bend {
  method = match
${keyframes}  timing {
    trigger = ${trigger}
    duration = 0.08
  }
}
`;

const APPEAR = morph("appear", "  keyframes {\n    from { mouth { state = smile } }\n    to { mouth { state = frown } }\n  }\n");
const CHANGE = morph("change");

const scene = (...looks: string[]) => `\nscene start\n${looks.map((look) => `  [[${look}]]\n  Mia speaks.\n`).join("")}end\n`;

function compile(script: string): any {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    stripImageData: true,
    files: [
      { uri: main, type: "script", name: "main", ext: "sd", text: script, version: 1, languageId: "sparkdown" },
      { uri: asset, type: "image", name: "mia", ext: "svg", src: "/file:/local/mia.svg?v=1-1", text: SVG },
    ],
  } as any);
  return compiler.compile({ textDocument: { uri: main } }).program;
}

function setup() {
  const workspace = Object.create(SparkdownLanguageServerWorkspace.prototype) as SparkdownLanguageServerWorkspace;
  Object.assign(workspace, {
    _documents: new SparkdownDocumentRegistry([]),
    _scriptFilePattern: /\.sd$/,
    _imageFilePattern: /\.svg$/,
    _documentVersions: new Map([[main, 1]]),
    _lastPublishedDiagnostics: new Map(),
    _lastFormattedText: new Map(),
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

async function bakeDiagnostics(script: string) {
  const { workspace, publishes } = setup();
  workspace.onCompiledTextDocument({ textDocument: { uri: main }, program: compile(script) });
  await until(() => publishes().some((p) => p.uri === asset));
  const published = publishes().filter((p) => p.uri === asset).at(-1)?.diagnostics ?? [];
  return { diagnostics: published.filter((d: any) => String(d.code).startsWith("morph-")) };
}

afterEach(() => vi.restoreAllMocks());

describe("a change morph's bake diagnostics", () => {
  it("an appear morph on the pair reports the drawings its method cannot pair on the art", async () => {
    const { diagnostics } = await bakeDiagnostics(`${APPEAR}${scene("mia:mouth.smile")}`);
    expect(diagnostics).toEqual([
      expect.objectContaining({ severity: 2, code: "morph-pairing-count", message: expect.stringContaining('Morph `bend` on `mia`, `mia:mouth.smile` (layer "lip")') }),
    ]);
  }, 60_000);

  it("a change morph reports the same problem on the art for the pair two directives reach in turn", async () => {
    const { diagnostics } = await bakeDiagnostics(`${CHANGE}${scene("mia:mouth.smile", "mia:mouth.frown")}`);
    expect(diagnostics).toEqual([
      expect.objectContaining({ severity: 2, code: "morph-pairing-count", message: expect.stringContaining("Morph `bend` on `mia:mouth.frown`") }),
    ]);
    expect(diagnostics[0].message).toContain('"lip" has 2 drawings in one pose and 3 in the other');
  }, 60_000);

  it("a pair no directive reaches is not baked and reports nothing", async () => {
    const { workspace, publishes } = setup();
    const program = compile(`${CHANGE}${scene("mia:mouth.smile", "mia:mouth.open", "mia:mouth.smile")}`);
    expect(program.morphChanges?.map(({ variant }: any) => variant)).toEqual(["mia:mouth.open", "mia:mouth.smile"]);
    workspace.onCompiledTextDocument({ textDocument: { uri: main }, program });
    await until(() => publishes().some((p) => p.uri === asset));
    const diagnostics = publishes().filter((p) => p.uri === asset).at(-1)?.diagnostics ?? [];
    expect(diagnostics.filter((d: any) => String(d.code).startsWith("morph-"))).toEqual([]);
  }, 60_000);
});
