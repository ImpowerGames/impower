import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: ImportProgressBar } = await import(
  "../../src/modules/spark-editor/components/import-progress-bar/ImportProgressBar"
);

let host: HTMLDivElement | undefined;

afterEach(() => {
  if (host) render(null, host);
  host?.remove();
  host = undefined;
  workspace.importProgress.value = null;
});

describe("the progress bar while files are added", () => {
  it("is named Adding files and reports how far the files have got", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    workspace.importProgress.value = { loaded: 2, total: 5 };
    await act(async () => render(h(ImportProgressBar, {}), host!));
    const bar = host.querySelector<HTMLElement>('[role="progressbar"]')!;
    expect(bar.getAttribute("aria-label")).toBe("Adding files");
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
  });
});
