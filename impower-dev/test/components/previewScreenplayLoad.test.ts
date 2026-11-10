import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const URI = "file:///project/main.sd";

const mocks = vi.hoisted(() => ({
  editor: undefined as Record<string, unknown> | undefined,
  reads: [] as (() => void)[],
}));

vi.mock(
  "@impower/sparkdown-document-views/src/modules/screenplay-preview/SparkdownScreenplayPreview",
  () => ({ default: () => null }),
);

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    window: {
      getActiveEditorForPane: () => mocks.editor,
    },
    fs: {
      getFiles: () =>
        new Promise((resolve) =>
          mocks.reads.push(() =>
            resolve({
              [URI]: { text: "hello\n", version: 1, languageId: "sparkdown" },
            }),
          ),
        ),
    },
  },
}));

const { default: PreviewScreenplay } = await import(
  "../../src/modules/spark-editor/components/preview-screenplay/PreviewScreenplay"
);
const { default: workspace } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);

const at = (line: number) => ({
  start: { line, character: 0 },
  end: { line, character: 0 },
});

const editorAt = (line: number, uri = URI) => ({
  uri,
  visibleRange: at(line),
  selectedRange: at(line),
});

let host: HTMLDivElement | undefined;
let loads: Record<string, unknown>[] = [];
const hear = (e: Event) => {
  const message = (e as CustomEvent).detail;
  if (message?.method === "preview/load" && "params" in message) {
    loads.push(message.params);
  }
};

const setSync = (textPulledAt?: string) => {
  workspace.state.value = {
    ...workspace.state.peek(),
    project: { ...workspace.state.peek().project, id: "project" },
    sync: textPulledAt ? { textPulledAt } : {},
  } as typeof workspace.state.value;
};

const waitForRead = () =>
  vi.waitFor(() => expect(mocks.reads.length).toBeGreaterThan(0), {
    timeout: 10_000,
    interval: 20,
  });

const answerRead = async () => {
  await act(async () => {
    mocks.reads.shift()!();
  });
  await vi.waitFor(() => expect(loads.length).toBeGreaterThan(0), {
    timeout: 5_000,
    interval: 20,
  });
};

const mount = async () => {
  setSync();
  loads = [];
  window.addEventListener("jsonrpc", hear);
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => {
    render(h(PreviewScreenplay, {}), host!);
  });
};

afterEach(async () => {
  window.removeEventListener("jsonrpc", hear);
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  mocks.reads.splice(0);
  mocks.editor = undefined;
});

describe("PreviewScreenplay load handover", { timeout: 60_000 }, () => {
  it("loads with the selection and scroll the editor reached while it read the file", async () => {
    mocks.editor = editorAt(1);
    await mount();
    await waitForRead();
    mocks.editor = editorAt(5);
    await answerRead();
    expect(loads.at(-1)).toMatchObject({
      visibleRange: at(5),
      selectedRange: at(5),
    });
  });

  it("reloads after a pull with the selection and scroll the editor reached while it read the file", async () => {
    mocks.editor = editorAt(1);
    await mount();
    await waitForRead();
    await answerRead();
    loads = [];
    await act(async () => setSync("2026-11-06T00:00:00Z"));
    await waitForRead();
    mocks.editor = editorAt(7);
    await answerRead();
    expect(loads.at(-1)).toMatchObject({
      visibleRange: at(7),
      selectedRange: at(7),
    });
  });

  it("keeps the document it read when the editor switched scripts during the read", async () => {
    mocks.editor = editorAt(1);
    await mount();
    await waitForRead();
    mocks.editor = editorAt(5, "file:///project/other.sd");
    await answerRead();
    expect(loads.at(-1)).toMatchObject({
      textDocument: { uri: URI, text: "hello\n" },
      selectedRange: at(1),
    });
  });
});
