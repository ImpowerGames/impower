import { indentLess, indentMore } from "@codemirror/commands";
import {
  EditorState,
  type Extension,
  Facet,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  type Command,
  EditorView,
  type Panel,
  type PanelConstructor,
  showPanel,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import {
  changeableColorAt,
  changeColor,
  colorCSS,
  formatDocument,
} from "@impower/codemirror-vscode-lsp-client/src";
import CaretColorChip from "@impower/impower-ui/caret-color-chip";
import { iconMasks } from "@impower/impower-ui/icon-masks";
import { h, render } from "preact";
import { openCustomGotoLinePanel } from "./gotoLinePanel";
import { scriptModeField, setScriptMode } from "./scriptMode";

export type KeyboardToolbarTool = "writingTools" | "add";

type ToolbarCommandItem = {
  id: string;
  label: string;
  icon: keyof typeof iconMasks;
  command: Command;
};

type ToolbarToolItem = {
  id: KeyboardToolbarTool;
  label: string;
  icon: keyof typeof iconMasks;
  tool: KeyboardToolbarTool;
  text?: boolean;
  disabled?: boolean;
  title?: string;
};

type ToolbarPositionItem = { id: "position"; position: true };

type ToolbarColorItem = { id: "color"; color: true };

type ToolbarItem =
  | ToolbarCommandItem
  | ToolbarToolItem
  | ToolbarPositionItem
  | ToolbarColorItem;

export type ToolbarEntry = {
  placement: "start" | "center" | "end";
  group?: string;
  items: ToolbarItem[];
};

export const KEYBOARD_TOOLBAR_TABLE: readonly ToolbarEntry[] = [
  {
    placement: "start",
    group: "Indentation",
    items: [
      { id: "indent", label: "Indent", icon: "indent", command: indentMore },
      { id: "dedent", label: "Dedent", icon: "dedent", command: indentLess },
    ],
  },
  {
    placement: "start",
    items: [
      {
        id: "format",
        label: "Format script",
        icon: "format",
        command: formatDocument,
      },
      {
        id: "writingTools",
        label: "Writing tools",
        icon: "more",
        tool: "writingTools",
      },
    ],
  },
  {
    placement: "center",
    items: [
      { id: "color", color: true },
      { id: "position", position: true },
    ],
  },
  {
    placement: "end",
    items: [
      {
        id: "add",
        label: "Add",
        icon: "plus",
        tool: "add",
        text: true,
      },
    ],
  },
];

const keyboardToolbarTheme = EditorView.baseTheme({
  ".cm-keyboard-toolbar": {
    color: "var(--ink)",
    backgroundColor: "var(--paper)",
    border: "none",
    borderTop: "1px solid var(--edge)",
    padding: "0 4px",
    height: "52px",
    minHeight: "52px",
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: "100",
  },
  ".cm-keyboard-toolbar.cm-keyboard-toolbar-headed > *": {
    visibility: "hidden",
  },
  ".cm-toolbar-placement": {
    display: "flex",
    alignItems: "center",
    flex: "0 1 auto",
    minWidth: "0",
  },
  ".cm-toolbar-group": {
    display: "flex",
    alignItems: "center",
  },
  ".cm-keyboard-toolbar .cm-button": {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    minWidth: "44px",
    minHeight: "44px",
    padding: "0 10px",
    border: "none",
    fontSize: "13px",
    fontFamily: "var(--font-ui)",
    color: "inherit",
    backgroundImage: "none",
    backgroundColor: "transparent",
    boxShadow: "none",
    flexShrink: 0,
    whiteSpace: "nowrap",
    borderRadius: "var(--control-radius)",
    touchAction: "manipulation",
  },
  ".cm-keyboard-toolbar [hidden]": {
    display: "none",
  },
  ".cm-keyboard-toolbar .cm-toolbar-color": {
    display: "flex",
    minWidth: "0",
  },
  ".cm-keyboard-toolbar .cm-button:disabled": {
    color: "var(--muted)",
  },
  ".cm-keyboard-toolbar .cm-toolbar-add": {
    color: "var(--accent)",
    border: "1px solid var(--edge)",
    paddingLeft: "12px",
    paddingRight: "12px",
  },
  ".cm-keyboard-toolbar .cm-toolbar-position": {
    color: "var(--muted)",
    fontSize: "11px",
  },
  ".cm-keyboard-toolbar .cm-toolbar-icon": {
    width: "20px",
    height: "20px",
    display: "inline-block",
    flexShrink: 0,
    backgroundColor: "currentColor",
    maskRepeat: "no-repeat",
    webkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    webkitMaskPosition: "center",
    maskSize: "20px 20px",
    webkitMaskSize: "20px 20px",
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

export interface KeyboardToolbarHold {
  held: boolean;
  headed: boolean;
}

export const setKeyboardToolbarHold = StateEffect.define<KeyboardToolbarHold>();

const keyboardToolbarHold = StateField.define<KeyboardToolbarHold>({
  create: () => ({ held: false, headed: false }),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setKeyboardToolbarHold)) return effect.value;
    }
    return value;
  },
});

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

export interface KeyboardToolbarConfig {
  onTool?: (tool: KeyboardToolbarTool) => void;
  hold?: KeyboardToolbarHold;
}

const keyboardToolbarConfig = Facet.define<
  KeyboardToolbarConfig,
  KeyboardToolbarConfig
>({
  combine: (values) => ({ onTool: values.find((v) => v.onTool)?.onTool }),
});

const positionLabel = (state: EditorState) => {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  return `Line ${line.number}, Col ${head - line.from + 1}`;
};

const headedClass = (state: EditorState) =>
  state.field(keyboardToolbarHold, false)?.headed ?? false;

const colorUnderCaret = (state: EditorState) => {
  const { empty, head } = state.selection.main;
  const info = empty ? changeableColorAt(state, head) : null;
  return info
    ? { color: colorCSS(info), value: state.doc.sliceString(info.from, info.to) }
    : null;
};

function createColorChipHost(view: EditorView) {
  const host = document.createElement("div");
  host.className = "cm-toolbar-color";
  host.dataset["toolbarColor"] = "";
  let shown: string | null = null;
  const sync = (state: EditorState) => {
    const chip = colorUnderCaret(state);
    const key = chip ? `${chip.color} ${chip.value}` : null;
    if (key === shown) return chip != null;
    shown = key;
    host.hidden = !chip;
    render(
      chip
        ? h(CaretColorChip, { ...chip, onClick: () => changeColor(view) })
        : null,
      host,
    );
    return chip != null;
  };
  return { host, sync, destroy: () => render(null, host) };
}

function createToolbarButton(
  view: EditorView,
  item: Exclude<ToolbarItem, ToolbarColorItem>,
) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cm-button";
  if ("position" in item) {
    button.classList.add("cm-toolbar-position");
    button.dataset["toolbarPosition"] = "";
    button.setAttribute("aria-label", "Go to line");
    button.textContent = positionLabel(view.state);
    button.onclick = () => openCustomGotoLinePanel(view);
    return button;
  }
  button.setAttribute("aria-label", view.state.phrase(item.label));
  button.title = "title" in item && item.title ? item.title : item.label;
  const icon = document.createElement("span");
  icon.className = "cm-toolbar-icon";
  icon.style.maskImage = iconMasks[item.icon];
  icon.style.webkitMaskImage = iconMasks[item.icon];
  button.appendChild(icon);
  if ("tool" in item) {
    if (item.text) {
      button.classList.add("cm-toolbar-add");
      const label = document.createElement("span");
      label.textContent = view.state.phrase(item.label);
      button.appendChild(label);
    }
    if (item.disabled) button.disabled = true;
    button.onclick = () => {
      view.state.facet(keyboardToolbarConfig).onTool?.(item.tool);
    };
  } else {
    button.onclick = () => item.command(view);
  }
  return button;
}

function createKeyboardToolbarPanel(view: EditorView): Panel {
  const dom = document.createElement("div");
  dom.className = "cm-toolbar cm-keyboard-toolbar";
  dom.setAttribute("role", "toolbar");
  dom.setAttribute("aria-label", "Writing");
  dom.classList.toggle("cm-keyboard-toolbar-headed", headedClass(view.state));
  const colorChip = createColorChipHost(view);

  const placements = new Map<string, HTMLElement>();
  const placementFor = (placement: string) => {
    let element = placements.get(placement);
    if (!element) {
      element = document.createElement("div");
      element.className = "cm-toolbar-placement";
      element.dataset["toolbarPlacement"] = placement;
      placements.set(placement, element);
      dom.appendChild(element);
    }
    return element;
  };

  for (const entry of KEYBOARD_TOOLBAR_TABLE) {
    const parent = placementFor(entry.placement);
    const target = entry.group
      ? parent.appendChild(document.createElement("div"))
      : parent;
    if (entry.group) {
      target.className = "cm-toolbar-group";
      target.setAttribute("role", "group");
      target.setAttribute("aria-label", entry.group);
    }
    for (const item of entry.items) {
      target.appendChild(
        "color" in item ? colorChip.host : createToolbarButton(view, item),
      );
    }
  }

  const position = dom.querySelector<HTMLElement>("[data-toolbar-position]");
  const syncColor = (state: EditorState) => {
    const chipShown = colorChip.sync(state);
    if (position) position.hidden = chipShown;
  };
  syncColor(view.state);

  return {
    top: false,
    dom,
    update(update: ViewUpdate) {
      if (position && (update.selectionSet || update.docChanged)) {
        position.textContent = positionLabel(update.state);
      }
      syncColor(update.state);
      dom.classList.toggle(
        "cm-keyboard-toolbar-headed",
        headedClass(update.state),
      );
    },
    destroy: colorChip.destroy,
  };
}

export const openKeyboardToolbar: Command = (view) => {
  const data: KeyboardToolbarState = { panel: createKeyboardToolbarPanel };
  const effect =
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

export function hasScriptMode(state: EditorState) {
  return state.field(scriptModeField, false) != null;
}

const wantsToolbar = (view: EditorView) => {
  const mode = view.state.field(scriptModeField, false);
  const { held } = view.state.field(keyboardToolbarHold);
  return mode === "editing" && (held || view.hasFocus);
};

const reconcilePlugin = ViewPlugin.fromClass(
  class {
    scheduled = false;
    destroyed = false;

    constructor(readonly view: EditorView) {
      this.schedule();
    }

    update(update: ViewUpdate) {
      if (
        update.focusChanged ||
        update.transactions.some((tr) =>
          tr.effects.some(
            (effect) =>
              effect.is(setScriptMode) || effect.is(setKeyboardToolbarHold),
          ),
        )
      ) {
        this.schedule();
      }
    }

    schedule() {
      if (this.scheduled) return;
      this.scheduled = true;
      queueMicrotask(() => {
        this.scheduled = false;
        if (this.destroyed || !hasScriptMode(this.view.state)) return;
        const want = wantsToolbar(this.view);
        const open = isKeyboardToolbarOpen(this.view.state);
        if (want && !open) openKeyboardToolbar(this.view);
        else if (!want && open) closeKeyboardToolbar(this.view);
      });
    }

    destroy() {
      this.destroyed = true;
    }
  },
);

export function keyboardToolbar(
  config: KeyboardToolbarConfig = {},
): Extension {
  return [
    keyboardToolbarConfig.of(config),
    keyboardToolbarTheme,
    keyboardToolbarHold.init(
      () => config.hold ?? { held: false, headed: false },
    ),
    reconcilePlugin,
  ];
}
