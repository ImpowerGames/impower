import { openSearchPanel } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { LoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/LoadEditorMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  customGotoLinePanel,
  customSearchPanel,
  openCustomGotoLinePanel,
} from "../src/modules/script-editor/utils/extensions/customSearch";

type Callbacks = {
  onFocus: () => void;
  onBlur: () => void;
  onViewUpdate: (update: ViewUpdate) => void;
};

const created: { view: EditorView; config: Callbacks }[] = [];

vi.mock("../src/modules/script-editor/utils/createEditorView", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    default: (parent: HTMLElement, config: Callbacks) => {
      const view = new EditorView({
        state: EditorState.create({
          doc: "hello world\n",
          extensions: [customSearchPanel(), customGotoLinePanel()],
        }),
        parent,
      });
      created.push({ view, config });
      return [view, { dispose: () => {} }];
    },
  };
});

const { ScriptEditorController } = await import(
  "../src/modules/script-editor/ScriptEditorController"
);

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

class TestController extends ScriptEditorController {
  fonts: (() => void)[] = [];
  loaded: string[] = [];

  override async loadFonts() {
    await new Promise<void>((resolve) => this.fonts.push(resolve));
  }

  override loadTextDocument(
    params: LoadEditorMessage.Request["params"],
  ): void {
    this.loaded.push(params.textDocument.uri);
    super.loadTextDocument(params);
  }

  reveal() {
    this.revealEditor();
  }
}

const hosts: HTMLElement[] = [];

const mount = () => {
  const host = document.body.appendChild(document.createElement("div"));
  hosts.push(host);
  const refs = {
    editor: host.appendChild(document.createElement("div")),
    loading: host.appendChild(document.createElement("div")),
    placeholder: host.appendChild(document.createElement("div")),
    main: host.appendChild(document.createElement("div")),
  };
  const controller = new TestController(host, refs, {
    languageServerWorker: {} as Worker,
    languageServerConnection: {} as never,
  });
  const methods: string[] = [];
  host.addEventListener(MessageProtocol.event, (e) => {
    const message = (e as CustomEvent).detail;
    if (message?.method) {
      methods.push(message.method);
    }
  });
  return { host, controller, methods };
};

let nextId = 0;

const request = (uri: string): LoadEditorMessage.Request =>
  LoadEditorMessage.type.request({
    textDocument: { uri, languageId: "sparkdown", version: 0, text: "" },
    languageServerInitializeParams: {} as never,
    languageServerInitializeResult: {} as never,
  }) as LoadEditorMessage.Request;

const load = (controller: TestController, uri: string) =>
  controller["handleLoadEditor"]({ ...request(uri), id: `load-${nextId++}` });

const settleFonts = (controller: TestController) => {
  controller.fonts.splice(0).forEach((resolve) => resolve());
};

const loadedEditor = async () => {
  const mounted = mount();
  const pending = load(mounted.controller, "file:///main.sd");
  settleFonts(mounted.controller);
  await pending;
  const { view, config } = created[created.length - 1]!;
  return { ...mounted, view, config };
};

afterEach(() => {
  created.splice(0).forEach(({ view }) => view.destroy());
  hosts.splice(0).forEach((host) => host.remove());
});

describe("ScriptEditorController load", () => {
  it("loads the document when the editor is revealed while fonts are loading", async () => {
    const { controller } = mount();
    const pending = load(controller, "file:///main.sd");
    controller.reveal();
    settleFonts(controller);
    await expect(pending).resolves.toBeDefined();
    expect(controller.loaded).toEqual(["file:///main.sd"]);
  });

  it("keeps the second load when a reveal clears the first while fonts are loading", async () => {
    const { controller } = mount();
    const first = load(controller, "file:///a.sd");
    const second = load(controller, "file:///b.sd");
    controller.reveal();
    settleFonts(controller);
    await expect(first).resolves.toBeDefined();
    await expect(second).resolves.toBeDefined();
    expect(controller.loaded).toEqual(["file:///b.sd"]);
  });
});

describe("ScriptEditorController panel focus", () => {
  const openPanel = (
    view: EditorView,
    config: Callbacks,
    open: (view: EditorView) => boolean,
  ) => {
    open(view);
    config.onViewUpdate({ state: view.state, view } as ViewUpdate);
  };

  const field = (host: HTMLElement, selector: string) => {
    const el = host.querySelector<HTMLElement>(selector);
    expect(el).toBeTruthy();
    return el!;
  };

  const unfocusedAfterMovingInto = (
    methods: string[],
    config: Callbacks,
    el: HTMLElement,
  ) => {
    config.onFocus();
    methods.length = 0;
    el.focus();
    el.dispatchEvent(new FocusEvent("focus"));
    config.onBlur();
    return methods.includes("editor/unfocused");
  };

  it("keeps the editor focused when focus moves into the find field", async () => {
    const { host, view, config, methods } = await loadedEditor();
    openPanel(view, config, openSearchPanel);
    const find = field(host, ".cm-search [contenteditable][name='search']");
    expect(unfocusedAfterMovingInto(methods, config, find)).toBe(false);
  });

  it("keeps the editor focused when focus moves into the replace field", async () => {
    const { host, view, config, methods } = await loadedEditor();
    openPanel(view, config, openSearchPanel);
    const find = field(host, ".cm-search [contenteditable][name='search']");
    find.dispatchEvent(new FocusEvent("blur"));
    const replace = field(host, ".cm-search [contenteditable][name='replace']");
    expect(unfocusedAfterMovingInto(methods, config, replace)).toBe(false);
  });

  it("keeps the editor focused when focus moves into the go-to-line field", async () => {
    const { host, view, config, methods } = await loadedEditor();
    openPanel(view, config, openCustomGotoLinePanel);
    const line = field(host, ".cm-gotoLine [contenteditable]");
    expect(unfocusedAfterMovingInto(methods, config, line)).toBe(false);
  });

  it("reports the editor unfocused once focus leaves the find field", async () => {
    const { host, view, config, methods } = await loadedEditor();
    openPanel(view, config, openSearchPanel);
    const find = field(host, ".cm-search [contenteditable][name='search']");
    find.dispatchEvent(new FocusEvent("blur"));
    config.onFocus();
    methods.length = 0;
    config.onBlur();
    expect(methods).toContain("editor/unfocused");
  });
});
