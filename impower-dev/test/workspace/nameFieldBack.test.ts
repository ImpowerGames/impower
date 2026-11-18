import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const { default: WorkspaceWindow } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceWindow");
const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { NameRow } = await import("../../src/modules/spark-editor/components/library-page");

let win: InstanceType<typeof WorkspaceWindow> | undefined;
let host: HTMLDivElement | undefined;

const mount = () => {
  win = new WorkspaceWindow({
    fs: {
      getLoadedProjectId: () => "project",
      getFileUri: (projectId: string, filename: string) => `file:///${projectId}/${filename}`,
      getRelativePath: (projectId: string, uri: string) => uri.slice(`file:///${projectId}/`.length),
    },
  } as unknown as ConstructorParameters<typeof WorkspaceWindow>[0]);
  return win;
};

const tick = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  win?.dispose();
  win = undefined;
  window.history.replaceState(null, "", window.location.pathname);
});

describe("Back with a name field open on a browser without CloseWatcher", () => {
  it("leaves the route and discards the draft instead of committing it", async () => {
    const w = mount();
    w.openPane("share");
    w.navigateTo("collection");
    host = document.body.appendChild(document.createElement("div"));
    const onCommit = vi.fn(async () => {});
    const onCancel = vi.fn();
    await act(async () =>
      render(h(NameRow, { icon: null, label: "Rename", initial: "intro", onCommit, onCancel }), host!),
    );
    const input = host.querySelector("input")!;
    await act(async () => input.focus());
    await act(async () => {
      input.value = "outro";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const popped = new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true }));
    window.history.back();
    await popped;
    await tick();
    await act(async () => {
      input.blur();
    });
    await tick();
    expect(window.location.hash).toBe("#share");
    expect(workspace.current.pane).toBe("share");
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
