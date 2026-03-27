import { indentLess, indentMore, redo, undo } from "@codemirror/commands";
import { openSearchPanel } from "@codemirror/search";
import {
  EditorState,
  Extension,
  Facet,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Command,
  EditorView,
  Panel,
  PanelConstructor,
  showPanel,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { formatDocument } from "@impower/codemirror-vscode-lsp-client/src";
import {
  ContextMenuItem,
  isMobile,
} from "@impower/codemirror-vscode-lsp-client/src/context";

const SEARCH_SVG_URL = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="m21 21l-4.34-4.34"/><circle cx="11" cy="11" r="8"/></g></svg>')`;

const UNDO_SVG_URL = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9a9 9 0 0 0-6 2.3L3 13"/></g></svg>')`;

const REDO_SVG_URL = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9a9 9 0 0 1 6 2.3l3 2.7"/></g></svg>')`;

const INDENT_SVG_URL = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right-to-line-icon lucide-arrow-right-to-line"><path d="M17 12H3"/><path d="m11 18 6-6-6-6"/><path d="M21 5v14"/></svg>')`;

const DEDENT_SVG_URL = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left-from-line-icon lucide-arrow-left-from-line"><path d="m9 6-6 6 6 6"/><path d="M3 12h14"/><path d="M21 19V5"/></svg>')`;

const FORMAT_SVG_URL = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-brush-cleaning-icon lucide-brush-cleaning"><path d="m16 22-1-4"/><path d="M19 14a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1"/><path d="M19 14H5l-1.973 6.767A1 1 0 0 0 4 22h16a1 1 0 0 0 .973-1.233z"/><path d="m8 22 1-4"/></svg>')`;

// CSS Theme to style the panel and enforce flex behavior
const keyboardToolbarTheme = EditorView.theme({
  ".cm-keyboard-toolbar": {
    color: "#cccccc",
    border: "none",
    borderTop: "1px rgba(255, 255, 255, 0.1) solid",
    padding: "0 8px",
    display: "flex",
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-around",
    overflowX: "auto",
    zIndex: "100",
    backgroundColor: "inherit",
    WebkitOverflowScrolling: "touch", // Crucial for iOS momentum scrolling
    scrollbarWidth: "none", // Hides scrollbar on Firefox
    touchAction: "pan-x",
  },
  // Hides scrollbar on Chrome/Safari/Edge for a cleaner keyboard look
  ".cm-keyboard-toolbar::-webkit-scrollbar": {
    display: "none",
  },
  ".cm-keyboard-toolbar .cm-button": {
    position: "relative",
    display: "flex",
    flexDirection: "row",
    border: "none",
    fontSize: "14px",
    touchAction: "manipulation",
    backgroundImage: "none",
    backgroundColor: "inherit",
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  ".cm-keyboard-toolbar .cm-button:has(.cm-toolbar-label)": {
    padding: "6px 12px",
    border: "1px rgba(255, 255, 255, 0.2) solid",
    borderRadius: "4px",
  },
  ".cm-keyboard-toolbar .cm-button:has(.cm-toolbar-icon)": {
    padding: "8px",
    "&::after": {
      borderRadius: "100%",
    },
  },
  ".cm-keyboard-toolbar .cm-button .cm-toolbar-icon": {
    width: "24px",
    height: "24px",
    display: "inline-block",
    backgroundColor: "currentColor",
    maskRepeat: "no-repeat",
    webkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    webkitMaskPosition: "center",
  },
  ".cm-keyboard-toolbar .cm-toolbar-separator": {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    width: "1px",
    flexShrink: 0,
  },

  ".cm-keyboard-toolbar .cm-button:active": {
    color: "#ffffff",
  },
  ".cm-keyboard-toolbar .cm-button:active::after": {
    content: "''",
    position: "absolute",
    inset: "0",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  "@media (hover: hover) and (pointer: fine)": {
    ".cm-keyboard-toolbar .cm-button:hover": {
      color: "#ffffff",
    },
    ".cm-keyboard-toolbar .cm-button:hover::after": {
      content: "''",
      position: "absolute",
      inset: "0",
      backgroundColor: "rgba(255, 255, 255, 0.06)",
    },
  },
});

interface KeyboardToolbarState {
  panel: PanelConstructor;
}

const keyboardToolbarState = StateField.define<KeyboardToolbarState | null>({
  create() {
    return null;
  },
  update(value, tr) {
    for (let e of tr.effects) if (e.is(setKeyboardToolbar)) return e.value;
    return value;
  },
  provide: (f) => showPanel.from(f, (val) => (val ? val.panel : null)),
});

export const setKeyboardToolbar =
  StateEffect.define<KeyboardToolbarState | null>();

function createKeyboardToolbarPanel(view: EditorView): Panel {
  const config = view.state.facet(keyboardToolbarConfig);

  const dom = document.createElement("div");
  dom.className = "cm-toolbar cm-keyboard-toolbar";

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
      itemEl.onmousedown = (e) => {
        e.preventDefault();
        item.command(view);
      };
      dom.appendChild(itemEl);
      if (item.label) {
        const labelEl = document.createElement("div");
        labelEl.className = "cm-toolbar-label";
        labelEl.textContent = view.state.phrase(item.label);
        itemEl.appendChild(labelEl);
      }
      if (item.icon) {
        const iconEl = document.createElement("div");
        iconEl.className = "cm-toolbar-icon";
        iconEl.style.maskImage = item.icon;
        iconEl.style.webkitMaskImage = item.icon;
        itemEl.appendChild(iconEl);
      }
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
const keyboardToolbarManager = ViewPlugin.fromClass(
  class {
    constructor(public view: EditorView) {
      this.handleVisualViewportChange =
        this.handleVisualViewportChange.bind(this);
      window.visualViewport?.addEventListener(
        "resize",
        this.handleVisualViewportChange,
      );
      window.visualViewport?.addEventListener(
        "scroll",
        this.handleVisualViewportChange,
      );
      window.addEventListener("focusout", this.handleVisualViewportChange);
      this.view.scrollDOM.addEventListener(
        "blur",
        this.handleVisualViewportChange,
      );
      this.handleVisualViewportChange(); // Trigger immediately to set initial state
    }

    handleVisualViewportChange(e?: Event) {
      if (!window.visualViewport) return;

      if (!isMobile()) return;

      const vv = window.visualViewport;

      // Get the root (either document or the ShadowRoot)
      const root = this.view.dom.getRootNode() as Document | ShadowRoot;

      // Check if focus is in the main text area OR inside any editor panel/widget
      // We check both the global activeElement and the ShadowRoot's activeElement
      const activeElt = root.activeElement;
      const isActiveEltEditable =
        activeElt &&
        (activeElt instanceof HTMLInputElement ||
          activeElt instanceof HTMLTextAreaElement ||
          (activeElt as HTMLElement).isContentEditable);
      const isEditorInputFocused =
        this.view.hasFocus ||
        (activeElt && this.view.dom.contains(activeElt) && isActiveEltEditable);

      const isFocusEvent = e?.type === "focusin" || e?.type === "focus";

      const isBlurEvent = e?.type === "focusout" || e?.type === "blur";

      // If the editor is losing focus or doesn't currently have focus,
      // release the height constraint and ignore the trailing resize events
      // from the keyboard animation.
      if (!isFocusEvent && (isBlurEvent || !isEditorInputFocused)) {
        closeKeyboardToolbar(this.view);
        return;
      }

      const keyboardHeight = window.innerHeight - vv.height;

      if (keyboardHeight > 0) {
        openKeyboardToolbar(this.view);
      } else {
        closeKeyboardToolbar(this.view);
      }
    }

    destroy() {
      window.visualViewport?.removeEventListener(
        "resize",
        this.handleVisualViewportChange,
      );
      window.visualViewport?.removeEventListener(
        "scroll",
        this.handleVisualViewportChange,
      );
      window.removeEventListener("focusout", this.handleVisualViewportChange);
      this.view.scrollDOM.removeEventListener(
        "blur",
        this.handleVisualViewportChange,
      );
    }
  },
);

export const openKeyboardToolbar: Command = (view) => {
  let data: KeyboardToolbarState = { panel: createKeyboardToolbarPanel };
  let effect =
    view.state.field(keyboardToolbarState, false) === undefined
      ? StateEffect.appendConfig.of(keyboardToolbarState.init(() => data))
      : setKeyboardToolbar.of(data);
  view.dispatch({ effects: effect });
  return true;
};

export function isKeyboardToolbarOpen(state: EditorState) {
  return Boolean(state.field(keyboardToolbarState, false));
}

export const closeKeyboardToolbar: Command = (view) => {
  if (!view.state.field(keyboardToolbarState, false)) return false;
  view.dispatch({ effects: setKeyboardToolbar.of(null) });
  return true;
};

export interface LSPContextToolbarConfig {
  items?: ContextMenuItem[];
}

const keyboardToolbarConfig = Facet.define<
  LSPContextToolbarConfig,
  LSPContextToolbarConfig
>({
  combine: (values) => {
    return { items: values.map((v) => v.items ?? []).flat() };
  },
});

export function keyboardToolbar(
  config: LSPContextToolbarConfig = {
    items: [
      {
        icon: SEARCH_SVG_URL,
        command: openSearchPanel,
      },
      {
        icon: UNDO_SVG_URL,
        command: undo,
      },
      {
        icon: REDO_SVG_URL,
        command: redo,
      },
      {
        icon: INDENT_SVG_URL,
        command: indentMore,
      },
      {
        icon: DEDENT_SVG_URL,
        command: indentLess,
      },
      {
        icon: FORMAT_SVG_URL,
        command: formatDocument,
      },
    ],
  },
): Extension {
  return [
    keyboardToolbarConfig.of(config),
    keyboardToolbarTheme,
    keyboardToolbarManager,
  ];
}
