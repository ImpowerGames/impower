import { h, render } from "preact";
import { act } from "preact/test-utils";
import { expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  files: {} as Record<string, Record<string, unknown>>,
  scenesBefore: {} as Record<string, number>,
  uri: "file:///project/chapter_2.sd",
}));

vi.mock("@impower/sparkdown-document-views/src/modules/screenplay-preview/SparkdownScreenplayPreview", () => ({
  default: (props: { scenesBefore?: Record<string, number> }) => {
    mock.scenesBefore = props.scenesBefore ?? {};
    return null;
  },
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    window: { getActiveEditorForPane: () => ({ uri: mock.uri }) },
    fs: {
      getFiles: async () => mock.files,
      getRelativePath: (_project: string, uri: string) => uri.slice("file:///project/".length),
    },
  },
}));

const { default: PreviewScreenplay } = await import("../../src/modules/spark-editor/components/preview-screenplay/PreviewScreenplay");
const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { sendProtocolMessage } = await import("@impower/spark-editor-protocol/src/protocols/MessageProtocol");
const { DidWriteFilesMessage } = await import("@impower/spark-editor-protocol/src/protocols/workspace/DidWriteFilesMessage");
const { DidRenameFilesMessage } = await import("@impower/spark-editor-protocol/src/protocols/workspace/DidRenameFilesMessage");

const script = (name: string) => ({
  uri: `file:///project/${name}.sd`,
  name,
  ext: "sd",
  text: `scene ${name}\n  $: INT. ROOM - DAY\n  Hello.\nend\n`,
  version: 1,
  languageId: "sparkdown",
});

it("numbers the open script after the scripts before it, again once a script before it is renamed", async () => {
  const before = script("chapter_1");
  const active = script("chapter_2");
  mock.files = { [before.uri]: before, [active.uri]: active };
  const state = workspace.state.peek();
  workspace.state.value = { ...state, project: { ...state.project, id: "project" }, sync: {} } as typeof state;
  const host = document.body.appendChild(document.createElement("div"));
  try {
    await act(async () => render(h(PreviewScreenplay, {}), host));
    await vi.waitFor(() => expect(mock.scenesBefore[active.uri]).toBe(1), { timeout: 10_000 });
    const renamed = { ...before, uri: "file:///project/chapter_0.sd", name: "chapter_0" };
    await act(async () => {
      mock.files[renamed.uri] = renamed;
      sendProtocolMessage(DidWriteFilesMessage.type.notification({ files: [renamed], remote: false } as never));
    });
    await vi.waitFor(() => expect(mock.scenesBefore[active.uri]).toBe(2), { timeout: 10_000 });
    await act(async () => {
      delete mock.files[before.uri];
      sendProtocolMessage(DidRenameFilesMessage.type.notification({ files: [{ oldUri: before.uri, newUri: renamed.uri }] }));
    });
    await vi.waitFor(() => expect(mock.scenesBefore[active.uri]).toBe(1), { timeout: 10_000 });
  } finally {
    await act(async () => render(null, host));
    host.remove();
  }
}, 30_000);
