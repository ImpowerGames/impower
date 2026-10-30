import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { signal } from "@preact/signals";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  views: [] as { destroyed: boolean; view: unknown }[],
  reads: [] as (() => void)[],
  connect: [] as (() => void)[],
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
      protected override async loadFonts() {}
    }
    return { ...actual, ScriptEditorController: HeldController };
  },
);

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    window: {
      getActiveEditorForFile: () => ({ uri: "file:///project/main.sd" }),
    },
    fs: {
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

vi.mock("../../src/modules/spark-editor/workspace/WorkspaceStore", () => ({
  default: { state: signal({ project: { id: "project" }, sync: {} }) },
}));

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

const { setLanguageServer } = await import(
  "@impower/sparkdown-document-views/src/modules/script-editor/SparkdownScriptEditor"
);
const { default: LogicScriptEditor } = await import(
  "../../src/modules/spark-editor/components/logic-script-editor/LogicScriptEditor"
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
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => {
    render(h(LogicScriptEditor, { filename: "main.sd" }), host!);
  });
  await vi.waitFor(() => {
    expect(mocks.reads.length).toBe(1);
    expect(mocks.connect.length).toBe(1);
  });
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
});

describe("LogicScriptEditor mount", () => {
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
