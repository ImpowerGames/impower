import "../tests/resizeObserverStub";
import { h, render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PreviewRoute } from "@impower/spark-engine/src/game/core/types/PreviewRoute";
import { LoadSave, SAVES_STYLESHEET_ID } from "../saves/SavesViews";
import { RouteList, type RouteListProps } from "./RouteViews";
import { ROUTE_LIST_STYLESHEET_ID } from "./routeListStylesheet";
import type { RouteViewState } from "./routeView";
import type { StartingValuesEvents } from "./StartingValuesViews";

const URI = "file:///project/main.sd";

const at = (line: number) => ({
  uri: URI,
  range: {
    start: { line: line - 1, character: 0 },
    end: { line: line - 1, character: 0 },
  },
});

const route = (): PreviewRoute => ({
  start: { scene: "interrogation", location: at(4) },
  target: at(21),
  decisions: [{ kind: "forced", location: at(15), text: "trust > 3", verdict: true }],
});

const SAVE = {
  id: "s1",
  kind: "saved" as const,
  name: "Before the trial",
  scene: "interrogation",
  line: 4,
  time: 0,
  gone: false,
};

let host: HTMLElement | undefined;

const mount = (node: ComponentChild) => {
  host = document.body.appendChild(document.createElement("div"));
  act(() => render(node, host!));
  return host;
};

afterEach(() => {
  if (host) {
    act(() => render(null, host!));
  }
  host = undefined;
  document.body.replaceChildren();
  document.head.replaceChildren();
});

const state = (extra: Partial<RouteViewState> = {}): RouteViewState => ({
  route: route(),
  open: true,
  toggles: { pinned: true, auto: true, forced: true, clipped: true },
  tab: "route",
  pins: [],
  ...extra,
});

const listProps = (extra: Partial<RouteListProps> = {}): RouteListProps => ({
  state: state(),
  nameOf: () => "main",
  onClose: vi.fn(),
  onToggle: vi.fn(),
  onShowLine: vi.fn(),
  onChangePins: vi.fn(),
  onPinLastRun: vi.fn(),
  ...extra,
});

const escape = (target: EventTarget = document.body) => {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

const press = (target: Element) =>
  act(() => {
    target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });

const valueEvents = (load: StartingValuesEvents["load"]): StartingValuesEvents => ({
  onSet: vi.fn(),
  onClear: vi.fn(),
  onDraft: vi.fn(),
  onResetAll: vi.fn(),
  onSearch: vi.fn(),
  load,
});

describe("the route list, wherever it is mounted", () => {
  it("brings its own stylesheet into the document it is mounted in", () => {
    mount(h(RouteList, listProps()));
    expect(document.getElementById(ROUTE_LIST_STYLESHEET_ID)?.tagName).toBe("STYLE");
  });

  it("closes on Escape", () => {
    const props = listProps();
    mount(h(RouteList, props));
    escape();
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves an Escape another control already handled, and one that cancels a starting value's draft", () => {
    const props = listProps({
      state: state({
        values: { start: "interrogation", values: {}, drafts: { trust: "2" }, unsaved: {}, search: "" },
      }),
    });
    const root = mount(h(RouteList, props));
    const handled = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    handled.preventDefault();
    act(() => {
      document.body.dispatchEvent(handled);
    });
    const row = root.appendChild(document.createElement("div"));
    row.className = "sv-row";
    row.dataset["key"] = "trust";
    escape(row);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("listens for nothing while closed", () => {
    const props = listProps({ state: state({ open: false }) });
    mount(h(RouteList, props));
    escape();
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

describe("the route list's tabs, head and rows", () => {
  const withValues = (tab: "route" | "values" = "route") =>
    listProps({
      state: state({
        tab,
        values: { start: "interrogation", values: {}, drafts: {}, unsaved: {}, search: "" },
      }),
      onTab: vi.fn(),
      values: valueEvents(undefined),
    });
  const tabs = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>("[role='tab']")];
  const key = async (target: Element, name: string) => {
    act(() => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  };

  it.each(["route", "values"] as const)(
    "points each tab's aria-controls at a tabpanel labelled by that tab while the %s tab is shown",
    (shown) => {
      const root = mount(h(RouteList, withValues(shown)));
      const [route, values] = tabs(root);
      expect(route!.getAttribute("aria-selected")).toBe(String(shown === "route"));
      expect(values!.getAttribute("aria-selected")).toBe(String(shown === "values"));
      for (const tab of [route!, values!]) {
        const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
        expect(panel?.getAttribute("role")).toBe("tabpanel");
        expect(panel?.getAttribute("aria-labelledby")).toBe(tab.id);
        expect(panel?.hidden).toBe(tab.getAttribute("aria-selected") !== "true");
      }
    },
  );

  it("moves focus between the tabs with the arrow keys, Home and End, keeping one tab in the tab order", async () => {
    const root = mount(h(RouteList, withValues()));
    const [route, values] = tabs(root);
    route!.focus();
    await key(route!, "ArrowRight");
    expect(document.activeElement).toBe(values);
    expect(values!.tabIndex).toBe(0);
    expect(route!.tabIndex).toBe(-1);
    await key(values!, "ArrowLeft");
    expect(document.activeElement).toBe(route);
    await key(route!, "End");
    expect(document.activeElement).toBe(values);
    await key(values!, "Home");
    expect(document.activeElement).toBe(route);
  });

  it("selects the focused tab on Enter", async () => {
    const props = withValues();
    const root = mount(h(RouteList, props));
    const [, values] = tabs(root);
    values!.focus();
    await key(values!, "Enter");
    expect(props.onTab).toHaveBeenCalledWith("values");
  });

  it("labels the close button and closes the list from it", () => {
    const props = listProps();
    const root = mount(h(RouteList, props));
    const close = root.querySelector<HTMLButtonElement>("button[aria-label='Close the route']")!;
    act(() => close.click());
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("sizes its tabs, head and rows from the impower-ui tab, panel head and compact row tokens", () => {
    const root = mount(h(RouteList, withValues()));
    const head = root.querySelector("[data-panel-head]")!;
    expect(head.className.split(/\s+/)).toContain("h-[var(--panel-head-height)]");
    expect(head.contains(root.querySelector("[role='tablist']"))).toBe(true);
    expect(head.contains(root.querySelector("button[aria-label='Close the route']"))).toBe(true);
    for (const tab of tabs(root)) {
      expect(tab.className.split(/\s+/)).toContain("min-h-[var(--tab-height)]");
    }
    const entries = [...root.querySelectorAll("[data-route-entry]")];
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      const body = entry.querySelector("[data-route-text]")!.closest("div.relative")!;
      expect(body.className.split(/\s+/)).toContain("min-h-[var(--list-row-compact-height)]");
    }
  });

  it("keeps a choice row's pressable area to its text, leaving the kind icon and badge outside it", () => {
    const choiceRoute: PreviewRoute = {
      ...route(),
      decisions: [
        {
          kind: "auto",
          location: at(8),
          text: "Tell the truth.",
          meeting: 1,
          options: [
            { location: at(8), text: "Tell the truth.", offer: 0 },
            { location: at(9), text: "Lie.", offer: 1 },
          ],
        },
      ],
    };
    const root = mount(h(RouteList, listProps({ state: state({ route: choiceRoute }) })));
    const entry = root.querySelector("[data-route-entry][data-kind='auto']")!;
    const pressable = [...entry.querySelectorAll("button")].filter(
      (b) => !b.hasAttribute("data-route-line"),
    );
    expect(pressable).toHaveLength(1);
    expect(pressable[0]!.getAttribute("aria-expanded")).toBe("false");
    expect(pressable[0]!.textContent).toBe("Choice Tell the truth.");
    expect(pressable[0]!.contains(entry.querySelector("svg.route-icon"))).toBe(false);
    expect(pressable[0]!.contains(entry.querySelector("[data-route-badge]"))).toBe(false);
  });

  it("fades every route label's overflow with one 16px right-edge mask", () => {
    const choiceRoute: PreviewRoute = {
      ...route(),
      decisions: [
        ...route().decisions,
        {
          kind: "auto",
          location: at(8),
          text: "Tell the truth.",
          meeting: 1,
          options: [
            { location: at(8), text: "Tell the truth.", offer: 0 },
            { location: at(9), text: "Lie.", offer: 1 },
          ],
        },
      ],
    };
    const root = mount(h(RouteList, listProps({ state: state({ route: choiceRoute }) })));
    const labels = [...root.querySelectorAll<HTMLElement>("[data-route-text]")];
    expect(labels).toHaveLength(3);
    const masked = (element: Element) =>
      element.className
        .split(/\s+/)
        .filter((c) => c.includes("mask") || c.includes("fade-edge"));
    for (const label of labels) {
      expect(masked(label)).toEqual([
        "[mask-image:linear-gradient(to_left,transparent_0,#000_16px)]",
      ]);
      for (let up = label.parentElement; up && !up.hasAttribute("data-impower-ui"); up = up.parentElement) {
        expect(masked(up)).toEqual([]);
      }
    }
  });
});

describe("the Load a save menu, wherever it is mounted", () => {
  it("brings its own stylesheet into the document it is mounted in", () => {
    mount(h(LoadSave, { saves: [SAVE], open: false, onOpen: vi.fn(), onPick: vi.fn() }));
    expect(document.getElementById(SAVES_STYLESHEET_ID)?.tagName).toBe("STYLE");
  });

  it("closes on a press outside it, and not on one inside it", () => {
    const onOpen = vi.fn();
    const root = mount(h(LoadSave, { saves: [SAVE], open: true, onOpen, onPick: vi.fn() }));
    press(root.querySelector(".sv-load-menu")!);
    expect(onOpen).not.toHaveBeenCalled();
    press(document.body);
    expect(onOpen).toHaveBeenCalledWith(false);
  });

  it("closes on Escape before the route list around it can", () => {
    const onClose = vi.fn();
    const onOpen = vi.fn();
    mount(
      h(
        RouteList,
        listProps({
          onClose,
          state: state({
            tab: "values",
            values: { start: "interrogation", values: {}, drafts: {}, unsaved: {}, search: "" },
          }),
          onTab: vi.fn(),
          values: valueEvents({ saves: [SAVE], open: true, onOpen, onPick: vi.fn() }),
        }),
      ),
    );
    expect(document.querySelector(".sv-load-menu")).not.toBeNull();
    const event = escape();
    expect(onOpen).toHaveBeenCalledWith(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("listens for nothing while closed", () => {
    const onOpen = vi.fn();
    mount(h(LoadSave, { saves: [SAVE], open: false, onOpen, onPick: vi.fn() }));
    press(document.body);
    escape();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
