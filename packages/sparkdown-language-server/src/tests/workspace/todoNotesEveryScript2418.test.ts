import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";

const lines = (...text: string[]) => text.join(String.fromCharCode(10)) + String.fromCharCode(10);

const main = "file:///project/main.sd";
const notes = "file:///project/notes.sd";
const broken = "file:///project/broken.sd";
const quiet = "file:///project/quiet.sd";

const texts: Record<string, string> = {
  [main]: lines("scene start", "  Hello.", "end"),
  [notes]: lines("// TODO: write the ending", "scene ending", "  Bye.", "end"),
  [broken]: lines("scene broken", "  -> nowhere", "end"),
  [quiet]: lines("scene quiet", "  Hush.", "end"),
};

const files = () =>
  Object.entries(texts).map(([uri, text]) => ({
    uri,
    type: "script",
    name: uri.slice(uri.lastIndexOf("/") + 1, -3),
    ext: "sd",
    text,
    version: 1,
    languageId: "sparkdown",
  }));

function compiled() {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: files() });
  return compiler.compile({ textDocument: { uri: main } }).program;
}

function workspace(opened: string[]) {
  const ws = Object.create(SparkdownLanguageServerWorkspace.prototype) as SparkdownLanguageServerWorkspace;
  Object.assign(ws, {
    _documents: new SparkdownDocumentRegistry([]),
    _scriptFilePattern: /\.sd$/,
    _imageFilePattern: /\.svg$/,
    _documentVersions: new Map(opened.map((uri) => [uri, 1])),
    _lastPublishedDiagnostics: new Map(),
    _lastFormattedText: new Map(),
    _watchedFiles: new Map(Object.keys(texts).map((uri) => [uri, {}])),
    _programStates: new Map(),
    _entryPrograms: new Map(),
    sendNotification: vi.fn(),
    sendRequest: vi.fn(),
  });
  ws.loadDocuments({ files: files() });
  return ws;
}

const published = (ws: SparkdownLanguageServerWorkspace) => {
  const last = new Map<string, any[]>();
  for (const [method, params] of vi.mocked(ws.sendNotification).mock.calls) {
    if (method !== "textDocument/publishDiagnostics") continue;
    const { uri, diagnostics } = params as any;
    last.set(uri, diagnostics);
  }
  return last;
};

const summary = (diagnostics: any[] | undefined) =>
  (diagnostics ?? []).map((d) => ({ severity: d.severity, source: d.source, message: String(d.message?.value ?? d.message) }));

describe("TODO notes are published for every script in the project (#2418)", () => {
  it("publishes a note-only script that was loaded but never opened, as it does once opened", () => {
    const program = compiled();
    const unopened = workspace([main]);
    unopened.onCompiledTextDocument({ textDocument: { uri: main }, program });
    const afterOpening = workspace([main, notes]);
    afterOpening.onCompiledTextDocument({ textDocument: { uri: main }, program });
    const expected = [{ severity: 3, source: "todo", message: "To do: write the ending" }];
    expect(summary(published(afterOpening).get(notes))).toEqual(expected);
    expect(summary(published(unopened).get(notes))).toEqual(expected);
  });

  it("leaves an unopened script with an error as it was, and sends nothing for a script with nothing to report", () => {
    const program = compiled();
    const ws = workspace([main]);
    ws.onCompiledTextDocument({ textDocument: { uri: main }, program });
    const sent = published(ws);
    const errors = summary(sent.get(broken)).filter((d) => d.severity === 1);
    expect(errors).toEqual([{ severity: 1, source: "sparkdown", message: "target not found: '-> nowhere'" }]);
    expect(summary(program.diagnostics?.[broken]).filter((d) => d.severity === 1)).toHaveLength(1);
    expect(sent.has(quiet)).toBe(false);
  });
});
