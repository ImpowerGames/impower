import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import type { File } from "@impower/sparkdown/src/compiler/types/File";
import { describe, expect, it, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";

const mainA = "file:///workspace/alpha/main.sd";
const mainB = "file:///workspace/beta/main.sd";
const forestA = "file:///workspace/alpha/assets/forest.png";
const forestB = "file:///workspace/beta/assets/forest.png";

const script = (uri: string): File => ({
  uri, type: "script", name: "main", ext: "sd", text: "", version: 1, languageId: "sparkdown",
});
const image = (uri: string): File => ({
  uri, type: "image", name: "forest", ext: "png", src: `${uri}?v=1`,
});

function setup() {
  const workspace = Object.create(SparkdownLanguageServerWorkspace.prototype) as SparkdownLanguageServerWorkspace;
  Object.assign(workspace, {
    _documents: new SparkdownDocumentRegistry([]),
    _scriptFilePattern: /\.sd$/,
    _imageFilePattern: /\.png$/,
    _documentVersions: new Map([[mainA, 1], [mainB, 1]]),
    _lastPublishedDiagnostics: new Map(),
    _lastFormattedText: new Map(),
    _watchedFiles: new Map([[mainA, {}], [mainB, {}], [forestA, {}], [forestB, {}]]),
    _programStates: new Map(),
    _entryPrograms: new Map(),
    _connection: new Proxy({}, { get: () => () => ({ dispose() {} }) }),
    sendNotification: vi.fn(), sendRequest: vi.fn(),
  });
  const published = (uri: string) =>
    vi.mocked(workspace.sendNotification).mock.calls
      .filter(([method, params]) => method === "textDocument/publishDiagnostics" && (params as any).uri === uri)
      .flatMap(([, params]) => (params as any).diagnostics as any[]);
  return { workspace, published };
}

const collisions = (diagnostics: any[]) =>
  diagnostics.filter((d) => String(d.message?.value ?? d.message).includes("Asset name collision"));

describe("asset collisions across projects in one workspace", () => {
  it.each([[mainA, mainB], [mainB, mainA]])("publishes no collision for a name two projects share (first: %s)", (first, second) => {
    const compiler = new SparkdownCompiler();
    compiler.configure({ files: [script(mainA), script(mainB), image(forestA), image(forestB)] });
    const { workspace, published } = setup();
    for (const entry of [first, second]) {
      const program = compiler.compile({ textDocument: { uri: entry } }).program;
      workspace.onCompiledTextDocument({ textDocument: { uri: entry }, program });
    }
    expect(collisions(published(forestA))).toEqual([]);
    expect(collisions(published(forestB))).toEqual([]);
  });

  it("still publishes a collision between two files of one project", () => {
    const otherForestA = "file:///workspace/alpha/backgrounds/forest.png";
    const compiler = new SparkdownCompiler();
    compiler.configure({ files: [script(mainA), script(mainB), image(forestA), image(otherForestA), image(forestB)] });
    const { workspace, published } = setup();
    for (const entry of [mainA, mainB]) {
      const program = compiler.compile({ textDocument: { uri: entry } }).program;
      workspace.onCompiledTextDocument({ textDocument: { uri: entry }, program });
    }
    expect(collisions(published(forestA))).toHaveLength(1);
    expect(collisions(published(otherForestA))).toHaveLength(1);
    expect(collisions(published(forestB))).toEqual([]);
  });
});
