import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { LoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/LoadEditorMessage";
import { ShowEditorStatusBarMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ShowEditorStatusBarMessage";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALL_ON_APPEARANCE } from "./fixtures/scriptAppearance";

type Config = {
  onViewUpdate: (u: unknown) => void;
  serverWorkspace: (client: unknown) => {
    showDocument?: (params: unknown) => Promise<void>;
    applyWorkspaceEdit?: (params: unknown) => Promise<void>;
  };
};

const created: { view: EditorView; config: Config }[] = [];

vi.mock("../src/modules/script-editor/utils/createEditorView", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  default: (parent: HTMLElement, config: Config) => {
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n"),
      }),
    });
    created.push({ view, config });
    return [view, { dispose() {} }];
  },
}));

vi.mock("../src/modules/script-editor/classes/SparkdownCodemirrorWorkspace", () => ({
  SparkdownCodemirrorWorkspace: class {
    constructor(
      _client: unknown,
      readonly options: {
        showDocument: (params: unknown) => Promise<void>;
        applyWorkspaceEdit: (params: unknown) => Promise<void>;
      },
    ) {}
  },
}));

const { ScriptEditorController } = await import(
  "../src/modules/script-editor/ScriptEditorController"
);

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

const cleanups: (() => void)[] = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  created.splice(0);
  vi.restoreAllMocks();
});

const mount = async () => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const host = document.body.appendChild(document.createElement("div"));
  const controller = new ScriptEditorController(
    host,
    {
      editor: host.appendChild(document.createElement("div")),
      loading: host.appendChild(document.createElement("div")),
      main: host.appendChild(document.createElement("div")),
      placeholder: host.appendChild(document.createElement("div")),
    },
    {
      coarsePointer: false,
      appearance: ALL_ON_APPEARANCE,
      languageServerWorker: {} as Worker,
      languageServerConnection: {} as never,
    },
  );
  controller.setup();
  await controller["handleLoadEditor"]({
    ...LoadEditorMessage.type.request({
      textDocument: { uri: "file:///main.sd", languageId: "sparkdown", version: 0, text: "" },
      selectedRange: { start: { line: 40, character: 0 }, end: { line: 40, character: 0 } },
      visibleRange: "center",
      languageServerInitializeParams: {} as never,
      languageServerInitializeResult: {} as never,
    }),
    id: "dispose-load",
  });
  cleanups.push(() => host.remove());
  return { controller, host, config: created.at(-1)!.config };
};

describe("ScriptEditorController dispose", () => {
  it("stops the caret retry after dispose", async () => {
    const { controller } = await mount();
    const scrolling = vi.spyOn(EditorView, "scrollIntoView");
    controller["handleIdle"]();
    controller.dispose();
    scrolling.mockClear();
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(scrolling).not.toHaveBeenCalled();
    expect(controller["_focusIntervalTimeout"]).toBe(0);
  });

  it("cancels the status bar fade-in frame on dispose", async () => {
    const { controller, host } = await mount();
    const panels = host.appendChild(document.createElement("div"));
    panels.className = "cm-panels-bottom";
    controller["handleShowEditorStatusBar"](
      ShowEditorStatusBarMessage.type.request({}),
    );
    controller.dispose();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(panels.style.opacity).toBe("0");
  });

  it("settles a pending hover evaluation on dispose", async () => {
    const { controller } = await mount();
    const listening = vi.spyOn(window, "removeEventListener");
    const hover = controller["evaluateHover"]("x");
    controller.dispose();
    await expect(hover).resolves.toBeNull();
    expect(listening).toHaveBeenCalled();
  });

  it("settles a pending show document request on dispose", async () => {
    const { controller, config } = await mount();
    const { options } = config.serverWorkspace({}) as unknown as {
      options: { showDocument: (params: unknown) => Promise<void> };
    };
    const shown = options.showDocument({ uri: "file:///other.sd" });
    controller.dispose();
    await expect(shown).resolves.toBeUndefined();
  });

  it("settles a pending workspace edit request on dispose", async () => {
    const { controller, config } = await mount();
    const { options } = config.serverWorkspace({}) as unknown as {
      options: { applyWorkspaceEdit: (params: unknown) => Promise<void> };
    };
    const applied = options.applyWorkspaceEdit({ edit: {} });
    controller.dispose();
    await expect(applied).resolves.toBeUndefined();
  });
});
