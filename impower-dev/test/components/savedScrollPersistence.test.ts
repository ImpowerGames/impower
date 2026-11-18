import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const intents = vi.hoisted(() => ({ window: { setListState: (_lists: unknown) => {} } }));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({ Workspace: intents }));

const { default: WorkspaceWindow } = await import("../../src/modules/spark-editor/workspace/WorkspaceWindow");
const { default: workspace, savedWorkspaceState } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { useSavedScroll } = await import("../../src/modules/spark-editor/components/library-page/pageState");

const KEY = "image:Assets/Images/Cast:name-asc";

let host: HTMLDivElement | undefined;
let workspaceWindow: InstanceType<typeof WorkspaceWindow> | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    await vi.advanceTimersByTimeAsync(0);
    host.remove();
    host = undefined;
  }
  workspaceWindow?.dispose();
  workspaceWindow = undefined;
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  vi.useRealTimers();
});

const Scroller = () => h("div", { ref: useSavedScroll("assetsScrolls", KEY), "data-scroller": "" });

const scrolledAfterSaving = async (saved: number, scrolled: number) => {
  vi.useFakeTimers();
  localStorage.clear();
  workspace.current = { ...workspace.current, lists: {} };
  const opened = new WorkspaceWindow({} as ConstructorParameters<typeof WorkspaceWindow>[0]);
  workspaceWindow = opened;
  intents.window.setListState = (lists) => opened.setListState(lists as never);
  opened.setListState({ assetsScrolls: { [KEY]: saved } });
  await vi.advanceTimersByTimeAsync(300);
  expect(savedWorkspaceState().lists?.assetsScrolls?.[KEY]).toBe(saved);
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(Scroller, {}), host!));
  const element = host.querySelector<HTMLDivElement>("[data-scroller]")!;
  expect(element.scrollTop).toBe(saved);
  element.scrollTop = scrolled;
  element.dispatchEvent(new Event("scroll"));
};

describe("a list's saved scroll position reaches storage when the page is left (I-2545)", () => {
  it.each([0, 100, 600, 1000])("stores the latest position when the page is hidden %i ms after the scroll", async (elapsed) => {
    await scrolledAfterSaving(1000, 6400);
    await vi.advanceTimersByTimeAsync(elapsed);
    window.dispatchEvent(new Event("pagehide"));
    expect(savedWorkspaceState().lists?.assetsScrolls?.[KEY]).toBe(6400);
  });

  it("stores the latest position when the tab is hidden, before any page hide", async () => {
    await scrolledAfterSaving(1000, 6400);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(savedWorkspaceState().lists?.assetsScrolls?.[KEY]).toBe(6400);
  });

  it("stores the position after the save interval while the page stays open", async () => {
    await scrolledAfterSaving(1000, 6400);
    await vi.advanceTimersByTimeAsync(500);
    expect(workspace.current.lists?.assetsScrolls?.[KEY]).toBe(6400);
    await vi.advanceTimersByTimeAsync(300);
    expect(savedWorkspaceState().lists?.assetsScrolls?.[KEY]).toBe(6400);
  });
});
