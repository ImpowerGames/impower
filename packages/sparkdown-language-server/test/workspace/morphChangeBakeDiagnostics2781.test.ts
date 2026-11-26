import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { getContextEntry } from "@impower/sparkdown/src/compiler/utils/getContextEntry";
import { channelRefs, morphRefsForStruct } from "@impower/sparkdown/src/morph/channel";
import { changeLookName } from "@impower/sparkdown/src/morph/diagnostics";
import { createMorphHost, inlineMorphSource } from "@impower/sparkdown/src/morph/hosts";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../src/classes/SparkdownLanguageServerWorkspace";

const main = "file:///project/main.sd";
const asset = "file:///project/mia.svg";
const other = "file:///project/tom.svg";

const lips = (...ys: number[]) => ys.map((y) => `<path data-name="lip" d="M0,${y} C30,${y + 25} 70,${y + 25} 100,${y}Z"/>`).join("");
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<g data-name="mouth.smile default">${lips(40, 60)}</g>
<g data-name="mouth.frown">${lips(30, 50, 70)}</g>
<g data-name="mouth.open">${lips(45, 65)}</g>
</svg>`;

const CHANGE = `morph bend {\n  method = match\n  timing {\n    trigger = change\n    duration = 0.08\n  }\n}\n`;
const TALK = `morph talk {\n  blend = cut\n  timing { trigger = speech }\n  keyframes {\n    from { mouth { state = smile } }\n    to { mouth { state = open } }\n  }\n}\n`;
const MIA = `define mia as character with\n  name = "Mia"\nend\n`;

const shows = (...looks: string[]) => `\nscene start\n${looks.map((look) => `  [[show portrait ${look}]]\n  Mia speaks.\n`).join("")}end\n`;

function compile(script: string, version = 1, art = SVG): any {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: main, type: "script", name: "main", ext: "sd", text: script, version, languageId: "sparkdown" },
      { uri: asset, type: "image", name: "mia", ext: "svg", data: art },
      { uri: other, type: "image", name: "tom", ext: "svg", data: SVG },
    ],
  } as any);
  return compiler.compile({ textDocument: { uri: main } }).program;
}

function setup() {
  const notifications = new Map<string, (params: any) => any>();
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
    _fileChanges: 0,
    _entryPrograms: new Map(),
    _connection: new Proxy(
      {},
      {
        get: (_target, key) =>
          key === "onNotification"
            ? (method: string, handler: (params: any) => any) => {
                notifications.set(method, handler);
                return { dispose() {} };
              }
            : () => ({ dispose() {} }),
      },
    ),
    sendNotification: vi.fn(),
    sendRequest: vi.fn(),
  });
  workspace.listen();
  const compiled = (program: any) => {
    (workspace as any)._programStates.set(main, { program });
    workspace.onCompiledTextDocument({ textDocument: { uri: main }, program });
  };
  const report = (params: any) => notifications.get("sparkdown/runtimeDiagnostics")!(params);
  const published = (uri: string) =>
    vi
      .mocked(workspace.sendNotification)
      .mock.calls.filter(([method]) => method === "textDocument/publishDiagnostics")
      .map(([, params]) => params as any)
      .filter((p) => p.uri === uri)
      .map((p) => p.diagnostics);
  const morphOn = (uri: string) => (published(uri).at(-1) ?? []).filter((d: any) => String(d.code).startsWith("morph-"));
  return { workspace, compiled, report, published, morphOn };
}

async function playedChange(program: any, fromLook: string, toLook: string) {
  const struct = (name: string) => getContextEntry(program.context, "filtered_image", name) ?? getContextEntry(program.context, "image", name);
  const [ref] = morphRefsForStruct(program.context, program.morphs, struct(toLook), undefined, { struct: struct(fromLook) });
  const inline = inlineMorphSource(() => program.context);
  const host = createMorphHost({
    service: new MorphBakeService(),
    channel: () => program.morphs,
    readSource: async (source, signal) => {
      const read = await inline(source, signal);
      return read ? { text: read.text } : undefined;
    },
  });
  const handle = await host.resolve(ref!);
  expect(handle.artifact.diagnostics.every((d) => d.uri === undefined)).toBe(true);
  const diagnostics = handle.artifact.diagnostics.map(({ code, severity, message, morphs, layer, path }) => ({
    code,
    severity,
    message,
    morphs,
    ...(layer === undefined ? {} : { layer }),
    ...(path === undefined ? {} : { path }),
  }));
  handle.release();
  return {
    program: { uri: main, scripts: { ...program.scripts } },
    diagnostics: {},
    morphBakes: [{ image: ref!.image, source: ref!.source, variant: changeLookName(ref!), diagnostics }],
  };
}

const settleBakes = () => new Promise((resolve) => setTimeout(resolve, 200));

afterEach(() => vi.restoreAllMocks());

describe("a change morph's bake diagnostics", () => {
  it("a played pair's bake problem, returned by the player, is published on the artwork naming the morph and the look", async () => {
    const { compiled, report, morphOn } = setup();
    const program = compile(`${CHANGE}${shows("mia:mouth.smile", "mia:mouth.frown")}`);
    compiled(program);
    report(await playedChange(program, "mia:mouth.smile", "mia:mouth.frown"));
    expect(morphOn(asset)).toEqual([
      expect.objectContaining({
        severity: 2,
        code: "morph-pairing-count",
        source: "sparkdown",
        message: 'Morph `bend` on `mia:mouth.frown` (layer "lip"): "lip" has 2 drawings in one pose and 3 in the other; neither is a single drawing, so they cannot pair and each uses its fallback.',
      }),
    ]);
  }, 60_000);

  it("the pair played again replaces its report rather than adding to it", async () => {
    const { compiled, report, morphOn } = setup();
    const program = compile(`${CHANGE}${shows("mia:mouth.smile", "mia:mouth.frown")}`);
    compiled(program);
    const played = await playedChange(program, "mia:mouth.smile", "mia:mouth.frown");
    report(played);
    report(played);
    expect(morphOn(asset)).toHaveLength(1);
  }, 60_000);

  it("a layered picture's played pair lands each problem on its own layer file", async () => {
    const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">${body}</svg>`;
    const layer = (name: string, body: string) => ({ uri: `file:///project/${name}.svg`, type: "image", name, ext: "svg", data: svg(body) });
    const script = `${CHANGE}\ndefine pip as layered_image with\n  assets = {\n    ["base"] = head,\n    ["mouth.smile default"] = smile,\n    ["mouth.frown"] = frown,\n  }\nend\n${shows("pip:mouth.smile", "pip:mouth.frown")}`;
    const compiler = new SparkdownCompiler();
    compiler.configure({
      files: [
        { uri: main, type: "script", name: "main", ext: "sd", text: script, version: 1, languageId: "sparkdown" },
        layer("head", `<circle cx="50" cy="50" r="45"/>`),
        layer("smile", lips(40, 60)),
        layer("frown", lips(30, 50, 70)),
      ],
    } as any);
    const program = compiler.compile({ textDocument: { uri: main } }).program as any;
    const struct = (name: string) => getContextEntry(program.context, "filtered_image", name);
    const [ref] = morphRefsForStruct(program.context, program.morphs, struct("pip:mouth.frown"), undefined, { struct: struct("pip:mouth.smile") });
    expect(ref?.layered).toBe(true);
    const inline = inlineMorphSource(() => program.context);
    const host = createMorphHost({
      service: new MorphBakeService(),
      channel: () => program.morphs,
      readSource: async (source, signal) => {
        const read = await inline(source, signal);
        return read ? { text: read.text } : undefined;
      },
    });
    const handle = await host.resolve(ref!);
    expect(handle.artifact.status).toBe("live");
    handle.release();
    const problem = (path: string | undefined, message: string) => ({
      code: "unsupported-element",
      severity: "warning" as const,
      message,
      morphs: ["bend"],
      ...(path === undefined ? {} : { path }),
    });
    const { compiled, report, published } = setup();
    compiled(program);
    report({
      program: { uri: main, scripts: { ...program.scripts } },
      diagnostics: {},
      morphBakes: [
        {
          image: ref!.image,
          layered: true,
          source: ref!.source,
          variant: changeLookName(ref!),
          diagnostics: [problem("/0/1", "on the smile"), problem("/0/2", "on the frown"), problem(undefined, "on the picture")],
        },
      ],
    });
    const messages = (uri: string) => (published(uri).at(-1) ?? []).map((d: any) => d.message);
    expect(messages("file:///project/smile.svg")).toEqual(["Morph `bend` on `pip:mouth.frown`: on the smile"]);
    expect(messages("file:///project/frown.svg")).toEqual(["Morph `bend` on `pip:mouth.frown`: on the frown"]);
    expect(messages("file:///project/head.svg")).toEqual(["Morph `bend` on `pip:mouth.frown`: on the picture"]);
  }, 60_000);

  it("a report of a bake from artwork since changed is ignored, however late it arrives", async () => {
    const { workspace, compiled, report, morphOn } = setup();
    const script = `${CHANGE}${shows("mia:mouth.smile", "mia:mouth.frown")}`;
    const program = compile(script);
    compiled(program);
    const played = await playedChange(program, "mia:mouth.smile", "mia:mouth.frown");
    report(played);
    expect(morphOn(asset)).toHaveLength(1);
    const fixed = SVG.replace(lips(30, 50, 70), lips(30, 50));
    workspace.onChangedFile({ uri: asset, name: "mia", ext: "svg", type: "image", text: fixed });
    compiled(compile(script, 1, fixed));
    expect(morphOn(asset)).toEqual([]);
    report(played);
    expect(morphOn(asset)).toEqual([]);
  }, 60_000);

  it("a report arriving after the artwork is saved and before its compile shows nothing", async () => {
    const { workspace, compiled, report, morphOn } = setup();
    const program = compile(`${CHANGE}${shows("mia:mouth.smile", "mia:mouth.frown")}`);
    compiled(program);
    const played = await playedChange(program, "mia:mouth.smile", "mia:mouth.frown");
    report(played);
    expect(morphOn(asset)).toHaveLength(1);
    const fixed = SVG.replace(lips(30, 50, 70), lips(30, 50));
    (workspace as any)._watchedFiles.set(asset, { uri: asset, text: fixed });
    workspace.onChangedFile({ uri: asset, name: "mia", ext: "svg", type: "image", text: fixed });
    report(played);
    expect(morphOn(asset)).toEqual([]);
    expect(workspace.getDiagnostics(program, asset).filter((d: any) => String(d.code).startsWith("morph-"))).toEqual([]);
  }, 60_000);

  it("an entry with no source to check against the artwork is ignored", async () => {
    const { compiled, report, morphOn } = setup();
    const program = compile(`${CHANGE}${shows("mia:mouth.smile", "mia:mouth.frown")}`);
    compiled(program);
    const played = await playedChange(program, "mia:mouth.smile", "mia:mouth.frown");
    report({ ...played, morphBakes: played.morphBakes.map(({ source: _source, ...bake }) => bake) });
    expect(morphOn(asset)).toEqual([]);
  }, 60_000);

  it("an entry whose image the compiled program does not hold is ignored", async () => {
    const { compiled, report, morphOn } = setup();
    const program = compile(`${CHANGE}${shows("mia:mouth.smile", "mia:mouth.frown")}`);
    compiled(program);
    const played = await playedChange(program, "mia:mouth.smile", "mia:mouth.frown");
    report({ ...played, morphBakes: played.morphBakes.map((bake) => ({ ...bake, image: "nobody" })) });
    expect(morphOn(asset)).toEqual([]);
  }, 60_000);

  it("a report from a program other than the one compiled is ignored", async () => {
    const { compiled, report, morphOn } = setup();
    const program = compile(`${CHANGE}${shows("mia:mouth.smile", "mia:mouth.frown")}`);
    compiled(program);
    const played = await playedChange(program, "mia:mouth.smile", "mia:mouth.frown");
    report({ ...played, program: { uri: main, scripts: { [main]: 7 } } });
    expect(morphOn(asset)).toEqual([]);
  }, 60_000);

  it("a line preview's report of the same program keeps the played pair, once", async () => {
    const { compiled, report, morphOn } = setup();
    const program = compile(`${CHANGE}${shows("mia:mouth.smile", "mia:mouth.frown")}`);
    compiled(program);
    const played = await playedChange(program, "mia:mouth.smile", "mia:mouth.frown");
    report(played);
    report({
      ...played,
      diagnostics: { [main]: [{ severity: 2, message: "careful", range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } }, source: "runtime" }] },
    });
    expect(morphOn(asset)).toHaveLength(1);
  }, 60_000);

  it("is cleared when a run of a different compiled program reports", async () => {
    const { compiled, report, morphOn } = setup();
    const program = compile(`${CHANGE}${shows("mia:mouth.smile", "mia:mouth.frown")}`);
    compiled(program);
    report(await playedChange(program, "mia:mouth.smile", "mia:mouth.frown"));
    expect(morphOn(asset)).toHaveLength(1);
    report({ program: { uri: main, scripts: { [main]: 2 } }, diagnostics: {} });
    expect(morphOn(asset)).toEqual([]);
  }, 60_000);

  it("is cleared when the script changes", async () => {
    const { workspace, compiled, report, morphOn } = setup();
    const program = compile(`${CHANGE}${shows("mia:mouth.smile", "mia:mouth.frown")}`);
    compiled(program);
    report(await playedChange(program, "mia:mouth.smile", "mia:mouth.frown"));
    expect(morphOn(asset)).toHaveLength(1);
    (workspace as any)._documentVersions.set(main, 2);
    compiled(compile(`${CHANGE}${shows("mia:mouth.smile", "mia:mouth.frown")}\n`, 2));
    expect(morphOn(asset)).toEqual([]);
  }, 60_000);

  it("is cleared when the artwork changes", async () => {
    const { workspace, compiled, report, morphOn } = setup();
    const program = compile(`${CHANGE}${shows("mia:mouth.smile", "mia:mouth.frown")}`);
    compiled(program);
    report(await playedChange(program, "mia:mouth.smile", "mia:mouth.frown"));
    expect(morphOn(asset)).toHaveLength(1);
    workspace.onChangedFile({ uri: asset, name: "mia", ext: "svg", type: "image", text: SVG });
    compiled(program);
    expect(morphOn(asset)).toEqual([]);
  }, 60_000);

  it.each([
    ["the ticket's pair, shown and never played", `${CHANGE}${shows("mia:mouth.smile", "mia:mouth.frown")}`],
    ["a pair whose directives turn the speech morph off", `${CHANGE}${TALK}${shows("mia:mouth.smile morph none", "mia:mouth.frown morph none")}`],
    ["a character's own portrait with a speech morph", `${MIA}${CHANGE}${TALK}${shows("mia:mouth.smile", "mia:mouth.frown")}`],
    ["a portrait replaced on its target", `${CHANGE}${shows("mia:mouth.smile", "tom:mouth.smile", "mia:mouth.frown")}`],
    ["a jump at the end of the line between the shows", `${CHANGE}\nscene start\n  [[show portrait mia:mouth.smile]]\n  First. -> elsewhere\n  [[show portrait mia:mouth.frown]]\n  Second.\nend\n\nscene elsewhere\n  Arrived.\nend\n`],
    ["a target only an unopened layout holds", `${CHANGE}\nlayout unused {\n  ghost\n}\n\nscene start\n  [[show ghost mia:mouth.smile]]\n  Mia smiles.\n  [[show ghost mia:mouth.frown]]\n  Then she does not.\nend\n`],
    ["two change morphs driving the changed group", `${CHANGE}${CHANGE.replace("morph bend", "morph sway")}${shows("mia:mouth.smile", "mia:mouth.frown")}`],
    ["a target nested in a text area", `${CHANGE}\nlayout main {\n  textarea {\n    ghost { image }\n  }\n}\n\nscene start\n  [[show ghost mia:mouth.smile]]\n  First.\n  [[show ghost mia:mouth.frown]]\n  Second.\nend\n`],
  ])("%s: a compile with no play bakes no change pair and reports none", async (_case, script) => {
    const request = vi.spyOn(MorphBakeService.prototype, "request");
    const { compiled, morphOn } = setup();
    const program = compile(script);
    compiled(program);
    await settleBakes();
    const compiledKeys = new Set(channelRefs(program.morphs).map(({ ref }) => ref.key));
    expect(request.mock.calls.map(([key]) => key).filter((key) => !compiledKeys.has(key))).toEqual([]);
    expect(morphOn(asset).filter((d: any) => String(d.message).includes("Morph `bend`"))).toEqual([]);
  }, 60_000);
});
