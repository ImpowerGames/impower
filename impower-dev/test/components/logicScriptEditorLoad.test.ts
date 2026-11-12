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
  holdWrites: false,
  held: [] as (() => void)[],
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
        if (mocks.holdWrites) {
          await new Promise<void>((resolve) => mocks.held.push(resolve));
        }
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
  mocks.held.splice(0).forEach((release) => release());
  mocks.holdWrites = false;
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

  const didWrite = async (text: string, origin?: string, restored = false) => {
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
          ...(restored ? { restored: [uri] } : {}),
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

  it("keeps the typing over a rollback that restores the text it loaded, and autosaves it", async () => {
    await loaded();
    const count = mocks.writes.length;
    await type("hello typed\n");
    await didWrite("hello\n", undefined, true);
    expect(mocks.reads.length).toBe(0);
    await vi.waitFor(() => expect(mocks.writes.length).toBe(count + 1), {
      timeout: 5_000,
      interval: 20,
    });
    expect(mocks.writes[count]!.textDocument.text).toBe("hello typed\n");
  });

  it("keeps the typing over a rollback that restores what it last autosaved", async () => {
    await loaded();
    await autosave("hello a\n");
    await type("hello ab\n");
    await didWrite("hello a\n", undefined, true);
    expect(mocks.reads.length).toBe(0);
  });

  it("reloads for a rollback that restores text it never loaded", async () => {
    await loaded();
    await type("hello typed\n");
    await didWrite("other\n", undefined, true);
    expect(mocks.reads.length).toBe(1);
  });
});

describe("LogicScriptEditor load handover", { timeout: 60_000 }, () => {
  const at = (line: number) => ({
    start: { line, character: 0 },
    end: { line, character: 0 },
  });

  it("loads the script it was switched to while it was still reading the first one", async () => {
    const loads: { textDocument: { uri: string } }[] = [];
    const hear = (e: Event) => {
      const message = (e as CustomEvent).detail;
      if (message?.method === "editor/load" && "params" in message) {
        loads.push(message.params);
      }
    };
    window.addEventListener("jsonrpc", hear);
    try {
      await mount();
      mocks.editor = { uri: "file:///project/scripts/other.sd" };
      await act(async () => {
        render(h(LogicScriptEditor, { filename: "scripts/other.sd" }), host!);
      });
      await connectController();
      await answerReads();
      expect(loads.length).toBeGreaterThan(0);
      expect(loads.at(-1)!.textDocument.uri).toBe("file:///project/scripts/other.sd");
    } finally {
      window.removeEventListener("jsonrpc", hear);
    }
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

describe("LogicScriptEditor stored text per script", { timeout: 60_000 }, () => {
  const MAIN = "file:///project/main.sd";
  const OTHER = "file:///project/scripts/other.sd";

  it("keeps typing in the script it switched to when a rollback restores that script after the previous script's autosave finishes", async () => {
    await mount();
    await connectController();
    await answerReads();
    mocks.holdWrites = true;
    await act(async () => {
      sendProtocolMessage(
        DidSaveTextDocumentMessage.type.notification({
          textDocument: { uri: MAIN },
          text: "hello a\n",
        }),
      );
    });
    await vi.waitFor(() => expect(mocks.held.length).toBe(1), {
      timeout: 5_000,
      interval: 20,
    });
    mocks.editor = { uri: OTHER };
    await act(async () => {
      render(h(LogicScriptEditor, { filename: "scripts/other.sd" }), host!);
    });
    await answerReads();
    await act(async () => {
      mocks.held.shift()!();
    });
    await settle();
    await act(async () => {
      sendProtocolMessage(
        DidSaveTextDocumentMessage.type.notification({
          textDocument: { uri: OTHER },
          text: "typed\n",
        }),
      );
    });
    const reads = mocks.reads.length;
    await act(async () => {
      sendProtocolMessage(
        DidWriteFilesMessage.type.notification({
          files: [
            {
              uri: OTHER,
              name: "other",
              ext: "sd",
              type: "script",
              src: OTHER,
              version: 2,
              text: "",
            },
          ],
          remote: false,
          restored: [OTHER],
        }),
      );
    });
    await settle();
    expect(mocks.reads.length).toBe(reads);
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

describe("the open script's typing over a rollback's restoring write, by schedule (I-2100)", { timeout: 60_000 }, () => {
  const MAIN = "file:///project/main.sd";
  const OTHER = "file:///project/scripts/other.sd";

  type Ownership = "held" | "opened" | "two editors";
  type Timing = "typing pending" | "autosave in flight" | "autosaved before the edit";
  type Path = "this tab, stamped" | "this tab, unsequenced" | "a second tab";

  const OWNERSHIPS: Ownership[] = ["held", "opened", "two editors"];
  const TIMINGS: Timing[] = ["typing pending", "autosave in flight", "autosaved before the edit"];
  const PATHS: Path[] = ["this tab, stamped", "this tab, unsequenced", "a second tab"];

  const CELLS = OWNERSHIPS.flatMap((ownership) =>
    TIMINGS.flatMap((timing) => PATHS.map((path) => ({ ownership, timing, path }))),
  );

  let version = 10;

  const type = async (uri: string, text: string) => {
    version += 1;
    await act(async () => {
      sendProtocolMessage(
        DidChangeTextDocumentMessage.type.notification({
          textDocument: { uri, version },
          contentChanges: [],
        }),
      );
      sendProtocolMessage(
        DidSaveTextDocumentMessage.type.notification({ textDocument: { uri }, text }),
      );
    });
  };

  const restore = async (uri: string, text: string, path: Path) => {
    await act(async () => {
      sendProtocolMessage(
        DidWriteFilesMessage.type.notification({
          files: [{ uri, name: "script", ext: "sd", type: "script", src: uri, version: 2, text }],
          remote: path === "a second tab",
          ...(path === "this tab, stamped"
            ? { commits: { [uri]: { sequence: 9, writer: "tab", local: 9 } as never } }
            : {}),
          restored: [uri],
        }),
      );
    });
    await settle();
  };

  const waitForWrites = (count: number) =>
    vi.waitFor(() => expect(mocks.writes.length).toBeGreaterThanOrEqual(count), {
      timeout: 5_000,
      interval: 20,
    });

  it.each(CELLS)(
    "keeps the typing and autosaves it: $ownership, $timing, $path",
    async ({ ownership, timing, path }) => {
      let second: HTMLDivElement | undefined;
      try {
        await mount();
        await connectController();
        await answerReads();
        let uri = MAIN;
        let loaded = "hello\n";
        if (ownership === "opened") {
          mocks.editor = { uri: OTHER };
          await act(async () => {
            render(h(LogicScriptEditor, { filename: "scripts/other.sd" }), host!);
          });
          await answerReads();
          uri = OTHER;
          loaded = "";
        }
        if (ownership === "two editors") {
          second = document.body.appendChild(document.createElement("div"));
          await act(async () => {
            render(h(LogicScriptEditor, { filename: "main.sd" }), second!);
          });
          await vi.waitFor(() => expect(mocks.connect.length).toBe(1), {
            timeout: 10_000,
            interval: 20,
          });
          await connectController();
          await answerReads();
        }
        const editors = ownership === "two editors" ? 2 : 1;
        let restoredText = loaded;
        if (timing === "autosaved before the edit") {
          const count = mocks.writes.length;
          await type(uri, "autosaved\n");
          await waitForWrites(count + editors);
          await settle();
          restoredText = "autosaved\n";
        }
        const count = mocks.writes.length;
        if (timing === "autosave in flight") {
          mocks.holdWrites = true;
        }
        await type(uri, "typed\n");
        if (timing === "autosave in flight") {
          await vi.waitFor(() => expect(mocks.held.length).toBe(editors), {
            timeout: 5_000,
            interval: 20,
          });
        }
        const reads = mocks.reads.length;
        await restore(uri, restoredText, path);
        expect(mocks.reads.length).toBe(reads);
        if (timing === "autosave in flight") {
          mocks.holdWrites = false;
          await act(async () => {
            mocks.held.splice(0).forEach((release) => release());
          });
        }
        await waitForWrites(count + editors);
        expect(mocks.writes.slice(count).map((w) => w.textDocument.text)).toEqual(
          Array(editors).fill("typed\n"),
        );
        expect(mocks.reads.length).toBe(reads);
      } finally {
        if (second) {
          await act(async () => render(null, second!));
          second.remove();
        }
      }
    },
  );
});
