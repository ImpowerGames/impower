import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { window: {} },
}));

const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { SyncStatusLine } =
  await import("../../src/modules/spark-editor/components/drive-sync");

let host: HTMLElement | undefined;

const caption = () =>
  host?.querySelector('[role="status"] button')?.textContent?.trim();

const setStatus = (status: "cached" | "synced") =>
  act(() => {
    workspace.current = {
      ...workspace.current,
      project: { ...workspace.current.project, id: "drive-file" },
      sync: { ...workspace.current.sync, status },
    };
  });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(Date.UTC(2026, 10, 5, 12, 0, 0));
  await setStatus("cached");
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(SyncStatusLine, null), host!));
});

afterEach(async () => {
  await act(async () => render(null, host!));
  host?.remove();
  host = undefined;
  vi.useRealTimers();
});

describe("the top bar's status line", () => {
  it("ages the last sync from the moment it happened, a minute at a time", async () => {
    await act(async () => {
      vi.advanceTimersByTime(45_000);
    });
    await setStatus("synced");
    expect(caption()).toBe("Saved to Google Drive just now");

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(caption()).toBe("Saved to Google Drive just now");

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(caption()).toBe("Saved to Google Drive 1m ago");

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(caption()).toBe("Saved to Google Drive 2m ago");
  });
});
