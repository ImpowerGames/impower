import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const intents = vi.hoisted(() => ({ window: { setListState: (_lists: unknown) => {}, persistNow: () => {} } }));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({ Workspace: intents }));

const { default: WorkspaceWindow } = await import("../../src/modules/spark-editor/workspace/WorkspaceWindow");
const { default: workspace, savedWorkspaceState } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { useSavedScroll } = await import("../../src/modules/spark-editor/components/library-page/pageState");

const KEY = "image:Assets/Images/Cast:name-asc";

type Order = "the workspace's listeners first" | "the list's listeners first";

let host: HTMLDivElement | undefined;
const opened: InstanceType<typeof WorkspaceWindow>[] = [];

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    await vi.advanceTimersByTimeAsync(0);
    host.remove();
    host = undefined;
  }
  opened.splice(0).forEach((workspaceWindow) => workspaceWindow.dispose());
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  vi.useRealTimers();
});

const Scroller = () => h("div", { ref: useSavedScroll("assetsScrolls", KEY), "data-scroller": "" });

const openWorkspaceWindow = () => {
  const workspaceWindow = new WorkspaceWindow({} as ConstructorParameters<typeof WorkspaceWindow>[0]);
  opened.push(workspaceWindow);
  intents.window.setListState = (lists) => workspaceWindow.setListState(lists as never);
  intents.window.persistNow = () => workspaceWindow.persistNow();
  return workspaceWindow;
};

const scrolledAfterSaving = async (order: Order, saved: number, scrolled: number) => {
  vi.useFakeTimers();
  localStorage.clear();
  workspace.current = { ...workspace.current, lists: {} };
  const first = openWorkspaceWindow();
  first.setListState({ assetsScrolls: { [KEY]: saved } });
  await vi.advanceTimersByTimeAsync(300);
  expect(savedWorkspaceState().lists?.assetsScrolls?.[KEY]).toBe(saved);
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(Scroller, {}), host!));
  if (order === "the list's listeners first") {
    opened.splice(0).forEach((workspaceWindow) => workspaceWindow.dispose());
    openWorkspaceWindow();
  }
  const element = host.querySelector<HTMLDivElement>("[data-scroller]")!;
  expect(element.scrollTop).toBe(saved);
  element.scrollTop = scrolled;
  element.dispatchEvent(new Event("scroll"));
};

const ORDERS: readonly Order[] = ["the workspace's listeners first", "the list's listeners first"];

describe("a list's saved scroll position reaches storage when the page is left (I-2545)", () => {
  it.each(ORDERS.flatMap((order) => [0, 100, 600, 1000].map((elapsed) => ({ order, elapsed }))))(
    "stores the latest position when the page is hidden $elapsed ms after the scroll, with $order",
    async ({ order, elapsed }) => {
      await scrolledAfterSaving(order, 1000, 6400);
      await vi.advanceTimersByTimeAsync(elapsed);
      window.dispatchEvent(new Event("pagehide"));
      expect(savedWorkspaceState().lists?.assetsScrolls?.[KEY]).toBe(6400);
    },
  );

  it.each(ORDERS)("stores the latest position when the tab is hidden, before any page hide, with %s", async (order) => {
    await scrolledAfterSaving(order, 1000, 6400);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(savedWorkspaceState().lists?.assetsScrolls?.[KEY]).toBe(6400);
  });

  it("stores the position after the save interval while the page stays open", async () => {
    await scrolledAfterSaving("the workspace's listeners first", 1000, 6400);
    await vi.advanceTimersByTimeAsync(500);
    expect(workspace.current.lists?.assetsScrolls?.[KEY]).toBe(6400);
    await vi.advanceTimersByTimeAsync(300);
    expect(savedWorkspaceState().lists?.assetsScrolls?.[KEY]).toBe(6400);
  });
});
