import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  mountRows,
  rowTexts,
  stubLayout,
  unmountRows,
} from "../DebugVariables/debugCardsHarness";
import {
  DEBUG_CALL_STACK_TEXT,
  DebugCallStackRowView,
  debugCallStackRows,
  type DebugCallStackHandlers,
  type DebugCallStackState,
  type DebugFrameEntry,
} from "./DebugCallStack";

const handlers = (): DebugCallStackHandlers => ({
  onOpenChange: vi.fn(),
  onSelect: vi.fn(),
});

const mount = (state: DebugCallStackState, h = handlers()) =>
  mountRows(debugCallStackRows(state), (row) => (
    <DebugCallStackRowView row={row} handlers={h} />
  )).then((root) => ({ root, h }));

const shop: DebugFrameEntry = { id: 2, name: "shop", location: "main.sd:12", inProject: true, selected: true };
const start: DebugFrameEntry = { id: 1, name: "start", location: "main.sd:4", inProject: true, selected: false };
const builtin: DebugFrameEntry = { id: 3, name: "random", location: "builtins:1", inProject: false, selected: false };

beforeAll(stubLayout);
afterEach(unmountRows);

describe("the Call stack card", () => {
  it("asks to pause while running and to play with no run", async () => {
    let { root } = await mount({ status: "running", open: true, frames: [] });
    expect(rowTexts(root)).toEqual([DEBUG_CALL_STACK_TEXT.title, "Pause the story to inspect it.", ""]);
    ({ root } = await mount({ status: "none", open: true, frames: [] }));
    expect(rowTexts(root)[1]).toBe("Play the story to inspect it.");
  });

  it("lists frames top first as name and path:line, marking the selected frame", async () => {
    const { root } = await mount({ status: "paused", open: true, frames: [shop, start] });
    expect(rowTexts(root)).toEqual([DEBUG_CALL_STACK_TEXT.title, "shop main.sd:12", "start main.sd:4", ""]);
    const rows = Array.from(root.querySelectorAll<HTMLButtonElement>("button[aria-label^='Show']"));
    expect(rows.map((row) => row.getAttribute("aria-current"))).toEqual(["location", null]);
  });

  it("lists a single frame at the top level", async () => {
    const { root } = await mount({ status: "paused", open: true, frames: [{ ...start, selected: true }] });
    expect(rowTexts(root)).toEqual([DEBUG_CALL_STACK_TEXT.title, "start main.sd:4", ""]);
  });

  it("asks to show a frame when it is tapped", async () => {
    const { root, h } = await mount({ status: "paused", open: true, frames: [shop, start] });
    await act(async () => root.querySelector<HTMLButtonElement>('[aria-label="Show start at main.sd:4"]')!.click());
    expect(h.onSelect).toHaveBeenCalledWith(start);
  });

  it("titles a frame outside the project's scripts and shows its place without a link", async () => {
    const { root } = await mount({ status: "paused", open: true, frames: [shop, builtin] });
    const outside = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.title === "This frame is outside the project's scripts.",
    )!;
    expect(outside.textContent).toContain("builtins:1");
    expect(outside.querySelector(".text-accent")).toBeNull();
    const inside = root.querySelector<HTMLButtonElement>('[aria-label="Show shop at main.sd:12"]')!;
    expect(inside.querySelector(".text-accent")).not.toBeNull();
  });
});
