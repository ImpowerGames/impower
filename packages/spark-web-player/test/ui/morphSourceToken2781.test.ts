import { describe, expect, test, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import type { File } from "@impower/sparkdown/src/compiler/types/File";
import { changeLookName } from "@impower/sparkdown/src/morph/diagnostics";
import type { MorphRef } from "@impower/sparkdown/src/morph/types";
import { ImageVocabularyCache, imageFileForCompiler } from "@impower/sparkdown/src/workspace/utils/prepareImageFile";
import { SparkdownLanguageServerWorkspace } from "../../../sparkdown-language-server/src/classes/SparkdownLanguageServerWorkspace";
import { MorphPlayback } from "../../src/app/morph/MorphPlayback";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

const lips = (...ys: number[]) => ys.map((y) => `<path data-name="lip" d="M10,${y} C30,${y + 25} 70,${y + 25} 90,${y}Z"/>`).join("");
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">${body}</svg>`;
const FACE = svg(`<g data-name="mouth.smile default">${lips(40, 60)}</g><g data-name="mouth.frown">${lips(30, 50, 70)}</g>`);

const CHANGE = `morph bend {\n  method = match\n  timing {\n    trigger = change\n    duration = 0.08\n  }\n}\n`;
const PIP = `define pip as layered_image with\n  assets = {\n    ["base"] = head,\n    ["mouth.smile default"] = smile,\n    ["mouth.frown"] = frown,\n  }\nend\n`;
const shows = (image: string) =>
  `\nscene start\n  [[show portrait ${image}:mouth.smile]]\n  First.\n  [[show portrait ${image}:mouth.frown]]\n  Second.\nend\n`;

const MAIN = "inmemory:///main.sd";
const PROBLEM = { code: "pairing-count", severity: "warning" as const, message: "a problem", morphs: ["bend"] };

type Raw = { uri: string; name: string; text: string; version?: number };
const path = (raw: Raw) => raw.uri.slice("inmemory:///".length);

interface Host {
  name: string;
  strip: boolean;
  playerSrc: (raw: Raw) => string;
  serverSrc: (raw: Raw) => string | undefined;
}

const WEB: Host = {
  name: "the web editor (both sides strip image data)",
  strip: true,
  playerSrc: (raw) => `/file:/local/${path(raw)}?v=1-${raw.version ?? 1}`,
  serverSrc: (raw) => `/file:/local/${path(raw)}?v=1-${raw.version ?? 1}`,
};
const VSCODE: Host = {
  name: "the VS Code extension (neither side strips)",
  strip: false,
  playerSrc: (raw) => `https://file+.vscode-resource.vscode-cdn.net/project/${path(raw)}`,
  serverSrc: () => undefined,
};


const prepare = (raw: Raw, src: string | undefined, strip: boolean): File =>
  imageFileForCompiler(
    new ImageVocabularyCache().prepare({ uri: raw.uri, type: "image", name: raw.name, ext: "svg", text: raw.text, version: raw.version ?? 1, ...(src === undefined ? {} : { src }) } as File),
    strip,
  );

async function engineRefs(script: string, files: File[]): Promise<MorphRef[]> {
  const h = createDOMHarness(script, 0, { files: files as unknown as Record<string, unknown>[] });
  const refs: MorphRef[] = [];
  const playback = MorphPlayback.for(h.overlay);
  playback.configure({
    host: {
      resolve: (ref) => {
        if (ref.recipes) refs.push(ref);
        return Promise.reject(new Error("no bake in this test"));
      },
    },
    seed: "test",
    requestFrame: () => 0,
    cancelFrame: () => {},
  });
  await h.ready;
  h.jumpTo("start");
  for (let beat = 0; beat < 2; beat++) {
    await h.display(h.nextBeat()!, false);
    await flushMicrotasks(10);
    await new Promise((resolve) => setTimeout(resolve, 50));
    playback.advance(1);
  }
  for (let i = 0; i < 200 && refs.length === 0; i++) await new Promise((resolve) => setTimeout(resolve, 5));
  return refs;
}

function serverPublishes(script: string, files: File[], ref: MorphRef, source: string | undefined) {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [{ uri: MAIN, type: "script", name: "main", ext: "sd", text: script, version: 1, languageId: "sparkdown" }, ...files] } as any);
  const program = compiler.compile({ textDocument: { uri: MAIN } }).program as any;
  const workspace = Object.create(SparkdownLanguageServerWorkspace.prototype) as SparkdownLanguageServerWorkspace;
  Object.assign(workspace, {
    _documents: new SparkdownDocumentRegistry([]),
    _scriptFilePattern: /\.sd$/,
    _imageFilePattern: /\.svg$/,
    _documentVersions: new Map([[MAIN, 1]]),
    _lastPublishedDiagnostics: new Map(),
    _lastFormattedText: new Map(),
    _watchedFiles: new Map(),
    _programStates: new Map(),
    _fileChanges: 0,
    _entryPrograms: new Map(),
    sendNotification: vi.fn(),
    sendRequest: vi.fn(),
  });
  (workspace as any)._programStates.set(MAIN, { program });
  workspace.onCompiledTextDocument({ textDocument: { uri: MAIN }, program });
  workspace.reportRuntimeDiagnostics({
    program: { uri: MAIN, scripts: { ...program.scripts } },
    diagnostics: {},
    morphBakes: [{ image: ref.image, ...(ref.layered ? { layered: true as const } : {}), ...(source === undefined ? {} : { source }), variant: changeLookName(ref), diagnostics: [PROBLEM] }],
  });
  const published = new Map<string, string[]>();
  for (const [method, params] of vi.mocked(workspace.sendNotification).mock.calls as any[]) {
    if (method !== "textDocument/publishDiagnostics") continue;
    published.set(params.uri, params.diagnostics.filter((d: any) => String(d.code).startsWith("morph-")).map((d: any) => d.message));
  }
  return published;
}

const single = (raw: Raw[]) => ({ script: `${CHANGE}${shows("mia")}`, raw, artwork: raw[0]!.uri });
const CASES: { name: string; script: string; raw: Raw[]; artwork: string }[] = [
  { name: "an image file", ...single([{ uri: "inmemory:///mia.svg", name: "mia", text: FACE }]) },
  { name: "an image file moved to another folder", ...single([{ uri: "inmemory:///portraits/mia.svg", name: "mia", text: FACE }]) },
  { name: "an image file re-saved with identical bytes", ...single([{ uri: "inmemory:///mia.svg", name: "mia", text: FACE, version: 2 }]) },
  {
    name: "a layered picture's layer files",
    script: `${CHANGE}${PIP}${shows("pip")}`,
    raw: [
      { uri: "inmemory:///head.svg", name: "head", text: svg(`<circle cx="50" cy="50" r="45"/>`) },
      { uri: "inmemory:///smile.svg", name: "smile", text: svg(lips(40, 60)) },
      { uri: "inmemory:///frown.svg", name: "frown", text: svg(lips(30, 50, 70)) },
    ],
    artwork: "inmemory:///head.svg",
  },
];

describe("the engine's source token for a played change pair equals the language server's (#2781)", () => {
  for (const host of [WEB, VSCODE]) {
    for (const c of CASES) {
      test(`${c.name}, in ${host.name}`, async () => {
        const playerFiles = c.raw.map((raw) => prepare(raw, host.playerSrc(raw), host.strip));
        const serverFiles = c.raw.map((raw) => prepare(raw, host.serverSrc(raw), host.strip));
        const [ref] = await engineRefs(c.script, playerFiles);
        expect(ref?.source).toEqual(expect.any(String));
        expect(serverPublishes(c.script, serverFiles, ref!, ref!.source).get(c.artwork)).toEqual([
          `Morph \`bend\` on \`${changeLookName(ref!)}\`: a problem`,
        ]);
      });
    }
  }

  test("an entry whose token differs from the artwork the server holds shows the author nothing", async () => {
    const raw = { uri: "inmemory:///mia.svg", name: "mia", text: FACE };
    const script = `${CHANGE}${shows("mia")}`;
    const [ref] = await engineRefs(script, [prepare(raw, WEB.playerSrc(raw), true)]);
    const changed = prepare({ ...raw, text: FACE.replace(lips(30, 50, 70), lips(30, 50)) }, "/file:/local/mia.svg?v=1-2", true);
    expect(serverPublishes(script, [changed], ref!, ref!.source).get(raw.uri) ?? []).toEqual([]);
  });
});
