import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const window = vi.hoisted(() => ({ setListState: vi.fn() }));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({ Workspace: { window } }));

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { useSavedScroll } = await import("../../src/modules/spark-editor/components/library-page/pageState");

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

const Scroller = ({ tab }: { tab: string }) => {
  const saved = useSavedScroll("assetsScrolls", tab);
  return h("div", { "data-scroller": "", ref: (element: HTMLDivElement | null) => saved(element) });
};

const mount = async (tab: string) => {
  host ??= document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(Scroller, { tab }), host!));
  return host.querySelector("[data-scroller]") as HTMLDivElement;
};

describe("useSavedScroll", () => {
  it("leaves a scrolled element where it is when the same element is attached again", async () => {
    workspace.current = { ...workspace.current, lists: { assetsScrolls: { audio: 40 } } };
    const element = await mount("audio");
    expect(element.scrollTop).toBe(40);
    element.scrollTop = 600;
    await mount("audio");
    expect(element.scrollTop).toBe(600);
  });

  it("restores each tab's saved position when the tab changes", async () => {
    workspace.current = { ...workspace.current, lists: { assetsScrolls: { audio: 100, image: 250 } } };
    const element = await mount("audio");
    expect(element.scrollTop).toBe(100);
    await mount("image");
    expect(element.scrollTop).toBe(250);
    await mount("audio");
    expect(element.scrollTop).toBe(100);
  });
});
