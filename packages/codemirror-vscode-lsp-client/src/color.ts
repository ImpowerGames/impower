import { EditorState, StateEffect, TransactionSpec } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";
import { LSPClient, LSPClientExtension } from "./client";
import { LSPPlugin } from "./plugin";

export const PICKER_WRAPPER_CLASS_NAME = "cm-color-picker";
export const PICKER_BACKGROUND_CLASS_NAME = "cm-color-picker-background";
export const PICKER_INPUT_CLASS_NAME = "cm-color-picker-input";

export const colorPickerWidgetTheme = EditorView.baseTheme({
  [`.${PICKER_WRAPPER_CLASS_NAME}`]: {
    display: "inline-block",
    cursor: "pointer",
    border: "1px solid #888",
    margin: "0 4px",
    height: "14px",
    width: "14px",
    position: "relative",
    borderRadius: "2px",
  },
  [`.${PICKER_BACKGROUND_CLASS_NAME}`]: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    borderRadius: "1px",
  },
  [`.${PICKER_INPUT_CLASS_NAME}`]: {
    position: "absolute",
    top: 0,
    left: 0,
    opacity: 0,
    width: "100%",
    height: "100%",
    cursor: "pointer",
  },
});

export interface DocumentColor {
  from: number;
  to: number;
  color: lsp.Color;
}

function numberToHex(c: number) {
  return Math.round(c).toString(16).padStart(2, "0");
}

export function colorToRGBA(color: lsp.Color): {
  r: number;
  g: number;
  b: number;
  a: number;
} {
  const r = color.red * 255;
  const g = color.green * 255;
  const b = color.blue * 255;
  const a = color.alpha;
  return { r, g, b, a };
}

export function rgbaToHex(
  rgba: {
    r: number;
    g: number;
    b: number;
    a: number;
  },
  includeAlpha: boolean,
): string {
  if (!includeAlpha || rgba.a === 1) {
    return `#${numberToHex(rgba.r)}${numberToHex(rgba.g)}${numberToHex(rgba.b)}`;
  }
  return `#${numberToHex(rgba.r)}${numberToHex(rgba.g)}${numberToHex(rgba.b)}${numberToHex(rgba.a)}`;
}

export function hexToRGB(hex: string): { r: number; g: number; b: number } {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

export function rgbaToCSS(rgba: {
  r: number;
  g: number;
  b: number;
  a: number;
}) {
  return `rgb(${rgba.r} ${rgba.g} ${rgba.b} / ${rgba.a * 100}%)`;
}

export function getColorPresentationType(text: string) {
  const s = text.trim().toLowerCase();

  // 1. Handle Hex
  if (s.startsWith("#")) {
    // Distinguish between shorthand (#f00) and full (#ff0000)
    return s.length <= 5 ? "hex-short" : "hex-long";
  }

  // 2. Extract function name (rgb, rgba, hsl, hsla, etc.)
  const match = s.match(/^([a-z]+)\(/);
  const func = match ? match[1] : "name";

  if (func === "name") {
    return "keyword";
  }

  // 3. Detect Separator Style
  const isLegacy = s.includes(","); // Commas = Legacy
  const hasAlphaSeparator = s.includes("/"); // Slash = Modern Alpha

  // 4. Create a unique key for this specific syntax "flavor"
  // Example: "rgba-legacy" or "rgb-modern-alpha"
  return `${func}-${isLegacy ? "legacy" : "modern"}-${hasAlphaSeparator ? "alpha" : "noalpha"}`;
}

export function getBestPresentationMatch(
  presentations: lsp.ColorPresentation[],
  text: string,
): lsp.ColorPresentation | null {
  if (presentations.length === 0) {
    return { label: text };
  }
  const inputFingerprint = getColorPresentationType(text);

  // Try to find a perfect structural match
  const bestMatch = presentations.find(
    (p) => getColorPresentationType(p.label) === inputFingerprint,
  );

  if (bestMatch) {
    return bestMatch;
  }

  // Fallback: If no perfect match (e.g. user had hsla legacy but server only offers hsl modern),
  // try to at least match the base function (hsl/rgb/hex)
  const baseFunc = inputFingerprint.split("-")[0];
  const looseMatch = presentations.find((p) =>
    getColorPresentationType(p.label).startsWith(baseFunc),
  );

  return looseMatch ?? presentations[0];
}

export default class ColorPickerWidget extends WidgetType {
  private readonly info: DocumentColor;

  constructor(info: DocumentColor) {
    super();
    this.info = info;
  }

  override eq(other: ColorPickerWidget) {
    return (
      other.info.color.red === this.info.color.red &&
      other.info.color.green === this.info.color.green &&
      other.info.color.blue === this.info.color.blue &&
      other.info.color.alpha === this.info.color.alpha
    );
  }

  override toDOM(view: EditorView) {
    const wrapper = document.createElement("span");
    wrapper.className = PICKER_WRAPPER_CLASS_NAME;

    const rgba = colorToRGBA(this.info.color);

    const backgroundColor = rgbaToCSS(rgba);

    const backgroundSpan = document.createElement("span");
    backgroundSpan.className = PICKER_BACKGROUND_CLASS_NAME;
    backgroundSpan.style.backgroundColor = backgroundColor;
    wrapper.appendChild(backgroundSpan);

    const picker = document.createElement("input");
    picker.className = PICKER_INPUT_CLASS_NAME;
    picker.type = "color";
    picker.value = rgbaToHex(rgba, false);

    picker.onmousedown = (e) => {
      e.stopPropagation();
    };

    picker.oninput = (e) => {
      const hex = (e.target as HTMLInputElement).value;
      const rgb = hexToRGB(hex);
      const backgroundColor = rgbaToCSS({ ...rgb, a: rgba.a });
      backgroundSpan.style.backgroundColor = backgroundColor;
    };

    picker.onchange = (e) => {
      const hex = (e.target as HTMLInputElement).value;
      const rgb = hexToRGB(hex);
      const backgroundColor = rgbaToCSS({ ...rgb, a: rgba.a });
      backgroundSpan.style.backgroundColor = backgroundColor;
      this.handleColorChange(view, hex, this.info.color.alpha);
    };

    wrapper.appendChild(picker);
    return wrapper;
  }

  override ignoreEvent(event: Event) {
    if (
      event.target instanceof HTMLInputElement &&
      event.target.type === "color"
    ) {
      return false;
    }

    const handledEvents = [
      "mousedown",
      "mouseup",
      "click",
      "mousemove",
      "touchstart",
    ];
    if (handledEvents.includes(event.type)) {
      return false;
    }

    return true;
  }

  private async handleColorChange(
    view: EditorView,
    hex: string,
    alpha: number,
  ) {
    const plugin = LSPPlugin.get(view);
    if (!plugin) return;

    const rgb = hexToRGB(hex);

    const color: lsp.Color = {
      red: rgb.r / 255,
      green: rgb.g / 255,
      blue: rgb.b / 255,
      alpha: alpha,
    };

    const text = view.state.doc
      .sliceString(this.info.from, this.info.to)
      .toLowerCase();

    try {
      const presentations = await plugin.client.request<
        lsp.ColorPresentationParams,
        lsp.ColorPresentation[],
        string
      >("textDocument/colorPresentation", {
        textDocument: { uri: plugin.uri },
        color,
        range: {
          start: plugin.toPosition(this.info.from),
          end: plugin.toPosition(this.info.to),
        },
      });

      if (presentations && presentations.length > 0) {
        const bestMatch = getBestPresentationMatch(presentations, text);

        view.dispatch({
          changes: {
            from: this.info.from,
            to: this.info.to,
            insert: bestMatch.label,
          },
        });
      }
    } catch (err) {
      console.error("LSP Color Presentation Error:", err);
    }
  }
}

const updateColorDecorationEffect = StateEffect.define<DocumentColor[]>({
  map: (value, change) =>
    value.map((v) => ({
      color: v.color,
      from: change.mapPos(v.from),
      to: change.mapPos(v.to),
    })),
});

export function convertFromServerColors(
  plugin: LSPPlugin,
  infos: lsp.ColorInformation[],
): DocumentColor[] {
  const result: DocumentColor[] = infos.map((c): DocumentColor => {
    return {
      color: c.color,
      from: plugin.unsyncedChanges.mapPos(
        plugin.fromPosition(c.range.start, plugin.syncedDoc),
      ),
      to: plugin.unsyncedChanges.mapPos(
        plugin.fromPosition(c.range.end, plugin.syncedDoc),
      ),
    };
  });
  return result
    .filter(({ from, to }) => from != null && to != null && from <= to)
    .sort((a, b) => a.from - b.from);
}

export function setDocumentColors(
  state: EditorState,
  colors: DocumentColor[],
): TransactionSpec {
  const effects: StateEffect<unknown>[] = [];
  effects.push(updateColorDecorationEffect.of(colors));
  return { effects };
}

const colorPickerPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor() {
      this.decorations = Decoration.none;
    }

    update(update: ViewUpdate) {
      for (let tr of update.transactions) {
        for (let e of tr.effects) {
          if (e.is(updateColorDecorationEffect)) {
            this.decorations = Decoration.set(
              e.value.map((r) =>
                Decoration.widget({
                  widget: new ColorPickerWidget(r),
                  side: 1,
                }).range(r.from),
              ),
            );
          }
        }
      }

      if (update.docChanged) {
        this.decorations = this.decorations.map(update.changes);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

export async function updateDocumentColors(client: LSPClient, uri: string) {
  let file = client.workspace.getFile(uri);
  if (!file) return;
  const view = file.getView();
  if (!view) return;
  const plugin = LSPPlugin.get(view);
  if (!plugin) return;
  const result = await plugin.client.request<
    lsp.DocumentColorParams,
    lsp.ColorInformation[],
    typeof lsp.DocumentColorRequest.method
  >("textDocument/documentColor", {
    textDocument: { uri },
  });
  view.dispatch(
    setDocumentColors(view.state, convertFromServerColors(plugin, result)),
  );
}

export function serverColorDecorations(): LSPClientExtension {
  return {
    clientCapabilities: {
      textDocument: {
        colorProvider: {},
      },
    },
    notificationListeners: {
      "textDocument/didOpen": (
        client,
        params: lsp.DidOpenTextDocumentParams,
      ) => {
        updateDocumentColors(client, params.textDocument.uri);
      },
      "textDocument/didChange": (
        client,
        params: lsp.DidChangeTextDocumentParams,
      ) => {
        updateDocumentColors(client, params.textDocument.uri);
      },
      "textDocument/publishDiagnostics": (
        client,
        params: lsp.PublishDiagnosticsParams,
      ) => {
        updateDocumentColors(client, params.uri);
      },
    },
    editorExtension: [colorPickerPlugin, colorPickerWidgetTheme],
  };
}
