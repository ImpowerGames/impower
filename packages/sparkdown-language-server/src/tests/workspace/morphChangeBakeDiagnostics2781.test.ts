import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";

const main = "file:///project/main.sd";
const asset = "file:///project/mia.svg";
const other = "file:///project/tom.svg";

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
const TALK = `morph talk {\n  blend = cut\n  timing { trigger = speech }\n  keyframes {\n    from { mouth { state = smile } }\n    to { mouth { state = open } }\n  }\n}\n`;
const MIA = `define mia as character with\n  name = "Mia"\nend\n`;

const shows = (...looks: string[]) => `\nscene start\n${looks.map((look) => `  [[show portrait ${look}]]\n  Mia speaks.\n`).join("")}end\n`;

function compile(script: string): any {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    stripImageData: true,
    files: [
      { uri: main, type: "script", name: "main", ext: "sd", text: script, version: 1, languageId: "sparkdown" },
      { uri: asset, type: "image", name: "mia", ext: "svg", src: "/file:/local/mia.svg?v=1-1", text: SVG },
      { uri: other, type: "image", name: "tom", ext: "svg", src: "/file:/local/tom.svg?v=1-1", text: SVG },
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
    _watchedFiles: new Map<string, any>([[main, {}], [asset, { uri: asset, text: SVG }], [other, { uri: other, text: SVG }]]),
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
  const program = compile(script);
  workspace.onCompiledTextDocument({ textDocument: { uri: main }, program });
  await until(() => publishes().some((p) => p.uri === asset));
  const published = publishes().filter((p) => p.uri === asset).at(-1)?.diagnostics ?? [];
  return { program, diagnostics: published.filter((d: any) => String(d.code).startsWith("morph-")) };
}

const PAIRING = expect.objectContaining({ severity: 2, code: "morph-pairing-count", message: expect.stringContaining("Morph `bend` on `mia:mouth.frown`") });

afterEach(() => vi.restoreAllMocks());

describe("a change morph's bake diagnostics", () => {
  it("an appear morph on the pair reports the drawings its method cannot pair on the art", async () => {
    const { diagnostics } = await bakeDiagnostics(`${APPEAR}\nscene start\n  [[mia:mouth.smile]]\n  Mia speaks.\nend\n`);
    expect(diagnostics).toEqual([
      expect.objectContaining({ severity: 2, code: "morph-pairing-count", message: expect.stringContaining('Morph `bend` on `mia`, `mia:mouth.smile` (layer "lip")') }),
    ]);
  }, 60_000);

  it("a change morph reports the same problem on the art for two shows to one target in adjacent beats", async () => {
    const { diagnostics } = await bakeDiagnostics(`${CHANGE}${shows("mia:mouth.smile", "mia:mouth.frown")}`);
    expect(diagnostics).toEqual([PAIRING]);
    expect(diagnostics[0].message).toContain('"lip" has 2 drawings in one pose and 3 in the other');
  }, 60_000);

  it("the directives' morph clauses choose the speech morphs, so `morph none` on both keeps the change and its problem", async () => {
    const { diagnostics } = await bakeDiagnostics(`${CHANGE}${TALK}${shows("mia:mouth.smile morph none", "mia:mouth.frown morph none")}`);
    expect(diagnostics).toEqual([PAIRING]);
  }, 60_000);

  it("a pair whose morphs depend on who speaks the line, over a character's own portrait, is neither baked nor reported", async () => {
    const { program, diagnostics } = await bakeDiagnostics(`${MIA}${CHANGE}${TALK}${shows("mia:mouth.smile", "mia:mouth.frown")}`);
    expect(program.morphChanges).toBeUndefined();
    expect(diagnostics).toEqual([]);
  }, 60_000);

  it("a character's own portrait with no speech morph still reports, since no speaker changes its morphs", async () => {
    const { diagnostics } = await bakeDiagnostics(`${MIA}${CHANGE}${shows("mia:mouth.smile", "mia:mouth.frown")}`);
    expect(diagnostics).toEqual([PAIRING]);
  }, 60_000);

  it("a portrait replaced on its target between two shows is not a pair", async () => {
    const { program, diagnostics } = await bakeDiagnostics(`${CHANGE}${shows("mia:mouth.smile", "tom:mouth.smile", "mia:mouth.frown")}`);
    expect(program.morphChanges).toBeUndefined();
    expect(diagnostics).toEqual([]);
  }, 60_000);

  it("lists only the pairs the shows reach in turn", () => {
    const program = compile(`${CHANGE}${shows("mia:mouth.smile", "mia:mouth.open", "mia:mouth.smile")}`);
    expect(program.morphChanges?.map(({ variant }: any) => variant)).toEqual(["mia:mouth.open", "mia:mouth.smile"]);
  });

  it.each([
    ["a show with no target", `\nscene start\n  [[mia:mouth.smile]]\n  Mia smiles.\n  [[mia:mouth.frown]]\n  Then she does not.\nend\n`],
    ["a jump between the shows", `\nscene start\n  [[show portrait mia:mouth.smile]]\n  Mia smiles.\n  -> other\nend\n\nscene other\n  [[show portrait mia:mouth.frown]]\n  Then she does not.\nend\n`],
    ["a choice between the shows", `\nscene start\n  [[show portrait mia:mouth.smile]]\n  Mia smiles.\n  choose\n  + Frown\n    [[show portrait mia:mouth.frown]]\n    Then she does not.\n  end\nend\n`],
    ["a condition between the shows", `\nscene start\n  [[show portrait mia:mouth.smile]]\n  Mia smiles.\n  if true then\n    [[show portrait mia:mouth.frown]]\n    Then she does not.\n  end\nend\n`],
    ["a target from a variable", `\nscene start\n  [[show portrait mia:mouth.smile]]\n  Mia smiles.\n  [[show $place mia:mouth.frown]]\n  Then she does not.\nend\n`],
    ["options from a variable", `\nscene start\n  [[show portrait mia:mouth.smile]]\n  Mia smiles.\n  [[show portrait mia:$mood]]\n  Then she does not.\nend\n`],
    ["a hide between the shows", `\nscene start\n  [[show portrait mia:mouth.smile]]\n  Mia smiles.\n  [[hide portrait]]\n  [[show portrait mia:mouth.frown]]\n  Then she does not.\nend\n`],
    ["a beat between the shows", `\nscene start\n  [[show portrait mia:mouth.smile]]\n  Mia smiles.\n  Mia waits.\n  [[show portrait mia:mouth.frown]]\n  Then she does not.\nend\n`],
    ["two shows in one beat", `\nscene start\n  [[show portrait mia:mouth.smile]] [[show portrait mia:mouth.frown]]\n  Then she does not.\nend\n`],
    ["a jump at the end of the line between the shows", `\nscene start\n  [[show portrait mia:mouth.smile]]\n  First. -> elsewhere\n  [[show portrait mia:mouth.frown]]\n  Second.\nend\n\nscene elsewhere\n  Arrived.\nend\n`],
    ["a target only a layout the game never opens holds", `\nlayout unused {\n  ghost\n}\n\nscene start\n  [[show ghost mia:mouth.smile]]\n  Mia smiles.\n  [[show ghost mia:mouth.frown]]\n  Then she does not.\nend\n`],
    ["two change morphs that both drive the changed group", `${CHANGE.replace("morph bend", "morph sway")}\nscene start\n  [[show portrait mia:mouth.smile]]\n  Mia smiles.\n  [[show portrait mia:mouth.frown]]\n  Then she does not.\nend\n`],
  ])("%s is not a certain pair, so nothing is baked", (_case, scene) => {
    expect(compile(`${CHANGE}${scene}`).morphChanges).toBeUndefined();
  });

  it("emphasis and a dialogue cue in the lines of text keep the pair certain", () => {
    const program = compile(`${CHANGE}\nscene start\n  [[show portrait mia:mouth.smile]]\n  Mia *smiles*, "quietly" -- (a lot)!\n  [[show portrait mia:mouth.frown]]\n  MIA (softly): Then she does not.\nend\n`);
    expect(program.morphChanges?.map(({ variant }: any) => variant)).toEqual(["mia:mouth.frown"]);
  });
});
