import {
  ChangeDesc,
  EditorState,
  StateEffect,
  StateField,
  TransactionSpec,
} from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";
import { pullInBackground } from "./backgroundPull";
import { LSPClient, LSPClientExtension } from "./client";
import { LSPPlugin } from "./plugin";

const COLOR_SWATCH_CLASS_NAME = "cm-color-swatch";
const COLOR_SWATCH_ALPHA_CLASS_NAME = "cm-color-swatch-alpha";
const COLOR_PICKER_INPUT_CLASS_NAME = "cm-color-picker-input";

const colorSwatchTheme = EditorView.baseTheme({
  [`.${COLOR_PICKER_INPUT_CLASS_NAME}`]: {
    position: "fixed",
    width: "1px",
    height: "1px",
    padding: "0",
    border: "none",
    opacity: "0",
    pointerEvents: "none",
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

  if (s.startsWith("#")) {
    return s.length <= 5 ? "hex-short" : "hex-long";
  }

  const match = s.match(/^([a-z]+)\(/);
  const func = match ? match[1] : "name";

  if (func === "name") {
    return "keyword";
  }

  const isLegacy = s.includes(",");
  const hasAlphaSeparator = s.includes("/");

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

  const bestMatch = presentations.find(
    (p) => getColorPresentationType(p.label) === inputFingerprint,
  );

  if (bestMatch) {
    return bestMatch;
  }

  const baseFunc = inputFingerprint.split("-")[0];
  const looseMatch = presentations.find((p) =>
    getColorPresentationType(p.label).startsWith(baseFunc!),
  );

  return looseMatch ?? presentations[0] ?? null;
}

async function changeDocumentColor(
  view: EditorView,
  info: DocumentColor,
  hex: string,
) {
  const plugin = LSPPlugin.get(view);
  if (!plugin) return;

  const rgb = hexToRGB(hex);

  const color: lsp.Color = {
    red: rgb.r / 255,
    green: rgb.g / 255,
    blue: rgb.b / 255,
    alpha: info.color.alpha,
  };

  const text = view.state.doc.sliceString(info.from, info.to).toLowerCase();

  try {
    const presentations = await plugin.client.request<
      lsp.ColorPresentationParams,
      lsp.ColorPresentation[],
      string
    >("textDocument/colorPresentation", {
      textDocument: { uri: plugin.uri },
      color,
      range: {
        start: plugin.toPosition(info.from),
        end: plugin.toPosition(info.to),
      },
    });

    if (presentations && presentations.length > 0) {
      const bestMatch = getBestPresentationMatch(presentations, text);

      view.dispatch({
        changes: {
          from: info.from,
          to: info.to,
          insert: bestMatch!.label,
        },
      });
    }
  } catch (err) {
    console.error("LSP Color Presentation Error:", err);
  }
}

function openColorPicker(
  view: EditorView,
  info: DocumentColor,
  anchor: HTMLElement,
): HTMLInputElement {
  view.dom
    .querySelectorAll(`.${COLOR_PICKER_INPUT_CLASS_NAME}`)
    .forEach((el) => el.remove());
  const rect = anchor.getBoundingClientRect();
  const picker = document.createElement("input");
  picker.type = "color";
  picker.className = COLOR_PICKER_INPUT_CLASS_NAME;
  picker.tabIndex = -1;
  picker.setAttribute("aria-hidden", "true");
  picker.value = rgbaToHex(colorToRGBA(info.color), false);
  picker.style.left = `${rect.left}px`;
  picker.style.top = `${rect.bottom}px`;
  picker.onchange = () => {
    picker.remove();
    changeDocumentColor(view, info, picker.value);
  };
  picker.onblur = () => picker.remove();
  view.dom.appendChild(picker);
  if (typeof picker.showPicker === "function") {
    try {
      picker.showPicker();
      return picker;
    } catch {
      picker.click();
      return picker;
    }
  }
  picker.click();
  return picker;
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
      from: plugin.fromPosition(c.range.start, plugin.syncedDoc),
      to: plugin.fromPosition(c.range.end, plugin.syncedDoc),
    };
  });
  return result
    .filter(({ from, to }) => from != null && to != null && from <= to)
    .sort((a, b) => a.from - b.from);
}

export function setDocumentColors(
  _state: EditorState,
  colors: DocumentColor[],
): TransactionSpec {
  const effects: StateEffect<unknown>[] = [];
  effects.push(updateColorDecorationEffect.of(colors));
  return { effects };
}

const swatchMark = (info: DocumentColor) =>
  Decoration.mark({
    class:
      info.color.alpha < 1
        ? `${COLOR_SWATCH_CLASS_NAME} ${COLOR_SWATCH_ALPHA_CLASS_NAME}`
        : COLOR_SWATCH_CLASS_NAME,
    attributes: { style: `--swatch: ${rgbaToCSS(colorToRGBA(info.color))}` },
  });

interface DocumentColorSet {
  colors: DocumentColor[];
  decorations: DecorationSet;
}

const mapDocumentColors = (colors: DocumentColor[], changes: ChangeDesc) =>
  colors
    .map((c) => ({
      color: c.color,
      from: changes.mapPos(c.from, 1),
      to: changes.mapPos(c.to, -1),
    }))
    .filter((c) => c.from < c.to);

const documentColorField = StateField.define<DocumentColorSet>({
  create() {
    return { colors: [], decorations: Decoration.none };
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(updateColorDecorationEffect)) {
        const colors = effect.value.filter((c) => c.from < c.to);
        return {
          colors,
          decorations: Decoration.set(
            colors.map((c) => swatchMark(c).range(c.from, c.to)),
            true,
          ),
        };
      }
    }
    if (tr.docChanged) {
      return {
        colors: mapDocumentColors(value.colors, tr.changes),
        decorations: value.decorations.map(tr.changes),
      };
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.decorations),
});

const colorSwatchPress = EditorView.domEventHandlers({
  click(event, view) {
    if (!(event.target instanceof Element)) return false;
    const swatch = event.target.closest<HTMLElement>(
      `.${COLOR_SWATCH_CLASS_NAME}`,
    );
    if (!swatch || !view.contentDOM.contains(swatch)) return false;
    const pos = view.posAtDOM(swatch, 0);
    const info = view.state
      .field(documentColorField)
      .colors.find((c) => c.from <= pos && pos < c.to);
    if (!info) return false;
    openColorPicker(view, info, swatch);
    return false;
  },
});

export async function updateDocumentColors(client: LSPClient, uri: string) {
  let file = client.workspace.getFile(uri);
  if (!file) return;
  const view = file.getView();
  if (!view) return;
  const plugin = LSPPlugin.get(view);
  if (!plugin) return;
  const version = file.version;
  const result = await plugin.client.request<
    lsp.DocumentColorParams,
    lsp.ColorInformation[],
    typeof lsp.DocumentColorRequest.method
  >("textDocument/documentColor", {
    textDocument: { uri },
  });
  if (client.workspace.getFile(uri)?.version !== version) return;
  if (LSPPlugin.get(view) !== plugin) return;
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
        pullInBackground(client, params.textDocument.uri, () =>
          updateDocumentColors(client, params.textDocument.uri),
        );
      },
      "textDocument/didChange": (
        client,
        params: lsp.DidChangeTextDocumentParams,
      ) => {
        pullInBackground(client, params.textDocument.uri, () =>
          updateDocumentColors(client, params.textDocument.uri),
        );
      },
      "textDocument/publishDiagnostics": (
        client,
        params: lsp.PublishDiagnosticsParams,
      ) => {
        pullInBackground(client, params.uri, () =>
          updateDocumentColors(client, params.uri),
        );
      },
    },
    editorExtension: [documentColorField, colorSwatchPress, colorSwatchTheme],
  };
}
