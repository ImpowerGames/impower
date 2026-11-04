import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  importDroppedFiles: vi.fn(async () => undefined),
}));

vi.mock("@impower/impower-ui/components", () => ({ Download: () => null }));

vi.mock("../../src/modules/spark-editor/utils/importDroppedFiles", () => ({
  importDroppedFiles: mocks.importDroppedFiles,
}));

vi.mock("../../src/modules/spark-editor/workspace/WorkspaceStore", () => ({
  default: { state: { value: { project: { id: "p" } } } },
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { window: { importLocalProject: vi.fn() } },
}));

const { default: FileDropzone } = await import(
  "../../src/modules/spark-editor/components/file-dropzone/FileDropzone"
);

const host = document.createElement("div");

afterEach(async () => {
  await act(async () => {
    render(null, host);
  });
  host.remove();
});

const drop = (names: string[]) => {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      types: ["Files"],
      files: names.map((name) => new File(["x"], name)),
    },
  });
  window.dispatchEvent(event);
};

describe("FileDropzone routing", () => {
  it("files a dropped .luau and .sd under scripts/ and everything else under assets/", async () => {
    document.body.append(host);
    await act(async () => {
      render(h(FileDropzone, {}), host);
    });

    await act(async () => {
      drop(["util.luau", "intro.sd", "hero.png", "notes.txt"]);
    });
    await vi.waitFor(() =>
      expect(mocks.importDroppedFiles).toHaveBeenCalledTimes(1),
    );

    const [projectId, items] = mocks.importDroppedFiles.mock.calls[0] as unknown as [
      string,
      { rel: string }[],
    ];
    expect(projectId).toBe("p");
    expect(items.map((it) => it.rel)).toEqual([
      "scripts/util.luau",
      "scripts/intro.sd",
      "assets/hero.png",
      "assets/notes.txt",
    ]);
  });
});
