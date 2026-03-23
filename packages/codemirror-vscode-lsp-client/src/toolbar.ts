import { Extension, Facet } from "@codemirror/state";
import {
  EditorView,
  Panel,
  showPanel,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { ContextMenuItem, defaultContextMenuItems } from "./context";

// CSS Theme to style the panel and enforce flex behavior
const contextToolbarTheme = EditorView.theme({
  ".cm-context-toolbar": {
    color: "#cccccc",
    border: "none",
    borderTop: "1px rgba(255, 255, 255, 0.1) solid",
    padding: "8px",
    display: "flex",
    gap: "8px",
    alignItems: "stretch",
    overflowX: "auto",
    zIndex: "100",
    backgroundColor: "inherit",
    WebkitOverflowScrolling: "touch", // Crucial for iOS momentum scrolling
    scrollbarWidth: "none", // Hides scrollbar on Firefox
    touchAction: "pan-x",
  },
  // Hides scrollbar on Chrome/Safari/Edge for a cleaner mobile look
  ".cm-context-toolbar::-webkit-scrollbar": {
    display: "none",
  },
  ".cm-context-toolbar .cm-button": {
    position: "relative",
    padding: "6px 12px",
    border: "1px rgba(255, 255, 255, 0.2) solid",
    borderRadius: "4px",
    fontSize: "14px",
    touchAction: "manipulation",
    backgroundImage: "none",
    backgroundColor: "inherit",
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  ".cm-context-toolbar .cm-toolbar-separator": {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    width: "1px",
    flexShrink: 0,
  },

  ".cm-context-toolbar .cm-button:active": {
    color: "#ffffff",
  },
  ".cm-context-toolbar .cm-button:active::after": {
    content: "''",
    position: "absolute",
    inset: "0",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  "@media (hover: hover) and (pointer: fine)": {
    ".cm-context-toolbar .cm-button:hover": {
      color: "#ffffff",
    },
    ".cm-context-toolbar .cm-button:hover::after": {
      content: "''",
      position: "absolute",
      inset: "0",
      backgroundColor: "rgba(255, 255, 255, 0.06)",
    },
  },
});

// Define the Panel UI
function createKeyboardPanel(view: EditorView): Panel {
  const config = view.state.facet(contextToolbarConfig);

  const dom = document.createElement("div");
  dom.className = "cm-context-toolbar";

  config.items?.forEach((item) => {
    if ("type" in item) {
      if (item.type === "separator") {
        const sepEl = document.createElement("div");
        sepEl.className = "cm-toolbar-separator";
        dom.appendChild(sepEl);
      }
    } else {
      const itemEl = document.createElement("button");
      itemEl.className = "cm-button";
      itemEl.textContent = view.state.phrase(item.label);
      itemEl.onmousedown = (e) => {
        e.preventDefault();
        item.command(view);
      };
      dom.appendChild(itemEl);
    }
  });

  return {
    top: false, // Setting top to false forces it to the bottom of the editor
    dom,
    update(update: ViewUpdate) {
      // You can handle state changes here if your buttons need to react
      // to editor changes (e.g., disabling 'Undo' if history is empty)
    },
  };
}

// ViewPlugin to handle the VisualViewport resizing
const visualViewportPlugin = ViewPlugin.fromClass(
  class {
    constructor(public view: EditorView) {
      this.handleResize = this.handleResize.bind(this);

      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", this.handleResize);
        window.visualViewport.addEventListener("scroll", this.handleResize);
        this.handleResize(); // Trigger immediately to set initial state
      }
    }

    handleResize() {
      if (!window.visualViewport) return;

      const vv = window.visualViewport;

      // Dynamically lock the editor's height to the exact visible area.
      // When the keyboard opens, vv.height shrinks, pulling the bottom panel up.
      this.view.dom.style.height = `${vv.height}px`;

      // On iOS, scrolling can sometimes detach the fixed viewport.
      // Syncing the top offset keeps it grounded.
      this.view.dom.style.transform = `translateY(${vv.offsetTop}px)`;
    }

    destroy() {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", this.handleResize);
        window.visualViewport.removeEventListener("scroll", this.handleResize);
      }
    }
  },
);

export interface LSPContextToolbarConfig {
  items?: ContextMenuItem[];
}

const contextToolbarConfig = Facet.define<
  LSPContextToolbarConfig,
  LSPContextToolbarConfig
>({
  combine: (values) => {
    return { items: values.map((v) => v.items).flat() };
  },
});

export function contextToolbar(
  config: LSPContextToolbarConfig = { items: defaultContextMenuItems },
): Extension {
  return [
    contextToolbarConfig.of(config),
    showPanel.of(createKeyboardPanel),
    visualViewportPlugin,
    contextToolbarTheme,
  ];
}
