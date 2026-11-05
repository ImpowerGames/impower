import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  documentHighlights,
  hoverPreviews,
  LSPClient,
  serverAutoSync,
  serverColorDecorations,
  serverDocumentHighlights,
  serverHovers,
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

  pending(method: string) {
    return this.requests.filter((r) => r.method === method);
  }

  answer(request: PendingRequest, result: unknown) {
    this.requests = this.requests.filter((r) => r !== request);
    this.handler!({ jsonrpc: "2.0", id: request.id, result });
  }
}

const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.innerHTML = "";
});

const range = (line: number, start: number, end: number): lsp.Range => ({
  start: { line, character: start },
  end: { line, character: end },
});

async function mount(doc: string, extra: Extension[] = []) {
  const server = new StandInServer();
  const client = new LSPClient({
    extensions: [
      serverDocumentHighlights(),
      serverHovers({ hoverTime: 1 }),
      serverColorDecorations(),
      serverAutoSync({ delay: 0 }),
    ],
  }).connect(server, undefined, {
    capabilities: {
      textDocumentSync: 2,
      documentHighlightProvider: true,
      hoverProvider: true,
      colorProvider: true,
    },
  });
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [client.plugin({ uri: URI, version: 0 }), ...extra],
    }),
    parent: document.body,
  });
  views.push(view);
  await settle();
  return { server, view };
}

const DOC = ["scene intro", "  -> intro", "end"].join("\n");

describe("Highlight matching symbols", () => {
  it("lights up every use of the name under the caret", async () => {
    const { server, view } = await mount(DOC, [documentHighlights.of(true)]);
    view.dispatch({ selection: { anchor: DOC.indexOf("intro") + 1 } });
    await settle(200);
    const [request] = server.pending("textDocument/documentHighlight");
    expect(request).toBeTruthy();
    expect(request!.params.position).toEqual({ line: 0, character: 7 });
    server.answer(request!, [
      { range: range(0, 6, 11) },
      { range: range(1, 5, 10) },
    ]);
    await settle();
    const uses = [...view.dom.querySelectorAll(".cm-symbol-highlight")].map(
      (el) => el.textContent,
    );
    expect(uses).toEqual(["intro", "intro"]);
  });

  it("lights nothing for a single use, and asks nothing while turned off", async () => {
    const { server, view } = await mount(DOC, [documentHighlights.of(true)]);
    view.dispatch({ selection: { anchor: 2 } });
    await settle(200);
    server.answer(server.pending("textDocument/documentHighlight")[0]!, [
      { range: range(0, 0, 5) },
    ]);
    await settle();
    expect(view.dom.querySelectorAll(".cm-symbol-highlight")).toHaveLength(0);

    const off = await mount(DOC, [documentHighlights.of(false)]);
    off.view.dispatch({ selection: { anchor: DOC.indexOf("intro") + 1 } });
    await settle(200);
    expect(
      off.server.pending("textDocument/documentHighlight"),
    ).toHaveLength(0);
  });
});

describe("Hover previews", () => {
  const hover = async (enabled: boolean, value: string) => {
    const { server, view } = await mount(DOC, [hoverPreviews.of(enabled)]);
    const at = 2;
    view.posAtCoords = (() => at) as EditorView["posAtCoords"];
    view.coordsAtPos = () => ({ left: 0, right: 10, top: 0, bottom: 10 });
    const target = view.contentDOM.querySelector(".cm-line")!;
    target.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, clientX: 5, clientY: 5 }),
    );
    for (let i = 0; i < 20 && !server.pending("textDocument/hover").length; i++) {
      await settle(25);
    }
    const [request] = server.pending("textDocument/hover");
    expect(request).toBeTruthy();
    server.answer(request!, { contents: { kind: "markdown", value } });
    await settle(50);
    return view.dom.querySelector(".cm-tooltip-hover");
  };

  const PICTURE = "![MAYA](data:image/png;base64,iVBORw0KGgo=)";

  it("keeps a picture's popup closed while turned off", async () => {
    expect(await hover(false, PICTURE)).toBeNull();
    const shown = await hover(true, PICTURE);
    expect(shown?.querySelector("img")).toBeTruthy();
  });

  it("shows a popup without a picture either way", async () => {
    expect((await hover(false, "A scene."))?.textContent).toContain("A scene.");
    expect((await hover(true, "A scene."))?.textContent).toContain("A scene.");
  });
});

describe("colour swatches", () => {
  it("draw the value on its own colour and open the picker on press", async () => {
    const doc = "  color = #ff8800";
    const { server, view } = await mount(doc);
    const [request] = server.pending("textDocument/documentColor");
    expect(request).toBeTruthy();
    server.answer(request!, [
      {
        range: range(0, 10, 17),
        color: { red: 1, green: 136 / 255, blue: 0, alpha: 1 },
      },
    ]);
    await settle();
    const swatch = view.dom.querySelector<HTMLElement>(".cm-color-swatch");
    expect(swatch).toBeTruthy();
    expect(swatch!.textContent).toBe("#ff8800");
    expect(swatch!.style.getPropertyValue("--swatch")).toBe(
      "rgb(255 136 0 / 100%)",
    );
    swatch!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const picker = view.dom.querySelector<HTMLInputElement>(
      "input.cm-color-picker-input",
    );
    expect(picker).toBeTruthy();
    expect(picker!.type).toBe("color");
    expect(picker!.value).toBe("#ff8800");
  });
});
