import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  DEBUG_VARIABLES_TEXT,
  DebugVariablesRowView,
  debugVariablesRowHeight,
  debugVariablesRows,
  type DebugVariableNode,
  type DebugVariablesHandlers,
  type DebugVariablesState,
} from "./DebugVariables";
import {
  mountRows,
  openMenu,
  press,
  rowTexts,
  settle,
  stubLayout,
  unmountRows,
} from "./debugCardsHarness";

const leaf = (
  key: string,
  name: string,
  value: string,
  more: Partial<DebugVariableNode> = {},
): DebugVariableNode => ({
  key,
  name,
  value,
  expandable: false,
  expanded: false,
  editable: true,
  breakable: true,
  breaking: false,
  ...more,
});

const scope = (
  key: string,
  name: string,
  children: DebugVariableNode[],
  expanded = true,
): DebugVariableNode => ({
  key,
  name,
  value: "",
  expandable: true,
  expanded,
  editable: false,
  breakable: false,
  breaking: false,
  children,
});

const handlers = (): DebugVariablesHandlers => ({
  onOpenChange: vi.fn(),
  onToggle: vi.fn(),
  onEdit: vi.fn(),
  onSetValue: vi.fn(),
  onBreakOnChange: vi.fn(),
});

const mount = (state: DebugVariablesState, h = handlers()) =>
  mountRows(debugVariablesRows(state), (row) => (
    <DebugVariablesRowView row={row} handlers={h} />
  )).then((root) => ({ root, h }));

const paused = (
  scopes: DebugVariableNode[],
  editing: string | null = null,
): DebugVariablesState => ({ status: "paused", open: true, scopes, editing });

beforeAll(stubLayout);
afterEach(unmountRows);

describe("the Variables card", () => {
  it("asks to pause while the story runs and to play when no run is open", async () => {
    let { root } = await mount({ status: "running", open: true, scopes: [], editing: null });
    expect(rowTexts(root)).toEqual([
      DEBUG_VARIABLES_TEXT.title,
      "Pause the story to inspect it.",
      "",
    ]);
    ({ root } = await mount({ status: "none", open: true, scopes: [], editing: null }));
    expect(rowTexts(root)[1]).toBe("Play the story to inspect it.");
  });

  it("folds to its head, and its head asks to open it", async () => {
    const { root, h } = await mount({ status: "paused", open: false, scopes: [], editing: null });
    expect(rowTexts(root)).toEqual([DEBUG_VARIABLES_TEXT.title]);
    const toggle = root.querySelector<HTMLButtonElement>("[aria-expanded]")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await act(async () => toggle.click());
    expect(h.onOpenChange).toHaveBeenCalledWith(true);
  });

  it("lists each scope and its values as name and value, deeper rows indented under an open branch", async () => {
    const party = leaf("vars/party", "party", "{...}", {
      expandable: true,
      expanded: true,
      editable: false,
      children: [leaf("vars/party/1", "1", "\"Ada\"", { editable: false, breakable: false })],
    });
    const state = paused([
      scope("vars", "Vars", [leaf("vars/gold", "gold", "3"), party]),
      scope("temps", "Temps", [leaf("temps/bag", "bag", "2")], false),
    ]);
    const { root, h } = await mount(state);
    expect(rowTexts(root)).toEqual([
      DEBUG_VARIABLES_TEXT.title,
      "Vars",
      "gold 3",
      "party {...}",
      "1 \"Ada\"",
      "Temps",
      "",
    ]);
    const rows = debugVariablesRows(state);
    expect(rows.map(debugVariablesRowHeight)).toEqual([50, 44, 44, 44, 44, 44, 15]);
    const temps = root.querySelector<HTMLButtonElement>('[aria-label="Expand Temps"]')!;
    expect(temps.getAttribute("aria-expanded")).toBe("false");
    await act(async () => temps.click());
    expect(h.onToggle).toHaveBeenCalledWith(expect.objectContaining({ key: "temps" }));
    expect(root.querySelector('[aria-label="Collapse party"]')).not.toBeNull();
    const goldRow = root.querySelector('[aria-label="Change gold, now 3"]')!.parentElement!;
    expect(
      Array.from(goldRow.querySelectorAll(':scope > span[aria-hidden="true"]')).some((span) =>
        span.classList.contains("w-11"),
      ),
    ).toBe(true);
  });

  it("starts editing an editable value on a click and commits the typed value on Enter", async () => {
    const gold = leaf("vars/gold", "gold", "3");
    const { root, h } = await mount(paused([scope("vars", "Vars", [gold])]));
    const row = root.querySelector<HTMLButtonElement>('[aria-label="Change gold, now 3"]')!;
    await act(async () => row.click());
    expect(h.onEdit).toHaveBeenCalledWith(gold);

    const editing = await mount(paused([scope("vars", "Vars", [gold])], "vars/gold"), h);
    const field = editing.root.querySelector<HTMLInputElement>('[aria-label="New value for gold"]')!;
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe("3");
    field.value = "12";
    await press(field, "Enter");
    expect(h.onSetValue).toHaveBeenCalledWith(gold, "12");
  });

  it("cancels an edit on Escape without setting the value", async () => {
    const gold = leaf("vars/gold", "gold", "3");
    const { root, h } = await mount(paused([scope("vars", "Vars", [gold])], "vars/gold"));
    const field = root.querySelector<HTMLInputElement>('[aria-label="New value for gold"]')!;
    field.value = "99";
    await press(field, "Escape");
    expect(h.onEdit).toHaveBeenCalledWith(null);
    expect(h.onSetValue).not.toHaveBeenCalled();
  });

  it("shows a refused value's message under its row, in the warning colour", async () => {
    const gold = leaf("vars/gold", "gold", "3", { message: "Expected a value." });
    const { root } = await mount(paused([scope("vars", "Vars", [gold])]));
    expect(rowTexts(root)).toEqual([
      DEBUG_VARIABLES_TEXT.title,
      "Vars",
      "gold 3",
      "Expected a value.",
      "",
    ]);
    const alert = root.querySelector('[role="alert"]')!;
    expect(alert.className).toContain("text-warning");
  });

  it("offers Break when value changes in the row menu and marks a row that breaks with a dot", async () => {
    const gold = leaf("vars/gold", "gold", "3");
    const { root, h } = await mount(paused([scope("vars", "Vars", [gold])]));
    expect(root.querySelector(`[aria-label="${DEBUG_VARIABLES_TEXT.breaking}"]`)).toBeNull();
    const menu = await openMenu(root.querySelector('[aria-label="Options for gold"]')!);
    const item = Array.from(menu!.querySelectorAll('[role="menuitemcheckbox"]')).find(
      (el) => el.textContent?.includes("Break when value changes"),
    )!;
    expect(item.getAttribute("aria-checked")).toBe("false");
    await act(async () => (item as HTMLElement).click());
    await settle();
    expect(h.onBreakOnChange).toHaveBeenCalledWith(gold, true);
    await unmountRows();

    const watched = await mount(
      paused([scope("vars", "Vars", [{ ...gold, breaking: true }])]),
    );
    expect(
      watched.root.querySelector(`[aria-label="${DEBUG_VARIABLES_TEXT.breaking}"]`)!.className,
    ).toContain("bg-accent");
  });
});
