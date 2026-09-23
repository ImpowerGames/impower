import {
  Extension,
  Facet,
  StateEffect,
  StateField,
  Transaction,
} from "@codemirror/state";
import { EditorView, showTooltip, Tooltip, ViewPlugin } from "@codemirror/view";
import {
  ContextMenuItem,
  isMobile,
  lspContextMenuItems,
  textContextMenuItems,
} from "./context";

const DOTS_VERTICAL_SVG_URL = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>')`;

const CHEVRON_LEFT_SVG_URL = `url('data:image/svg+xml;utf8,<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="white"><path d="M9.14601 3.14623L4.64601 7.64623C4.45101 7.84123 4.45101 8.15823 4.64601 8.35323L9.14601 12.8532C9.34101 13.0482 9.65801 13.0482 9.85301 12.8532C10.048 12.6582 10.048 12.3412 9.85301 12.1462L5.70701 8.00023L9.85301 3.85423C10.048 3.65923 10.048 3.34223 9.85301 3.14723C9.65801 2.95223 9.34101 2.95223 9.14601 3.14723V3.14623Z"/></svg>')`;

const contextMenuTheme = EditorView.baseTheme({
  ".cm-tooltip.cm-context-menu": {
    fontFamily: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`,
    borderRadius: "20px",
    zIndex: "1000",
  },
  ".cm-context-menu": {
    display: "flex",
    color: "#cccccc",
    userSelect: "none",
    whiteSpace: "nowrap",
    pointerEvents: "auto",
  },
  ".cm-context-menu.cm-desktop": {
    fontSize: "13px",
    padding: "13px 0",
  },
  ".cm-context-menu.cm-mobile": {
    fontSize: "14px",
  },
  ".cm-context-menu.cm-horizontal": {
    flexDirection: "row",
    alignItems: "center",
    fontWeight: "500",
    padding: "2px 6px",
    borderRadius: "20px",
  },
  ".cm-context-menu.cm-vertical": {
    flexDirection: "column",
    alignItems: "stretch",
    padding: "6px 0",
    minWidth: "180px",
    borderRadius: "10px",
  },
  ".cm-context-menu .cm-menu-item": {
    position: "relative",
    cursor: "pointer",
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    transition: "background-color 0.1s ease",
  },
  ".cm-context-menu.cm-vertical .cm-menu-item": {
    justifyContent: "space-between",
    borderRadius: "0",
  },
  ".cm-context-menu.cm-desktop.cm-vertical .cm-menu-item": {
    padding: "7px 26px",
  },
  ".cm-context-menu.cm-mobile.cm-horizontal .cm-menu-item": {
    padding: "8px 14px",
  },
  ".cm-context-menu.cm-mobile.cm-vertical .cm-menu-item": {
    padding: "6px 16px",
  },
  ".cm-context-menu.cm-horizontal .cm-menu-item": {
    justifyContent: "center",
    borderRadius: "14px",
  },
  ".cm-context-menu.cm-vertical .cm-menu-back": {
    justifyContent: "flex-start",
  },
  ".cm-context-menu .cm-menu-shortcut": {
    fontSize: "12px",
    opacity: "0.5",
    marginLeft: "20px",
  },
  ".cm-context-menu .cm-menu-back-icon": {
    width: "18px",
    height: "18px",
    display: "inline-block",
    backgroundColor: "white",
    maskImage: CHEVRON_LEFT_SVG_URL,
    webkitMaskImage: CHEVRON_LEFT_SVG_URL,
    maskRepeat: "no-repeat",
    webkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    webkitMaskPosition: "center",
  },
  ".cm-context-menu .cm-menu-more-icon": {
    width: "18px",
    height: "18px",
    display: "inline-block",
    backgroundColor: "white",
    maskImage: DOTS_VERTICAL_SVG_URL,
    webkitMaskImage: DOTS_VERTICAL_SVG_URL,
    maskRepeat: "no-repeat",
    webkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    webkitMaskPosition: "center",
  },
  ".cm-context-menu .cm-menu-separator": {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    flexShrink: 0,
  },
  ".cm-context-menu.cm-vertical .cm-menu-separator": {
    width: "100%",
    height: "1px",
    margin: "4px 0",
  },
  ".cm-context-menu.cm-horizontal .cm-menu-separator": {
    width: "1px",
    height: "18px",
    margin: "0 2px",
  },
  ".cm-context-menu .cm-menu-item:active": {
    color: "#ffffff",
  },
  ".cm-context-menu .cm-menu-item:active::after": {
    content: "''",
    position: "absolute",
    inset: "0",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  ".cm-context-menu .cm-menu-item:active .cm-menu-item-shortcut": {
    color: "#ffffff",
  },
  "@media (hover: hover) and (pointer: fine)": {
    ".cm-context-menu .cm-menu-item:hover": {
      color: "#ffffff",
    },
    ".cm-context-menu .cm-menu-item:hover::after": {
      content: "''",
      position: "absolute",
      inset: "0",
      backgroundColor: "rgba(255, 255, 255, 0.06)",
    },
    ".cm-context-menu .cm-menu-item:hover .cm-menu-item-shortcut": {
      color: "#ffffff",
    },
  },
});

export interface ContextMenuSpec {
  x?: number;
  y?: number;
  pos: number;
  end?: number;
  page?: number;
  clip?: boolean;
  /** Client rectangle of the menu that opened this page. An overflow page
   *  opens over it, aligned to its right edge where the ⋮ button was. */
  origin?: MenuRect;
}

export interface MenuRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Space kept between the selection's top edge and a menu placed above it. */
const MENU_GAP_ABOVE = 8;
/** Space kept between the selection's bottom edge and a menu placed below it,
 *  enough to clear the selection handles drawn under the text. */
const MENU_GAP_BELOW = 32;
/** Space kept between the menu and the edges of the visual viewport. */
const MENU_VIEWPORT_MARGIN = 4;

/**
 * Where the touch text-selection menu goes, following Android's floating
 * selection toolbar: centred over the selection, above its top edge when that
 * fits inside the visual viewport, otherwise below its bottom edge, and pinned
 * to the top of the viewport when neither fits or nothing of the selection is
 * visible. The menu may leave the editor and cover the page around it, but it
 * never covers a selection it can sit beside.
 *
 * `selection` is the visible part of the selection's bounding box, or null
 * when none of it is visible.
 */
function placeSelectionMenu(
  selection: MenuRect | null,
  menu: { width: number; height: number },
  viewport: MenuRect,
): { left: number; top: number } {
  const minTop = viewport.top + MENU_VIEWPORT_MARGIN;
  const maxBottom = viewport.bottom - MENU_VIEWPORT_MARGIN;
  let top = minTop;
  if (selection) {
    const above = selection.top - MENU_GAP_ABOVE - menu.height;
    const below = selection.bottom + MENU_GAP_BELOW;
    if (above >= minTop) {
      top = above;
    } else if (below + menu.height <= maxBottom) {
      top = below;
    }
  }
  const centre = selection
    ? (selection.left + selection.right) / 2
    : (viewport.left + viewport.right) / 2;
  return { left: clampMenuLeft(centre - menu.width / 2, menu, viewport), top };
}

/**
 * Where an overflow page goes: over the menu that opened it, with the two
 * right edges aligned, moved up only as far as it must to fit the viewport.
 */
function placeOverflowMenu(
  origin: MenuRect,
  menu: { width: number; height: number },
  viewport: MenuRect,
): { left: number; top: number } {
  const minTop = viewport.top + MENU_VIEWPORT_MARGIN;
  const maxTop = viewport.bottom - MENU_VIEWPORT_MARGIN - menu.height;
  return {
    left: clampMenuLeft(origin.right - menu.width, menu, viewport),
    top: Math.max(minTop, Math.min(origin.top, maxTop)),
  };
}

function clampMenuLeft(
  left: number,
  menu: { width: number },
  viewport: MenuRect,
) {
  const min = viewport.left + MENU_VIEWPORT_MARGIN;
  const max = viewport.right - MENU_VIEWPORT_MARGIN - menu.width;
  return Math.max(min, Math.min(left, max));
}

function visualViewportRect(): MenuRect {
  const vv = window.visualViewport;
  if (!vv) {
    return {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    };
  }
  return {
    left: vv.offsetLeft,
    top: vv.offsetTop,
    right: vv.offsetLeft + vv.width,
    bottom: vv.offsetTop + vv.height,
  };
}

/** The part of the selection `from`..`to` visible inside the editor's
 *  scroller, as a bounding box, or null when none of it is visible. */
function visibleSelectionRect(
  view: EditorView,
  from: number,
  to: number,
): MenuRect | null {
  const scroller = view.scrollDOM.getBoundingClientRect();
  const content = view.contentDOM.getBoundingClientRect();
  const start = view.coordsAtPos(from, 1);
  const end = view.coordsAtPos(to, -1);
  // A position outside the rendered viewport has no coordinates; it lies
  // beyond the scroller's top or bottom edge.
  const top = start
    ? start.top
    : from < view.viewport.from
      ? -Infinity
      : Infinity;
  const bottom = end
    ? end.bottom
    : to > view.viewport.to
      ? Infinity
      : -Infinity;
  const visibleTop = Math.max(top, scroller.top);
  const visibleBottom = Math.min(bottom, scroller.bottom);
  if (visibleTop >= visibleBottom) {
    return null;
  }
  const oneLine = start && end && Math.abs(start.top - end.top) < 1;
  const left = oneLine ? start.left : Math.max(content.left, scroller.left);
  const right = oneLine ? end.right : scroller.right;
  return { left, top: visibleTop, right, bottom: visibleBottom };
}

const openContextMenu = StateEffect.define<ContextMenuSpec>();
const closeContextMenu = StateEffect.define<void>();

const contextMenuState = StateField.define<Tooltip | null>({
  create() {
    return null;
  },
  update(value, tr) {
    if (value && tr.docChanged) {
      // An edit the user makes closes the menu, as typing over a selection
      // closes Android's selection toolbar. Other changes move it with the
      // text.
      value = tr.annotation(Transaction.userEvent)
        ? null
        : {
            ...value,
            pos: tr.changes.mapPos(value.pos),
            end: tr.changes.mapPos(value.end!),
          };
    }
    for (const e of tr.effects) {
      if (e.is(openContextMenu)) {
        value = createContextMenuTooltip(e.value);
      } else if (e.is(closeContextMenu)) {
        value = null;
      }
    }
    return value;
  },
  provide: (f) => showTooltip.from(f),
});

function createContextMenuTooltip(spec: ContextMenuSpec): Tooltip {
  const { x, y, pos, end, origin, clip = false, page = 0 } = spec;
  // A menu for a selection places itself: getCoords returns its top-left
  // corner, so the tooltip must neither flip nor shrink it.
  const placesItself = (x === undefined || y === undefined) && !clip;
  return {
    pos,
    end,
    clip,
    arrow: false,
    strictSide: placesItself,
    create(view: EditorView) {
      const dom = document.createElement("div");
      dom.className = "cm-context-menu";
      // Pressing the menu must not move focus: on a touch screen, losing
      // focus closes the keyboard, and paste needs the page focused.
      dom.addEventListener("mousedown", (e) => e.preventDefault());

      const config = view.state.facet(contextMenuConfig);
      const items = config.items || [];
      const moreItems = config.moreItems || [];

      // Detect desktop environment (has hover capability)
      const isDesktop = !isMobile();

      // On desktop, we force vertical mode and combine all items
      const isVertical = isDesktop || page > 0;

      // Set classes
      dom.classList.toggle("cm-desktop", isDesktop);
      dom.classList.toggle("cm-mobile", !isDesktop);
      dom.classList.toggle("cm-vertical", isVertical);
      dom.classList.toggle("cm-horizontal", !isVertical);

      // Determine which items to show
      let displayItems: ContextMenuItem[] = [];
      if (isDesktop) {
        // Desktop shows all primary items, then a separator, then all "more" items
        displayItems = [...items];
        if (moreItems.length > 0) {
          displayItems.push({ type: "separator" });
          displayItems.push(...moreItems);
        }
      } else if (page === 0) {
        // Mobile uses the page state. With nothing selected, the first page
        // leaves out items that act on a selection, as Android's insertion
        // menu does.
        const empty = view.state.selection.main.empty;
        displayItems = items.filter(
          (item) => !(empty && "needsSelection" in item && item.needsSelection),
        );
      } else {
        displayItems = moreItems;
      }

      const hasPrev = !isDesktop && page > 0;
      const hasMore = !isDesktop && page === 0 && moreItems.length > 0;

      // 1. Back Button (Mobile only)
      if (hasPrev) {
        const backBtn = document.createElement("div");
        backBtn.className = "cm-menu-item cm-menu-back";
        const icon = document.createElement("span");
        icon.className = "cm-menu-back-icon";
        backBtn.appendChild(icon);
        const label = document.createElement("span");
        label.style.marginLeft = "8px";
        label.textContent = "Back";
        backBtn.appendChild(label);

        backBtn.onclick = (e) => {
          e.stopPropagation();
          view.dispatch({
            effects: [
              closeContextMenu.of(),
              openContextMenu.of({
                ...spec,
                page: page - 1,
                origin: undefined,
              }),
            ],
          });
        };
        dom.appendChild(backBtn);
        const sep = document.createElement("div");
        sep.className = "cm-menu-separator";
        dom.appendChild(sep);
      }

      // 2. Items
      displayItems.forEach((item) => {
        if ("label" in item) {
          const itemEl = document.createElement("div");
          itemEl.className = "cm-menu-item cm-menu-option";

          const labelSpan = document.createElement("span");
          labelSpan.textContent = view.state.phrase(item.label!);
          itemEl.appendChild(labelSpan);

          // Add shortcut label on desktop
          if (isDesktop && item.shortcut) {
            const shortcutSpan = document.createElement("span");
            shortcutSpan.className = "cm-menu-shortcut";
            shortcutSpan.textContent = item.shortcut;
            itemEl.appendChild(shortcutSpan);
          }

          itemEl.onclick = (e) => {
            e.stopPropagation();
            view.dispatch({ effects: closeContextMenu.of() });
            item.command(view);
            if (!isDesktop && item.keepsMenuOpen) {
              const selection = view.state.selection.main;
              view.dispatch({
                effects: openContextMenu.of({
                  pos: selection.from,
                  end: selection.to,
                }),
              });
            }
          };
          dom.appendChild(itemEl);
        } else if ("type" in item && item.type === "separator") {
          const sep = document.createElement("div");
          sep.className = "cm-menu-separator";
          dom.appendChild(sep);
        }
      });

      // 3. More Button (Mobile only)
      if (hasMore) {
        const sep = document.createElement("div");
        sep.className = "cm-menu-separator";
        dom.appendChild(sep);

        const moreBtn = document.createElement("div");
        moreBtn.className = "cm-menu-item cm-menu-more";
        const icon = document.createElement("span");
        icon.className = "cm-menu-more-icon";
        moreBtn.appendChild(icon);
        moreBtn.onclick = (e) => {
          e.stopPropagation();
          const { left, top, right, bottom } = dom.getBoundingClientRect();
          view.dispatch({
            effects: [
              closeContextMenu.of(),
              openContextMenu.of({
                ...spec,
                page: page + 1,
                origin: { left, top, right, bottom },
              }),
            ],
          });
        };
        dom.appendChild(moreBtn);
      }

      return {
        dom,
        overlap: true,
        resize: !placesItself,
        getCoords:
          x !== undefined && y !== undefined
            ? () => ({ left: x, right: x, top: y, bottom: y })
            : clip
              ? undefined
              : () => {
                  const { width, height } = dom.getBoundingClientRect();
                  const viewport = visualViewportRect();
                  const { left, top } = origin
                    ? placeOverflowMenu(origin, { width, height }, viewport)
                    : placeSelectionMenu(
                        visibleSelectionRect(view, pos, end ?? pos),
                        { width, height },
                        viewport,
                      );
                  return { left, right: left, top, bottom: top };
                },
      };
    },
  };
}

const contextMenuHandlers = EditorView.domEventHandlers({
  contextmenu(event, view) {
    event.preventDefault();
    event.stopPropagation();

    if (isMobile()) {
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
});

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
    }

    handleEvent(e: Event) {
      if (!this.view.state.field(contextMenuState)) return;
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
    }
  },
);

export function showContextMenu(view: EditorView, spec: ContextMenuSpec) {
  view.dispatch({ effects: openContextMenu.of(spec) });
}

export function hideContextMenu(view: EditorView) {
  view.dispatch({ effects: closeContextMenu.of() });
}

export function isContextMenuOpen(view: EditorView) {
  return Boolean(view.state.field(contextMenuState, false));
}

export function getOpenContextMenu(view: EditorView) {
  return view.state.field(contextMenuState, false);
}

export interface ContextMenuConfig {
  items?: ContextMenuItem[];
  moreItems?: ContextMenuItem[];
}

const contextMenuConfig = Facet.define<ContextMenuConfig, ContextMenuConfig>({
  combine: (values) => ({
    items: values.flatMap((v) => v?.items || []),
    moreItems: values.flatMap((v) => v?.moreItems || []),
  }),
});

export function contextMenu(
  config: ContextMenuConfig = {
    items: [...textContextMenuItems],
    moreItems: [...lspContextMenuItems],
  },
): Extension {
  return [
    contextMenuConfig.of(config),
    contextMenuState,
    contextMenuHandlers,
    contextMenuClosePlugin,
    defaultContextMenuBlocker,
    contextMenuTheme,
  ];
}
