// Pulls the editor starts on its own while the language server is still
// starting (#1785). On a cold load the server answers a document's first
// pulls only once its compiler is ready, which can take longer than the
// client's request timeout. Nothing awaits those pulls, so a timeout must not
// surface as an uncaught rejection, and the document must still get its
// result: the timed-out pull is asked again, and a refresh that arrived while
// it was in flight is not lost when it fails.
import { foldable } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  LSPClient,
  serverAutoSync,
  serverCodeLenses,
  serverDiagnostics,
  serverFolding,
} from "@impower/codemirror-vscode-lsp-client/src";
import { coalesceRequest } from "@impower/codemirror-vscode-lsp-client/src/requestCoalescer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const URI = "file:///main.sd";
const TIMEOUT_MS = 20;

interface PendingRequest {
  id: string;
  method: string;
  params: any;
}

/** A transport the test answers by hand, or never. */
class StandInServer {
  handler?: (value: object) => void;
  requests: PendingRequest[] = [];

  send(message: string) {
    const m = JSON.parse(message);
    if ("id" in m && "method" in m) this.requests.push(m);
  }
  subscribe(handler: (value: object) => void) {
    this.handler = handler;
  }
  unsubscribe() {}

  pending(method: string) {
    return this.requests.filter((r) => r.method === method);
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

function mount(doc: string, server: StandInServer) {
  const client = new LSPClient({
    timeout: TIMEOUT_MS,
    extensions: [
      serverFolding(),
      serverDiagnostics(),
      serverCodeLenses(),
      serverAutoSync(),
    ],
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

const DOC = ["# One", "a line", "another line", "# Two", "b line"].join("\n");

describe("pulls that outlive the request timeout on a cold start", () => {
  it("leaves no uncaught rejection and asks again until the server answers", async () => {
    const server = new StandInServer();
    const view = mount(DOC, server);
    await wait(0);
    expect(server.pending("textDocument/foldingRange")).toHaveLength(1);
    expect(server.pending("textDocument/diagnostic")).toHaveLength(1);
    expect(server.pending("textDocument/codeLens")).toHaveLength(1);

    // The server is still configuring its compiler: the first pulls time out.
    await wait(TIMEOUT_MS * 2.5);
    expect(uncaught.map(String)).toEqual([]);
    const folding = server.pending("textDocument/foldingRange");
    const diagnostic = server.pending("textDocument/diagnostic");
    expect(folding.length).toBeGreaterThan(1);
    expect(diagnostic.length).toBeGreaterThan(1);
    expect(server.pending("textDocument/codeLens").length).toBeGreaterThan(1);

    // The server is ready now and answers the latest pull, in time.
    server.answer(folding.at(-1)!, [{ startLine: 0, endLine: 2 }]);
    server.answer(diagnostic.at(-1)!, { kind: "full", items: [] });
    server.answer(server.pending("textDocument/codeLens").at(-1)!, []);
    await wait(0);
    const line = view.state.doc.line(1);
    expect(foldable(view.state, line.from, line.to)).toEqual({
      from: line.to,
      to: view.state.doc.line(3).to,
    });

    // A pull the server never answers stops being asked after a few tries,
    // still without an uncaught rejection.
    await wait(TIMEOUT_MS * 6);
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
    // A refresh arrives while the first pull is still waiting on the server.
    await coalesceRequest(scope, "key", run);
    rejectFirst(new Error("Request timed out"));
    await first.catch(() => {});
    expect(runs).toBe(2);
  });
});
