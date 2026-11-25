import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  views: [] as EditorView[],
  reads: [] as (() => void)[],
  connect: [] as (() => void)[],
}));

vi.mock(
  "@impower/sparkdown-document-views/src/modules/script-editor/utils/createEditorView",
  async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
      ...actual,
      default: (parent: HTMLElement) => {
        const view = new EditorView({
          state: EditorState.create({ doc: "hello\n" }),
          parent,
        });
        mocks.views.push(view);
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
      getActiveEditorForFile: () => ({ uri: "file:///project/main.sd" }),
      recordScriptChange: async () => {},
    },
    fs: {
      writeTextDocument: async () => {},
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

const sharedMatchMedia = window.matchMedia;
window.matchMedia = (query: string) =>
  ({
    ...sharedMatchMedia(query),
    matches: !query.includes("prefers-reduced-motion"),
  }) as MediaQueryList;

Element.prototype.animate = function () {
  return {
    currentTime: 0,
    onfinish: null,
    cancel() {},
  } as unknown as Animation;
} as typeof Element.prototype.animate;

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

setLanguageServer({ worker: {} as Worker, connection: {} as never });

let host: HTMLDivElement | undefined;

const settle = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });

const parts = () => {
  const root = host!.querySelector(".sparkdown-script-editor-root");
  return {
    bar: root?.querySelector<HTMLElement>('[role="progressbar"]') ?? null,
    editor: root?.querySelector<HTMLElement>(".editor") ?? null,
  };
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  mocks.views.splice(0).forEach((view) => view.destroy());
  mocks.reads.splice(0);
  mocks.connect.splice(0);
});

describe("script editor loading bar", { timeout: 60_000 }, () => {
  it("shows the bar while the script body is hidden and removes it when the body is revealed", async () => {
    workspace.state.value = {
      ...workspace.state.peek(),
      project: { ...workspace.state.peek().project, id: "project" },
      sync: {},
    } as typeof workspace.state.value;
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => {
      render(h(LogicScriptEditor, { filename: "main.sd" }), host!);
    });

    const mounted = parts();
    expect(mounted.bar).not.toBeNull();
    expect(mounted.bar!.style.opacity).toBe("1");
    expect(mounted.bar!.hasAttribute("aria-hidden")).toBe(false);

    await vi.waitFor(() => expect(mocks.connect.length).toBe(1), {
      timeout: 10_000,
      interval: 20,
    });
    await act(async () => {
      mocks.connect.shift()!();
    });
    await settle();
    while (mocks.reads.length > 0) {
      mocks.reads.shift()!();
      await settle();
    }
    await vi.waitFor(() => expect(mocks.views.length).toBe(1), {
      timeout: 10_000,
      interval: 20,
    });

    const loading = parts();
    expect(loading.editor!.style.visibility).toBe("hidden");
    expect(loading.bar!.style.opacity).toBe("1");

    await vi.waitFor(
      () => expect(parts().editor!.style.visibility).toBe("visible"),
      { timeout: 10_000, interval: 20 },
    );
    const { bar } = parts();
    expect(bar!.style.opacity).toBe("0");
    expect(bar!.getAttribute("aria-hidden")).toBe("true");
  });
});
