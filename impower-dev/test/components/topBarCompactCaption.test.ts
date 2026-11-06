import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { window: {} },
}));

let width = 1440;
const lists: (() => void)[] = [];

vi.stubGlobal("matchMedia", (query: string) => {
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const list = {
    media: query,
    get matches() {
      const minWidth = /^\(min-width: (\d+)px\)$/.exec(query);
      return minWidth ? width >= Number(minWidth[1]) : false;
    },
    addEventListener: (
      _: string,
      listener: (event: { matches: boolean }) => void,
    ) => listeners.add(listener),
    removeEventListener: (
      _: string,
      listener: (event: { matches: boolean }) => void,
    ) => listeners.delete(listener),
  };
  lists.push(() =>
    listeners.forEach((listener) => listener({ matches: list.matches })),
  );
  return list as unknown as MediaQueryList;
});

const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: TopBar } =
  await import("../../src/modules/spark-editor/components/desktop-shell/TopBar");

let host: HTMLElement | undefined;

const resize = async (next: number) => {
  width = next;
  await act(async () => {
    lists.forEach((fire) => fire());
  });
};

const caption = () => {
  const status = host!.querySelector<HTMLButtonElement>(
    '[role="status"] button',
  );
  return {
    layout: document.documentElement.dataset["layout"],
    text: status?.textContent?.trim(),
    tone: status?.dataset.tone,
    action: status?.dataset.action,
    glyph: !!status?.querySelector("svg"),
    syncButton: host!
      .querySelector("header > div:last-of-type button")
      ?.getAttribute("aria-label"),
  };
};

afterEach(async () => {
  await act(async () => render(null, host!));
  host?.remove();
  host = undefined;
});

describe("the top bar's Drive caption across layouts", () => {
  it.each([
    ["synced", "Saved to Google Drive 2m ago"],
    ["sync_error", "Could not sync project"],
    ["sync_conflict", "Sync conflict"],
    ["offline", "Offline · will sync when connected"],
  ] as const)(
    "shows the same %s caption at 1024 as at 1440",
    async (status, text) => {
      await resize(1440);
      await act(async () => {
        workspace.current = {
          ...workspace.current,
          project: { ...workspace.current.project, id: "drive-file" },
          sync: { ...workspace.current.sync, status: "cached" },
        };
      });
      host = document.body.appendChild(document.createElement("div"));
      await act(async () => render(h(TopBar, null), host!));
      await act(async () => {
        workspace.current = {
          ...workspace.current,
          sync: { ...workspace.current.sync, status },
        };
        workspace.syncedAt.value = Date.now() - 2 * 60_000;
      });

      const desktop = caption();
      await resize(1024);
      const compact = caption();

      expect(desktop.layout).toBe("desktop");
      expect(compact.layout).toBe("compact");
      expect(desktop.text).toBe(text);
      expect(desktop.syncButton).toBe(
        status === "sync_conflict" ? "Resolve sync conflict" : "Sync now",
      );
      expect({ ...compact, layout: undefined }).toEqual({
        ...desktop,
        layout: undefined,
      });
    },
  );
});
