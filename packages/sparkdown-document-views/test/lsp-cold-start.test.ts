// Pulls the editor starts on its own while the language server is still
// starting (#1785). On a cold load the server answers a document's first
// pulls only once its compiler is ready, which can take longer than the
// client's request timeout. Nothing awaits those pulls, so a timeout must not
// surface as an uncaught rejection, and the document must still get its
// result: the timed-out pull is asked again, a bounded number of times and
// only while the document is still at the version it pulled; a refresh that
// arrived while it was in flight is not lost when it fails; and a late answer
// for an older version never replaces a newer one.
import { foldable } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  LSPClient,
  type LSPClientExtension,
  serverAutoSync,
  serverCodeLenses,
  serverDiagnostics,
  serverDocumentSymbols,
  serverFolding,
} from "@impower/codemirror-vscode-lsp-client/src";
import { coalesceRequest } from "@impower/codemirror-vscode-lsp-client/src/requestCoalescer";
import { documentSymbolsField } from "@impower/codemirror-vscode-lsp-client/src/symbols";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const URI = "file:///main.sd";
// Long enough that the half-timeout margins below outlast timer jitter: a
// request answered after it expired would make a test pass or fail for the
// wrong reason.
const TIMEOUT_MS = 60;

interface PendingRequest {
  id: string;
  method: string;
  params: any;
}

/** A transport the test answers by hand, or never. */
class StandInServer {
  handler?: (value: object) => void;
  /** Every request the client sent. */
  sent: PendingRequest[] = [];
  /** The requests not answered yet. */
  requests: PendingRequest[] = [];

  send(message: string) {
    const m = JSON.parse(message);
    if ("id" in m && "method" in m) {
      this.sent.push(m);
      this.requests.push(m);
    }
  }
  subscribe(handler: (value: object) => void) {
    this.handler = handler;
  }
  unsubscribe() {}

  pending(method: string) {
    return this.requests.filter((r) => r.method === method);
  }

  asked(method: string) {
    return this.sent.filter((r) => r.method === method).length;
  }

  answer(request: PendingRequest, result: unknown) {
    this.requests = this.requests.filter((r) => r !== request);
    this.handler!({ jsonrpc: "2.0", id: request.id, result });
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const views: EditorView[] = [];
let uncaught: unknown[] = [];
const onUncaught = (reason: unknown) => {
  uncaught.push(reason);
};

beforeEach(() => {
  uncaught = [];
  process.on("unhandledRejection", onUncaught);
});

afterEach(() => {
  process.off("unhandledRejection", onUncaught);
  for (const view of views.splice(0)) view.destroy();
});

function mount(
  doc: string,
  server: StandInServer,
  extensions: LSPClientExtension[] = [
    serverFolding(),
    serverDiagnostics(),
    serverCodeLenses(),
  ],
) {
  const client = new LSPClient({
    timeout: TIMEOUT_MS,
    // Edits reach the server at once, as in the editor's own client.
    extensions: [...extensions, serverAutoSync({ delay: 0 })],
  }).connect(server, undefined, {
    capabilities: { textDocumentSync: 2, foldingRangeProvider: true },
  });
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [client.plugin({ uri: URI, version: 0 })],
    }),
    parent: document.body,
  });
  views.push(view);
  return view;
}

const DOC = ["# One", "a line", "another line", "# Two", "b line"].join(
  String.fromCharCode(10),
);

const FEATURES = [
  "textDocument/foldingRange",
  "textDocument/diagnostic",
  "textDocument/codeLens",
];

function symbol(name: string) {
  const range = {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 3 },
  };
  return [{ name, kind: 2, range, selectionRange: range }];
}

function symbolNames(view: EditorView) {
  return view.state.field(documentSymbolsField).map((s) => s.name);
}

describe("pulls that outlive the request timeout on a cold start", () => {
  it("leaves no uncaught rejection and asks again until the server answers", async () => {
    const server = new StandInServer();
    const view = mount(DOC, server);
    await wait(0);
    for (const method of FEATURES) expect(server.asked(method)).toBe(1);

    // The server is still configuring its compiler: the first pulls time out
    // and each is asked again.
    await wait(TIMEOUT_MS * 1.5);
    expect(uncaught.map(String)).toEqual([]);
    for (const method of FEATURES) expect(server.asked(method)).toBe(2);

    // The server is ready now and answers the latest pull, in time.
    server.answer(
      server.pending("textDocument/foldingRange").at(-1)!,
      [{ startLine: 0, endLine: 2 }],
    );
    server.answer(server.pending("textDocument/diagnostic").at(-1)!, {
      kind: "full",
      items: [],
    });
    server.answer(server.pending("textDocument/codeLens").at(-1)!, []);
    await wait(0);
    const line = view.state.doc.line(1);
    expect(foldable(view.state, line.from, line.to)).toEqual({
      from: line.to,
      to: view.state.doc.line(3).to,
    });

    // Nothing is asked again once the answers have arrived.
    await wait(TIMEOUT_MS * 3);
    for (const method of FEATURES) expect(server.asked(method)).toBe(2);
    expect(uncaught.map(String)).toEqual([]);
  });

  it("stops asking after three attempts at a server that never answers", async () => {
    const server = new StandInServer();
    mount(DOC, server);
    await wait(TIMEOUT_MS * 4);
    for (const method of FEATURES) expect(server.asked(method)).toBe(3);
    await wait(TIMEOUT_MS * 3);
    for (const method of FEATURES) expect(server.asked(method)).toBe(3);
    expect(uncaught.map(String)).toEqual([]);
  });

  it("never lets a late answer for an older version replace a newer result", async () => {
    const server = new StandInServer();
    const view = mount("OLD", server, [serverDocumentSymbols()]);
    await wait(0);
    // The first pull times out and is asked again for the same version.
    await wait(TIMEOUT_MS * 1.5);
    const [, retry] = server.pending("textDocument/documentSymbol");
    expect(retry).toBeDefined();

    // The author edits; the edit's own pull is answered first.
    view.dispatch({ changes: { from: 0, to: 3, insert: "NEW" } });
    await wait(0);
    const latest = server.pending("textDocument/documentSymbol").at(-1)!;
    expect(latest).not.toBe(retry);
    server.answer(latest, symbol("NEW"));
    await wait(0);
    expect(symbolNames(view)).toEqual(["NEW"]);

    // The retry for the older version answers late, within its own timeout.
    server.answer(retry!, symbol("OLD"));
    await wait(0);
    expect(symbolNames(view)).toEqual(["NEW"]);
  });

  it("does not ask again for a version the author has already edited past", async () => {
    const server = new StandInServer();
    const view = mount("OLD", server, [serverDocumentSymbols()]);
    await wait(0);
    view.dispatch({ changes: { from: 0, to: 3, insert: "NEW" } });
    await wait(0);
    expect(server.asked("textDocument/documentSymbol")).toBe(2);
    server.answer(
      server.pending("textDocument/documentSymbol").at(-1)!,
      symbol("NEW"),
    );
    // The pull for the older version times out; the edit already pulled.
    await wait(TIMEOUT_MS * 3);
    expect(server.asked("textDocument/documentSymbol")).toBe(2);
    expect(symbolNames(view)).toEqual(["NEW"]);
    expect(uncaught.map(String)).toEqual([]);
  });

  it("runs a pull a refresh asked for while the failing pull was in flight", async () => {
    const scope = {};
    let runs = 0;
    let rejectFirst!: (reason: unknown) => void;
    const run = () => {
      runs++;
      return runs === 1
        ? new Promise<void>((_, reject) => (rejectFirst = reject))
        : Promise.resolve();
    };
    const first = coalesceRequest(scope, "key", run);
    // A refresh arrives while the first pull is still waiting on the server;
    // it settles with the pull it asked for.
    const refresh = coalesceRequest(scope, "key", run);
    rejectFirst(new Error("Request timed out"));
    await expect(refresh).resolves.toBeUndefined();
    await expect(first).resolves.toBeUndefined();
    expect(runs).toBe(2);
  });

  it("gives a caller that joined a failing pull its failure", async () => {
    const scope = {};
    const failure = new Error("Request timed out");
    let rejectRun!: (reason: unknown) => void;
    let runs = 0;
    const run = () => {
      runs++;
      return new Promise<void>((_, reject) => (rejectRun = reject));
    };
    const first = coalesceRequest(scope, "key", run);
    const joined = coalesceRequest(scope, "key", run);
    // The first run fails with a re-pull queued, so the re-pull runs; it
    // fails too, and both callers see that.
    rejectRun(failure);
    await wait(0);
    rejectRun(failure);
    await expect(joined).rejects.toBe(failure);
    await expect(first).rejects.toBe(failure);
    expect(runs).toBe(2);
  });
});
