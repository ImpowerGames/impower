import { foldable } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  LSPClient,
  serverAutoSync,
  serverFolding,
} from "@impower/codemirror-vscode-lsp-client/src";
import { afterEach, describe, expect, it } from "vitest";
import type * as lsp from "vscode-languageserver-protocol";

const URI = "file:///main.sd";

interface PendingRequest {
  id: string;
  method: string;
  params: any;
}

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

  pending(method = "textDocument/foldingRange", uri?: string) {
    return this.requests.filter(
      (r) => r.method === method && (!uri || r.params.textDocument.uri === uri),
    );
  }

  answer(request: PendingRequest, result: unknown) {
    this.requests = this.requests.filter((r) => r !== request);
    this.handler!({ jsonrpc: "2.0", id: request.id, result });
  }
}

function serverFolds(doc: string): lsp.FoldingRange[] {
  const lines = doc.split("\n");
  const heads = lines.flatMap((l, i) => (l.startsWith("#") ? [i] : []));
  return heads.flatMap((start, i) => {
    const end = (heads[i + 1] ?? lines.length) - 1;
    return end > start ? [{ startLine: start, endLine: end }] : [];
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
});

function folds(state: EditorState) {
  const result: { line: number; from: number; to: number }[] = [];
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    const range = foldable(state, line.from, line.to);
    if (range) result.push({ line: n, ...range });
  }
  return result;
}

function connect(server: StandInServer, syncDelay = 0) {
  return new LSPClient({
    extensions: [serverFolding(), serverAutoSync({ delay: syncDelay })],
  }).connect(server, undefined, {
    capabilities: { textDocumentSync: 2, foldingRangeProvider: true },
  });
}

async function mount(
  doc: string,
  { server = new StandInServer(), client = connect(server), uri = URI } = {},
) {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [client.plugin({ uri, version: 0 })],
    }),
    parent: document.body,
  });
  views.push(view);
  let applied = 0;
  const dispatch = view.dispatch.bind(view);
  (view as any).dispatch = (...specs: any[]) => {
    if (specs.some((s) => s?.effects)) applied++;
    return dispatch(...specs);
  };
  await settle();
  return { client, server, view, applied: () => applied };
}

async function fullPull(doc: string) {
  const { server, view } = await mount(doc);
  const [request] = server.pending();
  server.answer(request!, serverFolds(doc));
  await settle();
  return folds(view.state);
}

function type(view: EditorView, from: number, insert: string, to = from) {
  view.dispatch({ changes: { from, to, insert } });
}

const DOC = [
  "# One",
  "a line",
  "another line",
  "# Two",
  "b line",
  "b line",
  "b line",
  "# Three",
  "c line",
].join("\n");

describe("server folding ranges", () => {
  it("fold each line the server's result starts a range on", async () => {
    const { server, view } = await mount(DOC);
    const [request] = server.pending();
    server.answer(request!, serverFolds(DOC));
    await settle();
    expect(folds(view.state).map((f) => f.line)).toEqual([1, 4, 8]);
    const two = view.state.doc.line(4);
    const end = view.state.doc.line(7);
    expect(foldable(view.state, two.from, two.to)).toEqual({
      from: two.to,
      to: end.to,
    });
  });

  it("after typing in a fold's body, hold what a full re-pull holds", async () => {
    const { server, view } = await mount(DOC);
    server.answer(server.pending()[0]!, serverFolds(DOC));
    await settle();
    for (const ch of " and more") {
      type(view, view.state.doc.line(5).to, ch);
      await settle();
      for (const request of server.pending()) {
        server.answer(request, serverFolds(view.state.doc.toString()));
        await settle();
      }
    }
    const text = view.state.doc.toString();
    expect(folds(view.state)).toEqual(await fullPull(text));
  });

  it("after an edit that adds and removes lines, hold what a full re-pull holds", async () => {
    const { server, view } = await mount(DOC);
    server.answer(server.pending()[0]!, serverFolds(DOC));
    await settle();
    type(view, view.state.doc.line(6).from, "# Inserted\n");
    await settle();
    for (const request of server.pending()) {
      server.answer(request, serverFolds(view.state.doc.toString()));
      await settle();
    }
    const one = view.state.doc.line(2);
    type(view, one.from, "", one.to + 1);
    await settle();
    for (const request of server.pending()) {
      server.answer(request, serverFolds(view.state.doc.toString()));
      await settle();
    }
    const text = view.state.doc.toString();
    expect(folds(view.state)).toEqual(await fullPull(text));
    expect(folds(view.state).map((f) => f.line)).toEqual([1, 3, 5, 8]);
  });

  it("drop a result for a version the editor has moved past, and apply the newer one", async () => {
    const { server, view } = await mount(DOC);
    server.answer(server.pending()[0]!, serverFolds(DOC));
    await settle();

    type(view, 0, "intro\n");
    await settle();
    const [stale] = server.pending();
    const staleDoc = view.state.doc.toString();
    type(view, 0, "intro\n");
    await settle();
    server.answer(stale!, serverFolds(staleDoc));
    await settle();
    expect(folds(view.state).map((f) => f.line)).toEqual([3, 6, 10]);

    expect(server.pending()).toHaveLength(1);
    for (const request of server.pending()) {
      server.answer(request, serverFolds(view.state.doc.toString()));
      await settle();
    }
    expect(folds(view.state)).toEqual(
      await fullPull(view.state.doc.toString()),
    );
  });

  it("drop a fold an edit erased, so the fold now starting on its line answers", async () => {
    const { server, view } = await mount(DOC);
    server.answer(server.pending()[0]!, serverFolds(DOC));
    await settle();
    type(view, 0, "", view.state.doc.line(4).from);
    await settle();
    expect(server.pending()).toHaveLength(1);
    const two = view.state.doc.line(1);
    expect(foldable(view.state, two.from, two.to)).toEqual({
      from: two.to,
      to: view.state.doc.line(4).to,
    });
    expect(folds(view.state)).toEqual(
      await fullPull(view.state.doc.toString()),
    );
  });

  it("carry a result through edits made before the editor synced them", async () => {
    const server = new StandInServer();
    const { view } = await mount(DOC, {
      server,
      client: connect(server, 60_000),
    });
    const [request] = server.pending();
    type(view, 0, "", view.state.doc.line(4).from);
    await settle();
    server.answer(request!, serverFolds(DOC));
    await settle();
    expect(folds(view.state).map((f) => f.line)).toEqual([1, 5]);
    expect(folds(view.state)).toEqual(
      await fullPull(view.state.doc.toString()),
    );
  });

  it("do not redraw when a pull returns the folds the editor already holds", async () => {
    const { server, view, applied } = await mount(DOC);
    server.answer(server.pending()[0]!, serverFolds(DOC));
    await settle();
    const before = applied();
    type(view, view.state.doc.line(5).to, "x");
    await settle();
    for (const request of server.pending()) {
      server.answer(request, serverFolds(view.state.doc.toString()));
      await settle();
    }
    expect(applied() - before).toBe(0);
  });

  it("clear the folds when the server answers with none, or with null", async () => {
    const { server, view } = await mount(DOC);
    server.answer(server.pending()[0]!, serverFolds(DOC));
    await settle();
    expect(folds(view.state)).toHaveLength(3);

    type(view, 0, "x");
    await settle();
    server.answer(server.pending()[0]!, null);
    await settle();
    expect(folds(view.state)).toEqual([]);

    type(view, 0, "y");
    await settle();
    server.answer(server.pending()[0]!, serverFolds(DOC));
    await settle();
    type(view, 0, "z");
    await settle();
    server.answer(server.pending()[0]!, []);
    await settle();
    expect(folds(view.state)).toEqual([]);
  });

  it("apply each document's result to its own editor", async () => {
    const server = new StandInServer();
    const OTHER = "file:///other.sd";
    const otherDoc = ["# Solo", "x", "x"].join("\n");
    const client = connect(server);
    const main = await mount(DOC, { server, client, uri: URI });
    const other = await mount(otherDoc, { server, client, uri: OTHER });
    server.answer(server.pending(undefined, OTHER)[0]!, serverFolds(otherDoc));
    await settle();
    server.answer(server.pending(undefined, URI)[0]!, serverFolds(DOC));
    await settle();
    expect(folds(main.view.state).map((f) => f.line)).toEqual([1, 4, 8]);
    expect(folds(other.view.state).map((f) => f.line)).toEqual([1]);
  });
});
