import type { Layout } from "@impower/impower-ui/layout";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const layout = vi.hoisted(() => ({ value: "phone", coarse: false }));

vi.mock("@impower/impower-ui/layout", () => ({
  useLayout: () => layout.value,
  layoutState: { current: () => layout.value, subscribe: () => () => {} },
  useCoarsePointer: () => layout.coarse,
}));

const { useFocusRule } =
  await import("../../src/modules/spark-editor/components/desktop-shell/naming");
const { NameRow } =
  await import("../../src/modules/spark-editor/components/library-page");
const { availableName } =
  await import("../../src/modules/spark-editor/utils/fileListModel");
const { default: workspace } =
  await import("../../src/modules/spark-editor/workspace/WorkspaceStore");

let host: HTMLDivElement | undefined;

function Harness() {
  useFocusRule();
  return h(
    "div",
    {},
    h("input", { "data-field": "", "aria-label": "Field" }),
    h("input", { "data-name": "", "data-name-field": "row", "aria-label": "Name" }),
    h("div", { contentEditable: "true", "data-script": "" }, "text"),
    h("button", { "data-bar-button": "" }, "Undo"),
    h("div", { "data-panel-background": "" }),
    h("a", { href: "#x", "data-link": "" }, "Link"),
    h("nav", {}, h("button", { "data-nav-button": "" }, "Story")),
    h("button", { "aria-haspopup": "menu", "data-menu-trigger": "" }, "Menu"),
  );
}

const press = (element: Element) => {
  const event = new MouseEvent("pointerdown", {
    bubbles: true,
    composed: true,
    cancelable: true,
  });
  element.dispatchEvent(event);
  return event.defaultPrevented;
};

const the = <T extends HTMLElement>(selector: string) =>
  host!.querySelector<T>(selector)!;

describe("the focus rule", () => {
  beforeEach(async () => {
    layout.value = "phone";
    workspace.layout.value = layout.value as Layout;
    layout.coarse = false;
    host = document.body.appendChild(document.createElement("div"));
    await act(async () => render(h(Harness, {}), host!));
  });

  afterEach(() => {
    render(null, host!);
    host?.remove();
    host = undefined;
  });

  it("leaves the focus on the script when a button or a background is pressed", () => {
    const script = the("[data-script]");
    script.focus();
    expect(press(the("[data-bar-button]"))).toBe(true);
    expect(press(the("[data-panel-background]"))).toBe(true);
  });

  it("lets another field, a link, the navigation and a menu trigger take the press", () => {
    the("[data-script]").focus();
    expect(press(the("[data-field]"))).toBe(false);
    expect(press(the("[data-link]"))).toBe(false);
    expect(press(the("[data-nav-button]"))).toBe(false);
    expect(press(the("[data-menu-trigger]"))).toBe(false);
  });

  it("commits a name field when blank space, a button or a header outside it is pressed", () => {
    const name = the<HTMLInputElement>("[data-name]");
    const blurred = vi.fn();
    name.addEventListener("blur", blurred);
    name.focus();
    expect(press(the("[data-panel-background]"))).toBe(false);
    expect(blurred).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(name);
    name.focus();
    expect(press(the("[data-bar-button]"))).toBe(false);
    expect(blurred).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["saves a valid rename", "gamma", undefined],
    ["keeps a clashing rename open with its message", "beta", "That name is already in use in this folder."],
  ])("%s when blank space outside the row is pressed", async (_case, typed, message) => {
    const committed: string[] = [];
    const onCancel = vi.fn();
    const rowHost = host!.appendChild(document.createElement("div"));
    await act(async () =>
      render(
        h(NameRow, {
          icon: null,
          label: "Rename alpha",
          initial: "alpha",
          suffix: ".sd",
          onCommit: async (name: string) => {
            availableName(name, ["beta.sd"], ".sd");
            committed.push(name);
          },
          onCancel,
        }),
        rowHost,
      ),
    );
    const input = rowHost.querySelector("input")!;
    await act(async () => {
      input.value = typed;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    let prevented = false;
    await act(async () => {
      prevented = press(the("[data-panel-background]"));
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(prevented).toBe(false);
    expect(onCancel).not.toHaveBeenCalled();
    if (message) {
      expect(committed).toEqual([]);
      expect(rowHost.querySelector('[role="alert"]')?.textContent).toBe(message);
      expect(document.activeElement).toBe(input);
    } else {
      expect(committed).toEqual([typed]);
    }
    render(null, rowHost);
  });

  it("leaves a name field alone when the press is inside it", () => {
    const name = the<HTMLInputElement>("[data-name]");
    name.focus();
    expect(press(name)).toBe(false);
    expect(document.activeElement).toBe(name);
  });

  it("does nothing while no text field has focus", () => {
    the<HTMLButtonElement>("[data-bar-button]").focus();
    expect(press(the("[data-panel-background]"))).toBe(false);
  });

  it("does nothing on a desktop layout with a fine pointer", async () => {
    layout.value = "desktop";
    workspace.layout.value = layout.value as Layout;
    await act(async () => render(h(Harness, { key: "desktop" }), host!));
    the("[data-script]").focus();
    expect(press(the("[data-bar-button]"))).toBe(false);
  });
});
