import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { LoadEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/LoadEditorMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
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

  it("removes a pending hover's response listener on dispose and never resumes it", async () => {
    const { controller } = await mount();
    const { pending, listener } = watchResponse(() =>
      controller["evaluateHover"]("x"),
    );
    controller.dispose();
    expectRemoved(listener);
    expect(await pending()).toBe(true);
  });

  it("removes a pending show document listener on dispose and never resumes it", async () => {
    const { controller, config } = await mount();
    const { options } = workspaceOf(config);
    const { pending, listener } = watchResponse(() =>
      options.showDocument({ uri: "file:///other.sd" }),
    );
    controller.dispose();
    expectRemoved(listener);
    expect(await pending()).toBe(true);
  });

  it("removes a pending workspace edit listener on dispose and never resumes it", async () => {
    const { controller, config } = await mount();
    const { options } = workspaceOf(config);
    const { pending, listener } = watchResponse(() =>
      options.applyWorkspaceEdit({ edit: {} }),
    );
    controller.dispose();
    expectRemoved(listener);
    expect(await pending()).toBe(true);
  });

  it("resolves a workspace edit at once when the host is disconnected", async () => {
    const { controller, host, config } = await mount();
    const { options } = workspaceOf(config);
    host.remove();
    const { pending, listener } = watchResponse(() =>
      options.applyWorkspaceEdit({ edit: {} }),
    );
    expectRemoved(listener);
    expect(await pending()).toBe(false);
    controller.dispose();
  });

  it("disposes cleanly before any load", () => {
    const host = document.body.appendChild(document.createElement("div"));
    cleanups.push(() => host.remove());
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
    expect(() => controller.dispose()).not.toThrow();
    expect(controller["_focusIntervalTimeout"]).toBe(0);
    expect(controller["_statusBarFrame"]).toBe(0);
    expect(controller["_pendingResponses"].size).toBe(0);
  });
});

const workspaceOf = (config: Config) =>
  config.serverWorkspace({}) as unknown as {
    options: {
      showDocument: (params: unknown) => Promise<void>;
      applyWorkspaceEdit: (params: unknown) => Promise<void>;
    };
  };

const watchResponse = (start: () => Promise<unknown>) => {
  const adding = vi.spyOn(window, "addEventListener");
  const removing = vi.spyOn(window, "removeEventListener");
  let settled = false;
  start().then(() => {
    settled = true;
  });
  const added = adding.mock.calls.filter(
    ([type]) => String(type) === MessageProtocol.event,
  );
  expect(added).toHaveLength(1);
  const listener = added[0]![1];
  return {
    listener: { removing, listener },
    pending: async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return !settled;
    },
  };
};

const expectRemoved = ({
  removing,
  listener,
}: {
  removing: { mock: { calls: unknown[][] } };
  listener: unknown;
}) => {
  expect(
    removing.mock.calls.some(
      ([type, fn]) => type === MessageProtocol.event && fn === listener,
    ),
  ).toBe(true);
};
