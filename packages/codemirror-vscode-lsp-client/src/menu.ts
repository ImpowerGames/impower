import {
  EditorState,
  Extension,
  Facet,
  StateEffect,
  StateField,
  Transaction,
} from "@codemirror/state";
import {
  EditorView,
  showTooltip,
  Tooltip,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import {
  ContextMenuItem,
  lspContextMenuItems,
  recordMenuClipboard,
  textContextMenuItems,
} from "./context";
import { coarsePointer } from "./pointer";

const contextMenuTheme = EditorView.baseTheme({
  ".cm-tooltip.cm-context-menu": {
    boxSizing: "border-box",
    width: "250px",
    maxWidth: "calc(100vw - 24px)",
    padding: "6px",
    border: "1px solid var(--edge)",
    borderRadius: "var(--radius)",
    backgroundColor: "var(--popup)",
    color: "var(--ink)",
    boxShadow: "var(--float-shadow)",
    font: "400 13px / 1.4 var(--font-ui, inherit)",
    userSelect: "none",
    whiteSpace: "nowrap",
    pointerEvents: "auto",
    zIndex: "1000",
    transformOrigin: "top left",
  },
  ".cm-context-menu .cm-menu-item": {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "20px",
    boxSizing: "border-box",
    minHeight: "34px",
    padding: "0 12px",
    borderRadius: "var(--control-radius)",
    cursor: "pointer",
  },
  ".cm-context-menu .cm-menu-shortcut": {
    font: "400 12px / 1 var(--font-ui, inherit)",
    color: "var(--muted)",
  },
  ".cm-context-menu .cm-menu-item.cm-menu-disabled": {
    opacity: "0.4",
    cursor: "default",
  },
  ".cm-context-menu .cm-menu-separator": {
    height: "1px",
    margin: "6px 0",
    backgroundColor: "var(--edge)",
  },
  ".cm-context-menu .cm-menu-item:not(.cm-menu-disabled):active": {
    backgroundColor: "var(--control-hover)",
  },
  "@media (hover: hover)": {
    ".cm-context-menu .cm-menu-item:not(.cm-menu-disabled):hover": {
      backgroundColor: "var(--control-hover)",
    },
  },
  "@media (prefers-reduced-motion: no-preference)": {
    ".cm-tooltip.cm-context-menu": {
      animation: "cm-context-menu-in 150ms ease-out",
    },
  },
  "@keyframes cm-context-menu-in": {
    from: { opacity: "0", transform: "scale(0.97)" },
    to: { opacity: "1", transform: "scale(1)" },
  },
});

export interface ContextMenuSpec {
  x?: number;
  y?: number;
  pos: number;
  end?: number;
  clip?: boolean;
}

export interface ContextMenuEntry {
  label: string;
  shortcut?: string;
  disabled: boolean;
  run: () => void;
}

export type ContextMenuModelItem = ContextMenuEntry | { type: "separator" };

export interface ContextMenuModel {
  items: ContextMenuModelItem[];
  dismiss: () => void;
}

export type ContextMenuPresenter = (menu: ContextMenuModel | null) => void;

const contextMenuPresenter = Facet.define<
  ContextMenuPresenter,
  ContextMenuPresenter | null
>({
  combine: (values) => values.at(-1) ?? null,
});

export function presentContextMenu(presenter: ContextMenuPresenter): Extension {
  return contextMenuPresenter.of(presenter);
}

const hostsMenu = (state: EditorState) =>
  state.facet(coarsePointer) && state.facet(contextMenuPresenter) != null;

const openContextMenu = StateEffect.define<ContextMenuSpec>();
const closeContextMenu = StateEffect.define<void>();

interface OpenMenu {
  spec: ContextMenuSpec;
  tooltip: Tooltip | null;
}

const contextMenuState = StateField.define<OpenMenu | null>({
  create() {
    return null;
  },
  update(value, tr) {
    if (value && tr.docChanged) {
      const { spec } = value;
      const empty = spec.end == null || spec.end === spec.pos;
      value = tr.annotation(Transaction.userEvent)
        ? null
        : menuFor(tr.state, {
            ...spec,
            pos: tr.changes.mapPos(spec.pos, empty ? -1 : 1),
            end:
              spec.end == null ? undefined : tr.changes.mapPos(spec.end, -1),
          });
    }
    for (const e of tr.effects) {
      if (e.is(openContextMenu)) {
        value = menuFor(tr.state, e.value);
      } else if (e.is(closeContextMenu)) {
        value = null;
      }
    }
    return value;
  },
  provide: (f) => showTooltip.from(f, (menu) => menu?.tooltip ?? null),
});

function menuFor(state: EditorState, spec: ContextMenuSpec): OpenMenu {
  return {
    spec,
    tooltip: hostsMenu(state) ? null : createContextMenuTooltip(spec),
  };
}

function shownItems(view: EditorView, pos: number): ContextMenuItem[] {
  const { state } = view;
  const coarse = state.facet(coarsePointer);
  const empty = state.selection.main.empty;
  const items = state.facet(contextMenuConfig).items ?? [];
  const kept = items.filter(
    (item) =>
      !("label" in item) ||
      ((!item.when || item.when(state, pos)) &&
        !(coarse && empty && item.needsSelection)),
  );
  return kept.filter(
    (item, index) =>
      !("type" in item) ||
      (index > 0 &&
        index < kept.length - 1 &&
        !("type" in kept[index - 1]!)),
  );
}

function isDisabled(view: EditorView, item: ContextMenuItem) {
  return (
    "label" in item &&
    ((item.needsSelection === true && view.state.selection.main.empty) ||
      item.disabled?.() === true)
  );
}

function runItem(view: EditorView, item: ContextMenuItem) {
  if (!("label" in item) || isDisabled(view, item)) {
    return;
  }
  view.dispatch({ effects: closeContextMenu.of() });
  item.command(view);
  if (view.state.facet(coarsePointer) && item.keepsMenuOpen) {
    const selection = view.state.selection.main;
    view.dispatch({
      selection: view.state.selection,
      userEvent: "select.touch",
      effects: openContextMenu.of({ pos: selection.from, end: selection.to }),
    });
  }
}

function menuModel(view: EditorView, spec: ContextMenuSpec): ContextMenuModel {
  return {
    items: shownItems(view, spec.pos).map((item) =>
      "label" in item
        ? {
            label: view.state.phrase(item.label!),
            shortcut: item.shortcut,
            disabled: isDisabled(view, item),
            run: () => runItem(view, item),
          }
        : { type: "separator" },
    ),
    dismiss: () => hideContextMenu(view),
  };
}

const openMenuRefreshers = new Set<() => void>();

function createContextMenuTooltip(spec: ContextMenuSpec): Tooltip {
  const { x, y, pos, end, clip = false } = spec;
  return {
    pos,
    end,
    clip,
    arrow: false,
    create(view: EditorView) {
      const dom = document.createElement("div");
      dom.className = "cm-context-menu";
      dom.setAttribute("role", "menu");
      dom.addEventListener("mousedown", (e) => e.preventDefault());

      const coarse = view.state.facet(coarsePointer);
      const refreshers: (() => void)[] = [];
      const refresh = () => refreshers.forEach((f) => f());
      openMenuRefreshers.add(refresh);

      shownItems(view, pos).forEach((item) => {
        if (!("label" in item)) {
          const sep = document.createElement("div");
          sep.className = "cm-menu-separator";
          sep.setAttribute("role", "separator");
          dom.appendChild(sep);
          return;
        }
        const itemEl = document.createElement("div");
        itemEl.className = "cm-menu-item cm-menu-option";
        itemEl.setAttribute("role", "menuitem");
        const labelSpan = document.createElement("span");
        labelSpan.textContent = view.state.phrase(item.label!);
        itemEl.appendChild(labelSpan);
        if (!coarse && item.shortcut) {
          const shortcutSpan = document.createElement("span");
          shortcutSpan.className = "cm-menu-shortcut";
          shortcutSpan.textContent = item.shortcut;
          itemEl.appendChild(shortcutSpan);
        }
        const showDisabled = () => {
          const disabled = isDisabled(view, item);
          itemEl.classList.toggle("cm-menu-disabled", disabled);
          itemEl.setAttribute("aria-disabled", String(disabled));
        };
        showDisabled();
        refreshers.push(showDisabled);
        itemEl.onclick = (e) => {
          e.stopPropagation();
          runItem(view, item);
        };
        dom.appendChild(itemEl);
      });

      return {
        dom,
        overlap: true,
        destroy() {
          openMenuRefreshers.delete(refresh);
        },
        getCoords:
          x !== undefined && y !== undefined
            ? () => ({ left: x, right: x, top: y, bottom: y })
            : undefined,
      };
    },
  };
}

const contextMenuHandlers = EditorView.domEventHandlers({
  contextmenu(event, view) {
    event.preventDefault();
    event.stopPropagation();

    if (view.state.facet(coarsePointer)) {
      const from = view.state.selection.main.from;
      const to = view.state.selection.main.to;
      view.dispatch({
        effects: openContextMenu.of({ pos: from, end: to }),
      });
    } else {
      const pos = view.posAtCoords(
        {
          x: event.clientX,
          y: event.clientY,
        },
        false,
      );
      view.dispatch({
        effects: openContextMenu.of({
          pos,
          x: event.clientX,
          y: event.clientY,
        }),
      });
    }

    return true;
  },
  keydown(event, view) {
    if (event.key !== "Escape" || !isContextMenuOpen(view)) {
      return false;
    }
    hideContextMenu(view);
    return true;
  },
  copy: recordNativeCopy,
  cut: recordNativeCopy,
});

function recordNativeCopy(_event: ClipboardEvent, view: EditorView) {
  if (!view.hasFocus) {
    return false;
  }
  const { state } = view;
  const pieces = state.selection.ranges
    .filter((r) => !r.empty)
    .map((r) => state.sliceDoc(r.from, r.to));
  const linewise = pieces.length === 0;
  if (linewise) {
    let lastLine = -1;
    for (const range of state.selection.ranges) {
      const line = state.doc.lineAt(range.from);
      if (line.number > lastLine) {
        pieces.push(line.text);
      }
      lastLine = line.number;
    }
  }
  recordMenuClipboard(state, pieces, linewise);
  openMenuRefreshers.forEach((refresh) => refresh());
  return false;
}

const defaultContextMenuBlocker = ViewPlugin.fromClass(
  class {
    constructor(public view: EditorView) {
      this.handleEvent = this.handleEvent.bind(this);
      window.addEventListener("contextmenu", this.handleEvent);
    }

    handleEvent(e: Event) {
      e.preventDefault();
    }

    destroy() {
      window.removeEventListener("contextmenu", this.handleEvent);
    }
  },
);

const contextMenuClosePlugin = ViewPlugin.fromClass(
  class {
    constructor(public view: EditorView) {
      this.handleEvent = this.handleEvent.bind(this);
      window.addEventListener("click", this.handleEvent, true);
      window.addEventListener("mousedown", this.handleEvent, true);
      window.addEventListener("wheel", this.handleEvent, {
        capture: true,
        passive: true,
      });
      window.addEventListener("blur", this.handleEvent);
    }

    handleEvent(e: Event) {
      const open = this.view.state.field(contextMenuState);
      if (!open?.tooltip) return;
      const path = e.composedPath();
      if (
        path.some(
          (n) =>
            n instanceof HTMLElement && n.classList.contains("cm-context-menu"),
        )
      )
        return;
      this.view.dispatch({ effects: closeContextMenu.of() });
    }

    destroy() {
      window.removeEventListener("click", this.handleEvent, true);
      window.removeEventListener("mousedown", this.handleEvent, true);
      window.removeEventListener("wheel", this.handleEvent, { capture: true });
      window.removeEventListener("blur", this.handleEvent);
    }
  },
);

const contextMenuHost = ViewPlugin.fromClass(
  class {
    hosted = false;

    constructor(public view: EditorView) {}

    update(update: ViewUpdate) {
      const before = update.startState.field(contextMenuState, false);
      const after = update.state.field(contextMenuState, false);
      if (before === after) return;
      const present = update.state.facet(contextMenuPresenter);
      if (after && !after.tooltip && present) {
        this.hosted = true;
        present(menuModel(this.view, after.spec));
      } else if (this.hosted) {
        this.hosted = false;
        (update.startState.facet(contextMenuPresenter) ?? present)?.(null);
      }
    }

    destroy() {
      if (this.hosted) {
        this.view.state.facet(contextMenuPresenter)?.(null);
      }
    }
  },
);

export function showContextMenu(view: EditorView, spec: ContextMenuSpec) {
  view.dispatch({ effects: openContextMenu.of(spec) });
}

export function hideContextMenu(view: EditorView) {
  if (!view.state.field(contextMenuState, false)) return;
  view.dispatch({ effects: closeContextMenu.of() });
}

export function isContextMenuOpen(view: EditorView) {
  return Boolean(view.state.field(contextMenuState, false));
}

export function getOpenContextMenu(view: EditorView) {
  return view.state.field(contextMenuState, false)?.tooltip ?? null;
}

export interface ContextMenuConfig {
  items?: ContextMenuItem[];
}

const contextMenuConfig = Facet.define<ContextMenuConfig, ContextMenuConfig>({
  combine: (values) => ({
    items: values.flatMap((v) => v?.items || []),
  }),
});

export function contextMenu(
  config: ContextMenuConfig = {
    items: [
      ...textContextMenuItems,
      { type: "separator" },
      ...lspContextMenuItems,
    ],
  },
): Extension {
  return [
    contextMenuConfig.of(config),
    contextMenuState,
    contextMenuHandlers,
    contextMenuClosePlugin,
    contextMenuHost,
    defaultContextMenuBlocker,
    contextMenuTheme,
  ];
}

