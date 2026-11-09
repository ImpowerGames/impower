import { indentLess, indentMore, redo, undo } from "@codemirror/commands";
import { openFind } from "@impower/codemirror-vscode-lsp-client/src";
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
} from "@codemirror/view";
import { formatDocument } from "@impower/codemirror-vscode-lsp-client/src";
import { ContextMenuItem } from "@impower/codemirror-vscode-lsp-client/src/context";
import { iconMasks } from "@impower/impower-ui/icon-masks";


const keyboardToolbarTheme = EditorView.theme({
  ".cm-keyboard-toolbar": {
    color: "var(--editor-ink)",
    border: "none",
    borderTop: "1px color-mix(in srgb, var(--ink) 10%, transparent) solid",
    padding: "0 8px",
    display: "flex",
    alignItems: "stretch",
    justifyContent: "space-around",
    overflowX: "auto",
    zIndex: "100",
    backgroundColor: "inherit",
    WebkitOverflowScrolling: "touch",
    scrollbarWidth: "none",
    touchAction: "pan-x",
  },
  ".cm-keyboard-toolbar::-webkit-scrollbar": {
    display: "none",
  },
  ".cm-keyboard-toolbar .cm-button": {
    position: "relative",
    display: "flex",
    border: "none",
    fontSize: "14px",
    touchAction: "manipulation",
    backgroundImage: "none",
    backgroundColor: "inherit",
    boxShadow: "none",
    flexShrink: 0,
    whiteSpace: "nowrap",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "var(--control-radius)",
  },
  ".cm-keyboard-toolbar .cm-button:has(.cm-toolbar-label)": {
    padding: "6px 12px",
    border: "1px color-mix(in srgb, var(--ink) 20%, transparent) solid",
  },
  ".cm-keyboard-toolbar .cm-button:has(.cm-toolbar-icon)": {
    padding: "8px",
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
    maskSize: "20px 20px",
    webkitMaskSize: "20px 20px",
  },
  ".cm-keyboard-toolbar .cm-toolbar-separator": {
    backgroundColor: "color-mix(in srgb, var(--ink) 20%, transparent)",
    width: "1px",
    flexShrink: 0,
  },

  ".cm-keyboard-toolbar .cm-button:active": {
    color: "var(--ink)",
  },
  ".cm-keyboard-toolbar .cm-button:active::after": {
    content: "''",
    position: "absolute",
    inset: "0",
    borderRadius: "inherit",
    backgroundColor: "var(--control-hover)",
    boxShadow: "inset 0 0 0 100vmax var(--control-hover)",
  },
  "@media (hover: hover)": {
    ".cm-keyboard-toolbar .cm-button:hover": {
      color: "var(--ink)",
    },
    ".cm-keyboard-toolbar .cm-button:hover::after": {
      content: "''",
      position: "absolute",
      inset: "0",
      borderRadius: "inherit",
      backgroundColor: "var(--control-hover)",
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
    top: false,
    dom,
  };
}

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
        icon: iconMasks["search"],
        command: openFind,
      },
      {
        icon: iconMasks["undo"],
        command: undo,
      },
      {
        icon: iconMasks["redo"],
        command: redo,
      },
      {
        icon: iconMasks["indent"],
        command: indentMore,
      },
      {
        icon: iconMasks["dedent"],
        command: indentLess,
      },
      {
        icon: iconMasks["format"],
        command: formatDocument,
      },
    ],
  },
): Extension {
  return [keyboardToolbarConfig.of(config), keyboardToolbarTheme];
}
