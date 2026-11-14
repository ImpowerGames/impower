import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";

const main = "file:///project/main.sd";
const source = "scene start\n  A <b2>word</b2> and <b>bold</b> here.\nend\n";

function compiled() {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: main, type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" }],
  });
  return compiler.compile({ textDocument: { uri: main } }).program;
}

function workspace() {
  const ws = Object.create(SparkdownLanguageServerWorkspace.prototype) as SparkdownLanguageServerWorkspace;
  Object.assign(ws, {
    _documents: new SparkdownDocumentRegistry([]),
    _scriptFilePattern: /\.sd$/,
    _imageFilePattern: /\.svg$/,
    _documentVersions: new Map([[main, 1]]),
    _lastPublishedDiagnostics: new Map(),
    _lastFormattedText: new Map(),
    _watchedFiles: new Map([[main, {}]]),
    _programStates: new Map(),
    _entryPrograms: new Map(),
    sendNotification: vi.fn(),
    sendRequest: vi.fn(),
  });
  return ws;
}

describe("the language server publishes the unknown-tag warning both editors show (#2145)", () => {
  it("publishes a warning on <b2> and </b2> and none on <b>", () => {
    const ws = workspace();
    ws.onCompiledTextDocument({ textDocument: { uri: main }, program: compiled() });
    const published = vi
      .mocked(ws.sendNotification)
      .mock.calls.filter(([method]) => method === "textDocument/publishDiagnostics")
      .map(([, params]) => params as any)
      .filter((params) => params.uri === main)
      .at(-1);
    const line = source.split("\n")[1]!;
    const tags = (published?.diagnostics ?? [])
      .filter((d: any) => String(d.message?.value ?? d.message).startsWith("Unknown tag"))
      .map((d: any) => ({
        severity: d.severity,
        text: line.slice(d.range.start.character, d.range.end.character),
        line: d.range.start.line,
      }));
    expect(tags).toEqual([
      { severity: 2, text: "<b2>", line: 1 },
      { severity: 2, text: "</b2>", line: 1 },
    ]);
  });
});
