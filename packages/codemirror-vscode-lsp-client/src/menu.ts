import { Extension, Facet } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { StyleModule } from "style-mod";
import { jumpToDefinition, jumpToDefinitionKeymap } from "./definition";
import { formatDocument, formatKeymap } from "./formatting";
import { findReferences, findReferencesKeymap } from "./references";
import { renameKeymap, renameSymbol } from "./rename";

const contextMenuStyles = new StyleModule({
  ".cm-context-menu": {
    position: "fixed",
    zIndex: "10000",
    backgroundColor: "#1F1F1F",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.6)",
    color: "#cccccc",
    padding: "13px 0",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: "13px",
    minWidth: "220px",
    borderRadius: "8px",
    userSelect: "none",
  },
  ".cm-context-menu .cm-menu-item": {
    position: "relative",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "7px 26px",
    cursor: "default",
  },
  ".cm-context-menu .cm-menu-item-shortcut": {
    color: "#858585",
    marginLeft: "2em",
  },
  ".cm-context-menu .cm-menu-separator": {
    border: "none",
    borderTop: "1px rgba(255, 255, 255, 0.2) solid",
    height: "1px",
    margin: "8px 0",
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

export type ContextMenuItem =
  | {
      label: string;
      shortcut?: string;
      command: (view: EditorView) => void;
    }
  | { type: "separator" };

const contextMenuConfig = Facet.define<
  LSPContextMenuConfig,
  LSPContextMenuConfig
>({
  combine: (values) => {
    return { items: values.map((v) => v.items).flat() };
  },
});

const contextMenuPlugin = ViewPlugin.fromClass(
  class {
    view: EditorView;
    menu: HTMLDivElement;

    constructor(view: EditorView) {
      this.view = view;
      this.menu = this.createMenu();
      StyleModule.mount(view.dom.ownerDocument, contextMenuStyles);
      document.body.appendChild(this.menu);
    }

    createMenu() {
      const menuEl = document.createElement("div");
      menuEl.className = "cm-context-menu";
      menuEl.style.display = "none";

      const config = this.view.state.facet(contextMenuConfig);

      config.items?.forEach((item) => {
        if ("type" in item) {
          if (item.type === "separator") {
            const sepEl = document.createElement("hr");
            sepEl.className = "cm-menu-separator";
            menuEl.appendChild(sepEl);
          }
        } else {
          const itemEl = document.createElement("div");
          itemEl.className = "cm-menu-item";

          const labelSpan = document.createElement("span");
          labelSpan.className = "cm-menu-item-label";
          labelSpan.textContent = this.view.state.phrase(item.label);
          itemEl.appendChild(labelSpan);

          const shortcutSpan = document.createElement("span");
          shortcutSpan.className = "cm-menu-item-shortcut";
          shortcutSpan.textContent = item.shortcut
            .split("+")
            .map((key) => this.view.state.phrase(key))
            .join("+");
          itemEl.appendChild(shortcutSpan);

          itemEl.onmousedown = (e) => {
            e.preventDefault();
            item.command(this.view);
            this.hide();
          };
          menuEl.appendChild(itemEl);
        }
      });

      return menuEl;
    }

    show(e: PointerEvent) {
      // 1. Move cursor to click position immediately
      const pos = this.view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos !== null) {
        this.view.dispatch({
          selection: { head: pos, anchor: pos },
          scrollIntoView: false,
        });
      }

      // 2. Open and calculate positioning
      this.menu.style.display = "block";
      this.menu.style.visibility = "hidden"; // Hidden for size calculation

      // Small delay to ensure browser layout is ready
      requestAnimationFrame(() => {
        const { clientWidth, clientHeight } = this.menu;
        let left = e.clientX;
        let top = e.clientY;

        // Boundary checks (so menu doesn't go off screen)
        if (left + clientWidth > window.innerWidth) left -= clientWidth;
        if (top + clientHeight > window.innerHeight) top -= clientHeight;

        this.menu.style.left = `${left}px`;
        this.menu.style.top = `${top}px`;
        this.menu.style.visibility = "visible";
      });

      // 3. Listen for outside clicks
      const hide = () => this.hide();
      window.addEventListener("click", hide, { once: true });
      window.addEventListener("contextmenu", hide, { once: true });
    }

    hide() {
      this.menu.style.display = "none";
    }

    destroy() {
      this.menu.remove();
    }
  },
  {
    eventHandlers: {
      contextmenu(event) {
        event.preventDefault();
        event.stopPropagation();
        this.show(event as PointerEvent);
        return true;
      },
    },
  },
);

export function getShortcutLabel(key: string) {
  return key
    .split("-")
    .map((k) => {
      const key = k.length === 1 ? k.toUpperCase() : k;
      if (key === "Mod") {
        return /Mac/.test(navigator.platform) ? "Cmd" : "Ctrl";
      }
      return key;
    })
    .join("+");
}

export interface LSPContextMenuConfig {
  items?: ContextMenuItem[];
}

export const defaultContextMenu: LSPContextMenuConfig = {
  items: [
    {
      label: "Rename Symbol",
      command: renameSymbol,
      shortcut: getShortcutLabel(renameKeymap[0]?.key),
    },
    {
      label: "Format Document",
      command: formatDocument,
      shortcut: getShortcutLabel(formatKeymap[0]?.key),
    },
    { type: "separator" },
    {
      label: "Find References",
      command: findReferences,
      shortcut: getShortcutLabel(findReferencesKeymap[0]?.key),
    },
    {
      label: "Go to Definition",
      command: jumpToDefinition,
      shortcut: getShortcutLabel(jumpToDefinitionKeymap[0]?.key),
    },
  ],
};

export function contextMenu(
  config: LSPContextMenuConfig = defaultContextMenu,
): readonly Extension[] {
  return [contextMenuConfig.of(config), contextMenuPlugin];
}
