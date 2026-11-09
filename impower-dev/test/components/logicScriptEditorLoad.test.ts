import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  views: [] as { destroyed: boolean; view: unknown }[],
  editor: undefined as Record<string, unknown> | undefined,
  reads: [] as (() => void)[],
  connect: [] as (() => void)[],
  writes: [] as {
    textDocument: { uri: string; version: number; text: string };
    origin?: string;
  }[],
}));

vi.mock("@impower/impower-ui/loading-bar", async () => {
  const { h } = await import("preact");
  return {
    LoadingBar: ({ containerRef }: { containerRef: unknown }) =>
      h("div", { ref: containerRef as never }),
  };
});

vi.mock(
  "@impower/sparkdown-document-views/src/modules/script-editor/utils/createEditorView",
  async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
      ...actual,
      default: (parent: HTMLElement) => {
        const entry = { destroyed: false, view: undefined as unknown };
        const view = new EditorView({
          state: EditorState.create({ doc: "hello\n" }),
          parent,
        });
        const destroy = view.destroy.bind(view);
        view.destroy = () => {
          entry.destroyed = true;
          destroy();
        };
        entry.view = view;
        mocks.views.push(entry);
        return [view, { dispose: () => {} }];
      },
    };
  },
);

vi.mock(
  "@impower/sparkdown-document-views/src/modules/script-editor/ScriptEditorController",
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import("@impower/sparkdown-document-views/src/modules/script-editor/ScriptEditorController")
    >();
    class HeldController extends actual.ScriptEditorController {
      override setup() {
        mocks.connect.push(() => super.setup());
      }
    }
    return { ...actual, ScriptEditorController: HeldController };
  },
);

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    window: {
      getActiveEditorForFile: () =>
        mocks.editor ?? { uri: "file:///project/main.sd" },
      recordScriptChange: async () => {},
    },
    fs: {
      writeTextDocument: async (params: (typeof mocks.writes)[number]) => {
        mocks.writes.push(params);
      },
      getFiles: () =>
        new Promise((resolve) =>
          mocks.reads.push(() =>
            resolve({
              "file:///project/main.sd": {
                text: "hello\n",
                version: 1,
                languageId: "sparkdown",
              },
            }),
          ),
        ),
    },
    ls: {
      getInitializeParams: async () => ({}),
      getInitializeResult: async () => ({}),
    },
  },
}));

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

await import(
  "@impower/sparkdown-document-views/src/modules/script-editor/ScriptEditorController"
);
const { setLanguageServer } = await import(
  "@impower/sparkdown-document-views/src/modules/script-editor/SparkdownScriptEditor"
);
const { default: LogicScriptEditor } = await import(
  "../../src/modules/spark-editor/components/logic-script-editor/LogicScriptEditor"
);
const { default: workspace } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);
const { sendProtocolMessage } = await import(
  "@impower/spark-editor-protocol/src/protocols/MessageProtocol"
);
const { DidSaveTextDocumentMessage } = await import(
  "@impower/spark-editor-protocol/src/protocols/textDocument/DidSaveTextDocumentMessage"
);
const { DidChangeTextDocumentMessage } = await import(
  "@impower/spark-editor-protocol/src/protocols/textDocument/DidChangeTextDocumentMessage"
);
const { DidWriteFilesMessage } = await import(
  "@impower/spark-editor-protocol/src/protocols/workspace/DidWriteFilesMessage"
);

setLanguageServer({ worker: {} as Worker, connection: {} as never });

let host: HTMLDivElement | undefined;

const settle = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });

const mount = async () => {
  workspace.state.value = {
    ...workspace.state.peek(),
    project: { ...workspace.state.peek().project, id: "project" },
    sync: {},
  } as typeof workspace.state.value;
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => {
    render(h(LogicScriptEditor, { filename: "main.sd" }), host!);
  });
  await vi.waitFor(
    () => {
      expect(mocks.reads.length).toBe(1);
      expect(mocks.connect.length).toBe(1);
    },
    { timeout: 10_000, interval: 20 },
  );
};

const connectController = async () => {
  await act(async () => {
    mocks.connect.shift()!();
  });
};

const answerReads = async () => {
  await settle();
  while (mocks.reads.length > 0) {
    mocks.reads.shift()!();
    await settle();
  }
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  mocks.views.splice(0).forEach(({ view, destroyed }) => {
    if (!destroyed) (view as EditorView).destroy();
  });
  mocks.reads.splice(0);
  mocks.connect.splice(0);
  mocks.writes.splice(0);
  mocks.editor = undefined;
});

describe("LogicScriptEditor mount", { timeout: 60_000 }, () => {
  it("creates one editor view when the controller connects while the first load is reading the file", async () => {
    await mount();
    await connectController();
    await answerReads();
    expect(mocks.views.length).toBe(1);
    expect(mocks.views[0]!.destroyed).toBe(false);
  });

  it("loads the document once the controller connects after the first load was sent", async () => {
    await mount();
    await answerReads();
    expect(mocks.views.length).toBe(0);
    await connectController();
    await answerReads();
    expect(mocks.views.length).toBe(1);
    expect(mocks.views[0]!.destroyed).toBe(false);
  });
});

describe("LogicScriptEditor write notifications", { timeout: 60_000 }, () => {
  const uri = "file:///project/main.sd";

  const loaded = async () => {
    await mount();
    await connectController();
    await answerReads();
  };

  const type = async (text: string) => {
    await act(async () => {
      sendProtocolMessage(
        DidSaveTextDocumentMessage.type.notification({
          textDocument: { uri },
          text,
        }),
      );
    });
  };

  const autosave = async (text: string) => {
    const count = mocks.writes.length;
    await type(text);
    await vi.waitFor(() => expect(mocks.writes.length).toBe(count + 1), {
      timeout: 5_000,
      interval: 20,
    });
    return mocks.writes[count]!;
  };

  const didWrite = async (text: string, origin?: string) => {
    await act(async () => {
      sendProtocolMessage(
        DidWriteFilesMessage.type.notification({
          files: [
            {
              uri,
              name: "main",
              ext: "sd",
              type: "script",
              src: uri,
              version: 2,
              text,
            },
          ],
          remote: false,
          origin,
        }),
      );
    });
    await settle();
  };

  it("does not reload for its own autosave echo after the author typed further", async () => {
    await loaded();
    const write = await autosave("hello a\n");
    await type("hello ab\n");
    await didWrite("hello a\n", write.origin);
    expect(mocks.reads.length).toBe(0);
  });

  it("reloads when another writer rewrites the open script to text the editor autosaved earlier", async () => {
    await loaded();
    await autosave("hello a\n");
    await type("hello ab\n");
    await didWrite("hello a\n");
    expect(mocks.reads.length).toBe(1);
  });
});

describe("LogicScriptEditor load handover", { timeout: 60_000 }, () => {
  const at = (line: number) => ({
    start: { line, character: 0 },
    end: { line, character: 0 },
  });

  it("loads with the selection made while it was still reading the file", async () => {
    const loads: { selectedRange?: unknown }[] = [];
    const hear = (e: Event) => {
      const message = (e as CustomEvent).detail;
      if (message?.method === "editor/load" && "params" in message) {
        loads.push(message.params);
      }
    };
    window.addEventListener("jsonrpc", hear);
    try {
      mocks.editor = { uri: "file:///project/main.sd", selectedRange: at(1) };
      await mount();
      mocks.editor = { uri: "file:///project/main.sd", selectedRange: at(2) };
      await connectController();
      await answerReads();
      expect(loads.length).toBeGreaterThan(0);
      expect(loads.at(-1)!.selectedRange).toEqual(at(2));
    } finally {
      window.removeEventListener("jsonrpc", hear);
    }
  });

  it("loads with the scroll, focus and line marks current when it sends", async () => {
    const loads: Record<string, unknown>[] = [];
    const hear = (e: Event) => {
      const message = (e as CustomEvent).detail;
      if (message?.method === "editor/load" && "params" in message) {
        loads.push(message.params);
      }
    };
    const state = (line: number) => ({
      uri: "file:///project/main.sd",
      focused: line > 1,
      visibleRange: at(line),
      selectedRange: at(line),
      breakpointLines: [line],
      pinpointLines: [line + 10],
      highlightLines: [line + 20],
      startingValueLines: [line + 30],
      routePins: [{ line, offer: 0 }],
    });
    window.addEventListener("jsonrpc", hear);
    try {
      mocks.editor = state(1);
      await mount();
      mocks.editor = state(2);
      await connectController();
      await answerReads();
      expect(loads.length).toBeGreaterThan(0);
      const { uri: _uri, ...newest } = state(2);
      expect(loads.at(-1)).toMatchObject(newest);
    } finally {
      window.removeEventListener("jsonrpc", hear);
    }
  });
});

describe("LogicScriptEditor save handover", { timeout: 60_000 }, () => {
  const uri = "file:///project/main.sd";

  it("autosaves the text and version the editor reached while the save waited", async () => {
    await mount();
    await connectController();
    await answerReads();
    await act(async () => {
      sendProtocolMessage(
        DidSaveTextDocumentMessage.type.notification({
          textDocument: { uri },
          text: "hello a\n",
        }),
      );
      sendProtocolMessage(
        DidChangeTextDocumentMessage.type.notification({
          textDocument: { uri, version: 7 },
          contentChanges: [],
        }),
      );
      sendProtocolMessage(
        DidSaveTextDocumentMessage.type.notification({
          textDocument: { uri },
          text: "hello ab\n",
        }),
      );
    });
    await vi.waitFor(() => expect(mocks.writes.length).toBe(1), {
      timeout: 5_000,
      interval: 20,
    });
    expect(mocks.writes[0]!.textDocument).toEqual({
      uri,
      version: 7,
      text: "hello ab\n",
    });
  });
});
