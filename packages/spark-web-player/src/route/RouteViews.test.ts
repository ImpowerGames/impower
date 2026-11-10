import { h, render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PreviewRoute } from "@impower/spark-engine/src/game/core/types/PreviewRoute";
import { LoadSave, SAVES_STYLESHEET_ID } from "../saves/SavesViews";
import { ROUTE_LIST_STYLESHEET_ID, RouteList, type RouteListProps } from "./RouteViews";
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
