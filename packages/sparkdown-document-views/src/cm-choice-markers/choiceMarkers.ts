import {
  Facet,
  StateEffect,
  StateField,
  type EditorState,
  type Text,
  type Transaction,
} from "@codemirror/state";
import {
  EditorView,
  type LayerMarker,
  layer,
  showTooltip,
  type Tooltip,
  ViewPlugin,
} from "@codemirror/view";
import { coarsePointer } from "@impower/codemirror-vscode-lsp-client/src";
import { iconMasks } from "@impower/impower-ui/icon-masks";

export type ChoiceMarkerIcon = "pinned" | "auto";

export interface ChoiceMarkerOption {
  text: string;
  taken: boolean;
  pinned: boolean;
}

export interface ChoiceMarker {
  line: number;
  icon: ChoiceMarkerIcon;
  title: string;
  text: string;
  options: ChoiceMarkerOption[];
  unpin: boolean;
  note?: string;
}

export type ChoiceMarkerAction =
  | { kind: "pin"; option: number }
  | { kind: "unpin" }
  | { kind: "route" };

export type ChoiceMarkerHandler = (
  line: number,
  action: ChoiceMarkerAction,
) => void;

export const choiceMarkerActions = Facet.define<
  ChoiceMarkerHandler,
  ChoiceMarkerHandler | null
>({
  combine: (values) => values.at(-1) ?? null,
});

interface PlacedMarker {
  from: number;
  marker: ChoiceMarker;
}

export const setChoiceMarkersEffect = StateEffect.define<ChoiceMarker[]>();

const openChoiceEffect = StateEffect.define<number | null>();

const place = (doc: Text, markers: readonly ChoiceMarker[]): PlacedMarker[] =>
  markers
    .filter(
      (marker) =>
        Number.isInteger(marker.line) &&
        marker.line >= 1 &&
        marker.line <= doc.lines,
    )
    .map((marker) => ({ from: doc.line(marker.line).from, marker }));

const mapMarkers = (
  markers: readonly PlacedMarker[],
  tr: Transaction,
): PlacedMarker[] => {
  const mapped: PlacedMarker[] = [];
  for (const placed of markers) {
    const line = tr.startState.doc.lineAt(placed.from);
    const from = tr.changes.mapPos(line.from, 1);
    const to = tr.changes.mapPos(line.to, -1);
    if (line.to > line.from && to <= from) {
      continue;
    }
    const at = tr.newDoc.lineAt(from).from;
    if (!mapped.some((m) => m.from === at)) {
      mapped.push({ from: at, marker: placed.marker });
    }
  }
  return mapped;
};

export const choiceMarkersField = StateField.define<readonly PlacedMarker[]>({
  create() {
    return [];
  },
  update(markers, tr) {
    if (tr.docChanged) {
      markers = mapMarkers(markers, tr);
    }
    for (const effect of tr.effects) {
      if (effect.is(setChoiceMarkersEffect)) {
        markers = place(tr.state.doc, effect.value);
      }
    }
    return markers;
  },
});

export const getChoiceMarkers = (
  state: EditorState,
): { line: number; icon: ChoiceMarkerIcon }[] =>
  [...(state.field(choiceMarkersField, false) ?? [])]
    .sort((a, b) => a.from - b.from)
    .map(({ from, marker }) => ({
      line: state.doc.lineAt(from).number,
      icon: marker.icon,
    }));

export const setChoiceMarkers = (view: EditorView, markers: ChoiceMarker[]) => {
  view.dispatch({ effects: setChoiceMarkersEffect.of(markers) });
};

const openChoiceField = StateField.define<number | null>({
  create() {
    return null;
  },
  update(open, tr) {
    if (open !== null && tr.docChanged) {
      open = tr.changes.mapPos(open, 1);
      open = tr.newDoc.lineAt(open).from;
    }
    for (const effect of tr.effects) {
      if (effect.is(openChoiceEffect)) {
        open = effect.value;
      }
    }
    if (
      open !== null &&
      !tr.state.field(choiceMarkersField).some((m) => m.from === open)
    ) {
      return null;
    }
    return open;
  },
  provide: (field) =>
    showTooltip.compute([field, choiceMarkersField], (state) => {
      const open = state.field(field);
      const placed = state.field(choiceMarkersField).find((m) => m.from === open);
      return placed ? choiceTooltip(placed) : null;
    }),
});

export const openChoicePopover = (view: EditorView, line: number | null) => {
  view.dispatch({
    effects: openChoiceEffect.of(
      line === null || line < 1 || line > view.state.doc.lines
        ? null
        : view.state.doc.line(line).from,
    ),
  });
};

export const openChoiceLine = (state: EditorState): number | null => {
  const open = state.field(openChoiceField, false);
  return open == null ? null : state.doc.lineAt(open).number;
};

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
) => {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) {
    el.textContent = text;
  }
  return el;
};

const icon = (name: ChoiceMarkerIcon | "arrow") => {
  const el = element("span", `cm-choice-icon cm-choice-icon-${name}`);
  el.setAttribute("aria-hidden", "true");
  return el;
};

const choiceTooltip = ({ from, marker }: PlacedMarker): Tooltip => ({
  pos: from,
  above: false,
  create: (view) => {
    const line = () => view.state.doc.lineAt(from).number;
    const act = (action: ChoiceMarkerAction) => {
      view.state.facet(choiceMarkerActions)?.(line(), action);
    };
    const dom = element("div", "cm-choice-popover");
    dom.setAttribute("role", "dialog");
    dom.setAttribute("aria-label", marker.title);
    const head = element("div", "cm-choice-popover-head");
    head.append(icon(marker.icon), element("strong", "cm-choice-popover-title", marker.title));
    dom.append(head, element("p", "cm-choice-popover-text", marker.text));
    const list = element("ul", "cm-choice-popover-options");
    marker.options.forEach((option, index) => {
      const row = element("li", "cm-choice-popover-option");
      if (option.taken) {
        row.dataset["taken"] = "";
        row.append(icon("arrow"));
      }
      row.append(element("span", "cm-choice-popover-option-text", option.text));
      const pin = element(
        "button",
        "cm-choice-popover-pin",
        option.pinned ? "Pinned" : "Pin",
      );
      pin.type = "button";
      pin.setAttribute("aria-pressed", String(option.pinned));
      pin.title = option.pinned ? "Unpin this option" : "Pin this option here";
      if (option.pinned) {
        pin.prepend(icon("pinned"));
      }
      pin.addEventListener("click", () => act({ kind: "pin", option: index }));
      row.append(pin);
      list.append(row);
    });
    dom.append(list);
    if (marker.note) {
      const note = element("p", "cm-choice-popover-note", marker.note);
      note.setAttribute("role", "status");
      dom.append(note);
    }
    const foot = element("div", "cm-choice-popover-foot");
    if (marker.unpin) {
      const unpin = element("button", "cm-choice-popover-action", "Unpin");
      unpin.type = "button";
      unpin.addEventListener("click", () => act({ kind: "unpin" }));
      foot.append(unpin);
    }
    const route = element("button", "cm-choice-popover-action", "Whole route");
    route.type = "button";
    route.dataset["route"] = "";
    route.addEventListener("click", () => {
      openChoicePopover(view, null);
      act({ kind: "route" });
    });
    foot.append(route);
    dom.append(foot);
    dom.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        openChoicePopover(view, null);
        view.focus();
      }
    });
    return { dom };
  },
});

const MARKER_SIZE = 16;
const MARKER_LEFT = 2;

class ChoiceMarkerElement implements LayerMarker {
  constructor(
    readonly icon: ChoiceMarkerIcon,
    readonly line: number,
    readonly open: boolean,
    readonly left: number,
    readonly top: number,
  ) {}

  draw() {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "cm-choice-marker";
    this.adjust(el);
    return el;
  }

  update(el: HTMLElement, prev: ChoiceMarkerElement) {
    if (prev.icon !== this.icon) {
      return false;
    }
    this.adjust(el);
    return true;
  }

  adjust(el: HTMLElement) {
    el.dataset["icon"] = this.icon;
    el.dataset["line"] = String(this.line);
    el.setAttribute("aria-expanded", String(this.open));
    el.setAttribute(
      "aria-label",
      `${this.icon === "pinned" ? "Pinned choice" : "Choice"} on line ${this.line}`,
    );
    el.style.left = `${this.left}px`;
    el.style.top = `${this.top}px`;
  }

  eq(other: ChoiceMarkerElement) {
    return (
      this.icon === other.icon &&
      this.line === other.line &&
      this.open === other.open &&
      this.left === other.left &&
      this.top === other.top
    );
  }
}

const markerElements = (view: EditorView): ChoiceMarkerElement[] => {
  const scroller = view.scrollDOM;
  const rect = scroller.getBoundingClientRect();
  const offsetTop =
    (view.documentTop - rect.top) / view.scaleY + scroller.scrollTop;
  const open = view.state.field(openChoiceField);
  const { from, to } = view.viewport;
  return view.state
    .field(choiceMarkersField)
    .filter((placed) => placed.from >= from && placed.from <= to)
    .map((placed) => {
      const block = view.lineBlockAt(placed.from);
      return new ChoiceMarkerElement(
        placed.marker.icon,
        view.state.doc.lineAt(placed.from).number,
        placed.from === open,
        scroller.scrollLeft + MARKER_LEFT,
        offsetTop + block.top + (block.height - MARKER_SIZE) / 2,
      );
    });
};

const markerAt = (target: EventTarget | null): number | null => {
  const marker =
    target instanceof Element ? target.closest(".cm-choice-marker") : null;
  const line = Number(marker?.getAttribute("data-line"));
  return marker && Number.isInteger(line) ? line : null;
};

const choiceMarkerEvents = [
  ViewPlugin.define((view) => {
    const onClick = (event: MouseEvent) => {
      const line = markerAt(event.target);
      if (line === null) {
        return;
      }
      event.preventDefault();
      openChoicePopover(view, openChoiceLine(view.state) === line ? null : line);
    };
    const onOver = (event: MouseEvent) => {
      const line = markerAt(event.target);
      if (
        line !== null &&
        !view.state.facet(coarsePointer) &&
        openChoiceLine(view.state) !== line
      ) {
        openChoicePopover(view, line);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        openChoiceLine(view.state) === null ||
        (target instanceof Element &&
          target.closest(".cm-choice-popover, .cm-choice-marker"))
      ) {
        return;
      }
      openChoicePopover(view, null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        markerAt(event.target) === null ||
        openChoiceLine(view.state) === null
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      openChoicePopover(view, null);
    };
    view.scrollDOM.addEventListener("click", onClick);
    view.scrollDOM.addEventListener("mouseover", onOver);
    view.scrollDOM.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    return {
      destroy() {
        view.scrollDOM.removeEventListener("click", onClick);
        view.scrollDOM.removeEventListener("mouseover", onOver);
        view.scrollDOM.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("pointerdown", onPointerDown, true);
      },
    };
  }),
  EditorView.domEventHandlers({
    keydown(event, view) {
      if (event.key === "Escape" && openChoiceLine(view.state) !== null) {
        openChoicePopover(view, null);
        return true;
      }
      return false;
    },
  }),
];

const choiceMarkersTheme = EditorView.baseTheme({
  ".cm-choice-markers": {
    zIndex: "201",
    pointerEvents: "none",
  },
  ".cm-choice-marker": {
    position: "absolute",
    boxSizing: "border-box",
    width: `${MARKER_SIZE}px`,
    height: `${MARKER_SIZE}px`,
    padding: "0",
    border: "none",
    borderRadius: "var(--radius-sm)",
    backgroundColor: "var(--muted)",
    pointerEvents: "auto",
    cursor: "pointer",
    maskImage: iconMasks["options"],
    WebkitMaskImage: iconMasks["options"],
    maskSize: "contain",
    maskRepeat: "no-repeat",
  },
  ".cm-choice-marker::after": {
    content: '""',
    position: "absolute",
    inset: `-${MARKER_SIZE / 2}px`,
  },
  ".cm-choice-marker[data-icon='pinned']": {
    backgroundColor: "var(--accent)",
    maskImage: iconMasks["pin"],
    WebkitMaskImage: iconMasks["pin"],
  },
  ".cm-choice-marker:focus-visible": {
    outline: "2px solid var(--accent)",
    outlineOffset: "1px",
  },
  ".cm-choice-popover": {
    boxSizing: "border-box",
    display: "grid",
    gap: "8px",
    width: "min(340px, calc(100vw - 48px))",
    padding: "12px 14px",
    font: "400 13px / 1.5 var(--font-ui, inherit)",
  },
  ".cm-choice-popover-head": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  ".cm-choice-popover-title": {
    fontWeight: "600",
  },
  ".cm-choice-popover-text": {
    margin: "0",
    color: "var(--muted)",
  },
  ".cm-choice-popover-options": {
    display: "grid",
    gap: "2px",
    margin: "0",
    padding: "4px",
    listStyle: "none",
    border: "1px solid var(--edge)",
    borderRadius: "var(--radius)",
  },
  ".cm-choice-popover-option": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minHeight: "32px",
    padding: "0 4px 0 24px",
    borderRadius: "var(--radius-sm)",
  },
  ".cm-choice-popover-option[data-taken]": {
    paddingLeft: "4px",
    backgroundColor: "var(--syntax-active)",
  },
  ".cm-choice-popover-option-text": {
    flex: "1",
    minWidth: "0",
    font: "13px / 1.4 var(--font-script, monospace)",
    color: "var(--syntax-string)",
    overflowWrap: "anywhere",
  },
  ".cm-choice-popover-pin": {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    minHeight: "28px",
    padding: "0 10px",
    border: "1px solid var(--edge)",
    borderRadius: "var(--radius-sm)",
    backgroundColor: "transparent",
    color: "var(--ink)",
    font: "600 12px / 1 var(--font-ui, inherit)",
    cursor: "pointer",
  },
  ".cm-choice-popover-pin[aria-pressed='true']": {
    borderColor: "var(--accent)",
    backgroundColor: "var(--accent)",
    color: "var(--accent-ink)",
  },
  ".cm-choice-popover-note": {
    margin: "0",
    color: "var(--error)",
  },
  ".cm-choice-popover-foot": {
    display: "flex",
    justifyContent: "space-between",
  },
  ".cm-choice-popover-action": {
    padding: "4px 0",
    border: "none",
    backgroundColor: "transparent",
    color: "var(--accent)",
    font: "600 13px / 1.4 var(--font-ui, inherit)",
    cursor: "pointer",
  },
  ".cm-choice-popover-action[data-route]": {
    marginLeft: "auto",
  },
  ".cm-choice-icon": {
    display: "inline-block",
    flex: "none",
    width: "16px",
    height: "16px",
    backgroundColor: "currentColor",
    maskSize: "contain",
    maskRepeat: "no-repeat",
  },
  ".cm-choice-popover-head .cm-choice-icon": {
    color: "var(--accent)",
  },
  ".cm-choice-icon-pinned": {
    maskImage: iconMasks["pin"],
    WebkitMaskImage: iconMasks["pin"],
  },
  ".cm-choice-icon-auto": {
    maskImage: iconMasks["options"],
    WebkitMaskImage: iconMasks["options"],
  },
  ".cm-choice-icon-arrow": {
    color: "var(--muted)",
    maskImage: iconMasks["arrow"],
    WebkitMaskImage: iconMasks["arrow"],
  },
});

export const choiceMarkers = () => [
  choiceMarkersField,
  openChoiceField,
  layer({
    above: true,
    class: "cm-choice-markers",
    mount: (dom) => dom.removeAttribute("aria-hidden"),
    markers: markerElements,
    update: (update) =>
      update.docChanged ||
      update.viewportChanged ||
      update.geometryChanged ||
      update.startState.field(choiceMarkersField) !==
        update.state.field(choiceMarkersField) ||
      update.startState.field(openChoiceField) !==
        update.state.field(openChoiceField),
  }),
  choiceMarkerEvents,
  choiceMarkersTheme,
];
