import {
  closeCompletion,
  completionStatus,
  currentCompletions,
  startCompletion,
} from "@codemirror/autocomplete";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  coarsePointer,
  LSPClient,
  serverAutoSync,
  serverCompletions,
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
}

const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

async function mount(doc: string, extra: Extension[] = []) {
  const server = new StandInServer();
  const client = new LSPClient({
    extensions: [serverCompletions(), serverAutoSync({ delay: 0 })],
  }).connect(server, undefined, {
    capabilities: {
      textDocumentSync: 2,
      completionProvider: { resolveProvider: true },
    },
  });
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [client.plugin({ uri: URI, version: 0 }), ...extra],
    }),
    parent: document.body,
  });
  views.push(view);
  await settle();
  return { server, view };
}

async function answerCompletion(
  server: StandInServer,
  items: lsp.CompletionItem[],
) {
  for (
    let i = 0;
    i < 40 && !server.pending("textDocument/completion").length;
    i++
  ) {
    await settle(10);
  }
  const [request] = server.pending("textDocument/completion");
  expect(request).toBeTruthy();
  server.answer(request!, items);
  await settle(80);
}

async function typeAndSuggest(
  doc: string,
  typed: string,
  items: lsp.CompletionItem[],
  extra: Extension[] = [],
) {
  const mounted = await mount(doc, extra);
  const { view, server } = mounted;
  view.dispatch({
    changes: { from: doc.length, insert: typed },
    selection: { anchor: doc.length + typed.length },
    userEvent: "input.type",
  });
  await answerCompletion(server, items);
  return mounted;
}

const CHARACTERS: lsp.CompletionItem[] = [
  { label: "MAYA", kind: 21, labelDetails: { description: "character" } },
  { label: "MARCO", kind: 21, labelDetails: { description: "character" } },
];

describe("the suggestion list on a fine pointer", () => {
  it("draws the options as rows under the caret and no chip row", async () => {
    const { view } = await typeAndSuggest("", "MA", CHARACTERS);
    expect(completionStatus(view.state)).toBe("active");
    const rows = view.dom.querySelectorAll(
      ".cm-tooltip-autocomplete [role=option]",
    );
    expect([...rows].map((row) => row.querySelector(".cm-completionLabel")?.textContent)).toEqual(
      ["MAYA", "MARCO"],
    );
    expect(rows[0]!.querySelector(".cm-completionIcon-constant")).toBeTruthy();
    expect(view.dom.classList.contains("cm-suggestion-chips")).toBe(false);
    expect(view.dom.querySelector(".cm-completion-chips")).toBeNull();
  });

  it("opens the preview panel at once and fills it in place when the preview resolves", async () => {
    const { view, server } = await typeAndSuggest("", "ba", [
      { label: "bar", kind: 7, data: { name: "bar" } },
      { label: "baz", kind: 7, data: { name: "baz" } },
    ]);
    const panel = () =>
      view.dom.querySelector<HTMLElement>(
        ".cm-tooltip.cm-completionInfo .cm-lsp-completion-documentation",
      );
    expect(panel()).toBeTruthy();
    expect(panel()!.innerHTML).toBe("");
    const opened = panel();
    for (const resolve of server.pending("completionItem/resolve")) {
      server.answer(resolve, {
        label: resolve.params.label,
        documentation: {
          kind: "markdown",
          value: "![bar](data:image/png;base64,iVBORw0KGgo=)",
        },
      });
    }
    await settle(20);
    expect(panel()).toBe(opened);
    expect(panel()?.querySelector("img")?.getAttribute("src")).toBe(
      "data:image/png;base64,iVBORw0KGgo=",
    );
  });

  it("adds the highlighted option on Tab", async () => {
    const { view } = await typeAndSuggest("", "MA", CHARACTERS);
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    expect(view.state.doc.toString()).toBe("MAYA");
  });

  it("closes when the page is scrolled by the wheel, and stays open when the list itself is", async () => {
    const { view } = await typeAndSuggest("", "MA", CHARACTERS);
    view.dom
      .querySelector(".cm-tooltip-autocomplete ul")!
      .dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    expect(completionStatus(view.state)).toBe("active");
    view.scrollDOM.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    expect(completionStatus(view.state)).toBeNull();
  });
});

describe("an empty request for suggestions", () => {
  it("says there are none when asked for explicitly, until the next edit", async () => {
    const { view, server } = await mount("zz");
    startCompletion(view);
    await answerCompletion(server, []);
    const note = view.dom.querySelector(".cm-suggestions-empty");
    expect(note?.textContent).toBe("No suggestions here.");
    expect(note?.getAttribute("role")).toBe("status");
    view.dispatch({
      changes: { from: 2, insert: "z" },
      userEvent: "input.type",
    });
    expect(view.dom.querySelector(".cm-suggestions-empty")).toBeNull();
  });

  it("closes on Escape", async () => {
    const { view, server } = await mount("zz");
    startCompletion(view);
    await answerCompletion(server, []);
    expect(view.dom.querySelector(".cm-suggestions-empty")).toBeTruthy();
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(view.dom.querySelector(".cm-suggestions-empty")).toBeNull();
  });

  it("says nothing when typing finds no suggestions", async () => {
    const { view } = await typeAndSuggest("", "zz", []);
    expect(view.dom.querySelector(".cm-suggestions-empty")).toBeNull();
  });
});

describe("the suggestion row on a coarse pointer", () => {
  const coarse = [coarsePointer.of(true)];

  it("draws the options as a horizontal listbox of chips, the first one active, and hides the list", async () => {
    const { view } = await typeAndSuggest("", "MA", CHARACTERS, coarse);
    expect(view.dom.classList.contains("cm-suggestion-chips")).toBe(true);
    const row = view.dom.querySelector(".cm-panels-bottom .cm-completion-chips");
    expect(row?.getAttribute("role")).toBe("listbox");
    expect(row?.getAttribute("aria-orientation")).toBe("horizontal");
    const chips = [...row!.querySelectorAll<HTMLElement>("[role=option]")];
    expect(chips.map((chip) => chip.textContent)).toEqual(["MAYA", "MARCO"]);
    expect(chips.map((chip) => chip.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
    ]);
  });

  it("inserts the chip that is tapped", async () => {
    const { view } = await typeAndSuggest("", "MA", CHARACTERS, coarse);
    const chips = view.dom.querySelectorAll<HTMLElement>(
      ".cm-completion-chips [role=option]",
    );
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    chips[1]!.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    chips[1]!.click();
    expect(view.state.doc.toString()).toBe("MARCO");
    expect(view.dom.querySelector(".cm-completion-chips")).toBeNull();
  });

  it("goes when the suggestions close", async () => {
    const { view } = await typeAndSuggest("", "MA", CHARACTERS, coarse);
    expect(view.dom.querySelector(".cm-completion-chips")).toBeTruthy();
    closeCompletion(view);
    expect(view.dom.querySelector(".cm-completion-chips")).toBeNull();
  });

  it("shows a picture's thumbnail from its resolved preview", async () => {
    const { view, server } = await typeAndSuggest(
      "",
      "ba",
      [{ label: "bar", kind: 7, data: { name: "bar" } }],
      coarse,
    );
    expect(currentCompletions(view.state)).toHaveLength(1);
    const resolves = server.pending("completionItem/resolve");
    expect(resolves).toHaveLength(1);
    server.answer(resolves[0]!, {
      label: "bar",
      documentation: {
        kind: "markdown",
        value: "![bar](data:image/png;base64,iVBORw0KGgo=)",
      },
    });
    await settle(20);
    const thumb = view.dom.querySelector<HTMLImageElement>(
      ".cm-completion-chip img.cm-completion-thumb",
    );
    expect(thumb?.getAttribute("src")).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(
      view.dom.querySelector(".cm-completion-chip .cm-completionIcon"),
    ).toBeNull();
  });
});
