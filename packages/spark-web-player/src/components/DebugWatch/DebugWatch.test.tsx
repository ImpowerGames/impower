import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  mountRows,
  openMenu,
  press,
  rowTexts,
  settle,
  stubLayout,
  unmountRows,
} from "../DebugVariables/debugCardsHarness";
import {
  DEBUG_WATCH_TEXT,
  DebugWatchRowView,
  debugWatchRowHeight,
  debugWatchRows,
  type DebugWatchEntry,
  type DebugWatchHandlers,
  type DebugWatchState,
} from "./DebugWatch";

const handlers = (): DebugWatchHandlers => ({
  onOpenChange: vi.fn(),
  onAdd: vi.fn(),
  onEdit: vi.fn(),
  onChange: vi.fn(),
  onRemove: vi.fn(),
});

const mount = (state: DebugWatchState, h = handlers()) =>
  mountRows(debugWatchRows(state), (row) => (
    <DebugWatchRowView row={row} handlers={h} />
  )).then((root) => ({ root, h }));

const gold: DebugWatchEntry = { key: "0", expression: "gold", value: "3" };
const silver: DebugWatchEntry = {
  key: "1",
  expression: "silver",
  error: "not available in this frame",
};

beforeAll(stubLayout);
afterEach(unmountRows);

describe("the Watch card", () => {
  it("asks for an expression when the list is empty, with the add field at its foot", async () => {
    const state: DebugWatchState = { status: "paused", open: true, entries: [], editing: null };
    const { root } = await mount(state);
    expect(rowTexts(root)).toEqual([DEBUG_WATCH_TEXT.title, "Add an expression to watch it.", "", ""]);
    expect(debugWatchRows(state).map(debugWatchRowHeight)).toEqual([50, 52, 44, 15]);
    const field = root.querySelector<HTMLInputElement>('[aria-label="Add an expression to watch"]')!;
    expect(field.placeholder).toBe("Add expression");
  });

  it("adds the typed expression on Enter and clears the field", async () => {
    const { root, h } = await mount({ status: "paused", open: true, entries: [], editing: null });
    const field = root.querySelector<HTMLInputElement>('[aria-label="Add an expression to watch"]')!;
    field.value = "  gold  ";
    await press(field, "Enter");
    expect(h.onAdd).toHaveBeenCalledWith("gold");
    expect(field.value).toBe("");
    await press(field, "Enter");
    expect(h.onAdd).toHaveBeenCalledTimes(1);
  });

  it("lists expressions as not available while the story runs", async () => {
    const { root } = await mount({ status: "running", open: true, entries: [gold, silver], editing: null });
    expect(rowTexts(root).slice(1, 3)).toEqual([
      "gold not available while running",
      "silver not available while running",
    ]);
  });

  it("shows each value while paused, and a failed expression's message in the warning colour with its glyph", async () => {
    const { root } = await mount({ status: "paused", open: true, entries: [gold, silver], editing: null });
    expect(rowTexts(root).slice(1, 3)).toEqual(["gold 3", "silver not available in this frame"]);
    const warning = Array.from(root.querySelectorAll(".text-warning")).find((el) =>
      el.textContent?.includes("not available in this frame"),
    )!;
    expect(warning.querySelector("svg")).not.toBeNull();
  });

  it("edits and removes an expression from its row menu", async () => {
    const { root, h } = await mount({ status: "paused", open: true, entries: [gold], editing: null });
    let menu = await openMenu(root.querySelector('[aria-label="Options for gold"]')!);
    const items = () => Array.from(menu!.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(items().map((item) => item.textContent)).toEqual(["Edit", "Remove"]);
    await act(async () => items()[1]!.click());
    await settle();
    expect(h.onRemove).toHaveBeenCalledWith(gold);
    menu = await openMenu(root.querySelector('[aria-label="Options for gold"]')!);
    await act(async () => items()[0]!.click());
    await settle();
    expect(h.onEdit).toHaveBeenCalledWith(gold);

    await unmountRows();
    const editing = await mount({ status: "paused", open: true, entries: [gold], editing: "0" }, h);
    const field = editing.root.querySelector<HTMLInputElement>('[aria-label="Change the expression gold"]')!;
    expect(document.activeElement).toBe(field);
    field.value = "gold * 2";
    await press(field, "Enter");
    expect(h.onChange).toHaveBeenCalledWith(gold, "gold * 2");
  });
});
