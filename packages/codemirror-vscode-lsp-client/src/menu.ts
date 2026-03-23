import { Extension, Facet, StateEffect, StateField } from "@codemirror/state";
import { EditorView, showTooltip, Tooltip, ViewPlugin } from "@codemirror/view";
import {
  ContextMenuItem,
  historyContextMenuItems,
  isMobile,
  lspContextMenuItems,
  textContextMenuItems,
} from "./context";

let keyboardHeight = 0;

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

const openContextMenu = StateEffect.define<{
  pos: number;
  end: number;
  page?: number;
}>();
const closeContextMenu = StateEffect.define<void>();

const contextMenuState = StateField.define<Tooltip | null>({
  create() {
    return null;
  },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(openContextMenu)) {
        value = createContextMenuTooltip(
          e.value.pos,
          e.value.end,
          e.value.page || 0,
        );
      } else if (e.is(closeContextMenu)) {
        value = null;
      }
    }
    if (value && tr.docChanged) {
      value = {
        ...value,
        pos: tr.changes.mapPos(value.pos),
        end: tr.changes.mapPos(value.end),
      };
    }
    return value;
  },
  provide: (f) => showTooltip.from(f),
});

function createContextMenuTooltip(
  pos: number,
  end: number,
  page: number,
): Tooltip {
  const above = isMobile();
  return {
    pos,
    end,
    above,
    arrow: false,
    clip: false,
    create(view: EditorView) {
      const dom = document.createElement("div");
      dom.className = "cm-context-menu";

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
      } else {
        // Mobile uses the page state
        displayItems = page === 0 ? items : moreItems;
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
              openContextMenu.of({ pos, end, page: page - 1 }),
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
          labelSpan.textContent = view.state.phrase(item.label);
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
          };
          dom.appendChild(itemEl);
        } else if (item.type === "separator") {
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
          view.dispatch({
            effects: [
              closeContextMenu.of(),
              openContextMenu.of({ pos, end, page: page + 1 }),
            ],
          });
        };
        dom.appendChild(moreBtn);
      }

      return {
        dom,
        overlap: true,
        getCoords(pos: number) {
          const coords = view.coordsAtPos(pos);
          const scrollRect = view.scrollDOM.getBoundingClientRect();
          const padding = 5;

          const tooltipHeight = dom.getBoundingClientRect().height;

          // Define the safe boundaries for the anchor point based on tooltip direction
          let minTop: number;
          let maxBottom: number;

          if (above) {
            // Anchor must be at least one tooltip height away from the top
            minTop = scrollRect.top + padding + tooltipHeight;
            maxBottom = scrollRect.bottom - keyboardHeight - padding;
          } else {
            // Anchor must be at least one tooltip height away from the bottom
            minTop = scrollRect.top + padding;
            maxBottom =
              scrollRect.bottom - keyboardHeight - padding - tooltipHeight;
          }

          // Fallback for Virtualization
          if (!coords) {
            const isScrolledPast = pos < view.viewport.from;
            const fallbackY = isScrolledPast ? minTop : maxBottom;

            return {
              left: scrollRect.left + padding,
              right: scrollRect.left + padding,
              top: fallbackY,
              bottom: fallbackY,
            };
          }

          // Clamp the anchor coordinates
          const top = Math.max(minTop, Math.min(coords.top, maxBottom));
          const bottom = Math.max(minTop, Math.min(coords.bottom, maxBottom));

          const left = Math.max(
            scrollRect.left + padding,
            Math.min(coords.left, scrollRect.right - padding),
          );
          const right = Math.max(
            scrollRect.left + padding,
            Math.min(coords.right, scrollRect.right - padding),
          );

          return { left, right, top, bottom };
        },
      };
    },
  };
}

const contextMenuHandlers = EditorView.domEventHandlers({
  contextmenu(event, view) {
    event.preventDefault();
    event.stopPropagation();
    const anchor = view.state.selection.main.anchor;
    const head = view.state.selection.main.head;
    view.dispatch({ effects: openContextMenu.of({ pos: anchor, end: head }) });
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

const keyboardMeasurer = ViewPlugin.fromClass(
  class {
    constructor(public view: EditorView) {
      this.measure = this.measure.bind(this);
      window.visualViewport?.addEventListener("resize", this.measure);
      window.visualViewport?.addEventListener("scroll", this.measure);
    }

    measure() {
      const vv = window.visualViewport;
      if (!vv) return;
      keyboardHeight = window.innerHeight - vv.height;
    }

    destroy() {
      window.visualViewport?.removeEventListener("resize", this.measure);
      window.visualViewport?.removeEventListener("scroll", this.measure);
    }
  },
);

export function showContextMenu(view: EditorView, pos: number, end: number) {
  view.dispatch({ effects: openContextMenu.of({ pos, end }) });
}

export function hideContextMenu(view: EditorView) {
  view.dispatch({ effects: closeContextMenu.of() });
}

export function isContextMenuOpen(view: EditorView) {
  return Boolean(view.state.field(contextMenuState, false));
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
    moreItems: [
      ...historyContextMenuItems,
      { type: "separator" },
      ...lspContextMenuItems,
    ],
  },
): Extension {
  return [
    keyboardMeasurer,
    contextMenuConfig.of(config),
    contextMenuState,
    contextMenuHandlers,
    contextMenuClosePlugin,
    defaultContextMenuBlocker,
    contextMenuTheme,
  ];
}
