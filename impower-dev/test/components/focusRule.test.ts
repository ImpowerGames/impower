import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const layout = vi.hoisted(() => ({ value: "phone", coarse: false }));

vi.mock("@impower/impower-ui/layout", () => ({
  useLayout: () => layout.value,
  useCoarsePointer: () => layout.coarse,
}));

const { useFocusRule } =
  await import("../../src/modules/spark-editor/components/desktop-shell/naming");

let host: HTMLDivElement | undefined;

function Harness() {
  useFocusRule();
  return h(
    "div",
    {},
    h("input", { "data-field": "", "aria-label": "Field" }),
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

  it("does nothing while no text field has focus", () => {
    the<HTMLButtonElement>("[data-bar-button]").focus();
    expect(press(the("[data-panel-background]"))).toBe(false);
  });

  it("does nothing on a desktop layout with a fine pointer", async () => {
    layout.value = "desktop";
    await act(async () => render(h(Harness, { key: "desktop" }), host!));
    the("[data-script]").focus();
    expect(press(the("[data-bar-button]"))).toBe(false);
  });
});
