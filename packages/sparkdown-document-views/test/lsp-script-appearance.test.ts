import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  coarsePointer,
  documentHighlights,
  hoverPreviews,
  LSPClient,
  serverAutoSync,
  serverColorDecorations,
  serverDocumentHighlights,
  serverHovers,
} from "@impower/codemirror-vscode-lsp-client/src";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  fail(request: PendingRequest, message: string) {
    this.requests = this.requests.filter((r) => r !== request);
    this.handler!({
      jsonrpc: "2.0",
      id: request.id,
      error: { code: -32603, message },
    });
  }
}

const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
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

describe("Highlight matching symbols after a failed request", () => {
  it("reports the server's error and lights nothing", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { server, view } = await mount(DOC, [documentHighlights.of(true)]);
    view.dispatch({ selection: { anchor: DOC.indexOf("intro") + 1 } });
    await settle(200);
    server.fail(
      server.pending("textDocument/documentHighlight")[0]!,
      "highlight provider crashed",
    );
    await settle();
    expect(view.dom.querySelectorAll(".cm-symbol-highlight")).toHaveLength(0);
    expect(errors).toHaveBeenCalledWith(
      "LSP document highlight failed:",
      expect.objectContaining({ message: "highlight provider crashed" }),
    );
  });
});

describe("the hover card", () => {
  const previews = new Compartment();
  const pointer = new Compartment();

  const hover = async (
    enabled: boolean,
    value: string,
    options: { coarse?: boolean; range?: lsp.Range } = {},
  ) => {
    const { server, view } = await mount(DOC, [
      previews.of(hoverPreviews.of(enabled)),
      pointer.of(coarsePointer.of(!!options.coarse)),
    ]);
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
    if (request) {
      server.answer(request, {
        contents: { kind: "markdown", value },
        ...(options.range ? { range: options.range } : {}),
      });
    }
    await settle(50);
    return {
      server,
      view,
      asked: !!request,
      tooltip: view.dom.querySelector(".cm-tooltip-hover"),
    };
  };

  const PICTURE = "![MAYA](data:image/png;base64,iVBORw0KGgo=)";

  it("draws a picture reference as its thumbnail over the reference in code type", async () => {
    const { tooltip } = await hover(true, PICTURE, { range: range(0, 0, 5) });
    const card = tooltip?.querySelector(".cm-lsp-hover-card.cm-lsp-hover-picture");
    expect(card).toBeTruthy();
    expect(card!.querySelector(".cm-lsp-hover-thumb img")).toBeTruthy();
    expect(card!.querySelector(".cm-lsp-hover-caption code")?.textContent).toBe(
      "scene",
    );
  });

  it("names the picture from its alt text when the server gives no range", async () => {
    const { tooltip } = await hover(true, PICTURE);
    expect(tooltip?.querySelector(".cm-lsp-hover-caption code")?.textContent).toBe(
      "MAYA",
    );
  });

  it("shows a picture reference without its thumbnail while turned off", async () => {
    const { tooltip } = await hover(false, PICTURE, { range: range(0, 0, 5) });
    expect(tooltip).toBeTruthy();
    expect(tooltip!.querySelector("img")).toBeNull();
    expect(tooltip!.querySelector(".cm-lsp-hover-caption code")?.textContent).toBe(
      "scene",
    );
  });

  it.each([true, false])("keeps the text after a picture under its caption, previews %s", async (enabled) => {
    const files = "Made from, bottom to top:\n\n- `ava.png`\n- `ava~face.happy.png`";
    const { tooltip } = await hover(enabled, `${PICTURE}\n\n${files}`, { range: range(0, 0, 5) });
    const card = tooltip?.querySelector(".cm-lsp-hover-card.cm-lsp-hover-picture");
    expect(card?.lastElementChild?.className).toBe("cm-lsp-hover-detail");
    const detail = card!.querySelector(".cm-lsp-hover-detail")!;
    expect(detail.querySelector("p")?.textContent).toBe("Made from, bottom to top:");
    expect(Array.from(detail.querySelectorAll("li code"), (code) => code.textContent)).toEqual(["ava.png", "ava~face.happy.png"]);
    expect(detail.querySelector("img")).toBeNull();
    expect(card!.querySelectorAll("img")).toHaveLength(enabled ? 1 : 0);
  });

  it("adds nothing under a picture's caption when the server sends only the picture", async () => {
    const { tooltip } = await hover(true, PICTURE, { range: range(0, 0, 5) });
    expect(tooltip?.querySelector(".cm-lsp-hover-detail")).toBeNull();
  });

  it("closes an open picture card when turned off, and leaves a text card open", async () => {
    const picture = await hover(true, PICTURE);
    expect(picture.tooltip).toBeTruthy();
    picture.view.dispatch({
      effects: previews.reconfigure(hoverPreviews.of(false)),
    });
    expect(picture.view.dom.querySelector(".cm-tooltip-hover")).toBeNull();

    const text = await hover(true, "A scene.");
    text.view.dispatch({
      effects: previews.reconfigure(hoverPreviews.of(false)),
    });
    expect(text.view.dom.querySelector(".cm-tooltip-hover")).toBeTruthy();
  });

  it("draws a symbol as the server's documentation, either way", async () => {
    for (const enabled of [false, true]) {
      const { tooltip } = await hover(enabled, "A scene.");
      const card = tooltip?.querySelector(".cm-lsp-hover-card.cm-lsp-documentation");
      expect(card?.textContent).toContain("A scene.");
      expect(card?.classList.contains("cm-lsp-hover-picture")).toBe(false);
    }
  });

  it("closes on Escape", async () => {
    const { view } = await hover(true, "A scene.");
    expect(view.dom.querySelector(".cm-tooltip-hover")).toBeTruthy();
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(view.dom.querySelector(".cm-tooltip-hover")).toBeNull();
  });

  it("closes when the page scrolls, and stays open when the card itself scrolls", async () => {
    const { view, tooltip } = await hover(true, "A scene.");
    tooltip!.dispatchEvent(new Event("scroll"));
    expect(view.dom.querySelector(".cm-tooltip-hover")).toBeTruthy();
    view.scrollDOM.dispatchEvent(new Event("scroll"));
    expect(view.dom.querySelector(".cm-tooltip-hover")).toBeNull();
  });

  it("closes when the editor loses focus", async () => {
    const { view } = await hover(true, "A scene.");
    view.contentDOM.dispatchEvent(new FocusEvent("blur"));
    expect(view.dom.querySelector(".cm-tooltip-hover")).toBeNull();
  });

  it("asks nothing on a coarse pointer", async () => {
    const { asked, tooltip } = await hover(true, "A scene.", { coarse: true });
    expect(asked).toBe(false);
    expect(tooltip).toBeNull();
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
