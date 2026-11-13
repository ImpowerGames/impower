import {
  EditorSelection,
  type Extension,
  Facet,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { EditorView, layer, RectangleMarker } from "@codemirror/view";
import { swatchPressChangesColor } from "@impower/codemirror-vscode-lsp-client/src";

export type ScriptModeValue = "reading" | "editing";

export const setScriptMode = StateEffect.define<ScriptModeValue | null>();

export const scriptModeField = StateField.define<ScriptModeValue | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setScriptMode)) return effect.value;
    }
    return value;
  },
});

export const onReadingDoubleTap = Facet.define<() => void, () => void>({
  combine: (values) => () => values.forEach((fn) => fn()),
});

const moveCaret = (view: EditorView, event: MouseEvent) => {
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos != null) {
    view.dispatch({
      selection: EditorSelection.cursor(pos),
      userEvent: "select.pointer",
    });
  }
  return pos != null;
};

const scriptModeTheme = EditorView.baseTheme({
  ".cm-reading-caret": {
    position: "absolute",
    width: "2px",
    marginLeft: "-1px",
    borderRadius: "1px",
    backgroundColor: "var(--accent)",
    pointerEvents: "none",
  },
  "&.cm-script-editing .cm-status": {
    display: "none",
  },
});

const scriptModeAttributes = EditorView.editorAttributes.compute(
  [scriptModeField],
  (state) => ({
    class: state.field(scriptModeField) === "editing" ? "cm-script-editing" : "",
  }),
);

const readingCaretLayer = layer({
  above: true,
  markers(view) {
    if (view.state.field(scriptModeField, false) !== "reading") return [];
    const main = view.state.selection.main;
    if (!main.empty) return [];
    return RectangleMarker.forRange(
      view,
      "cm-reading-caret",
      EditorSelection.cursor(main.head, main.assoc),
    );
  },
  update(update) {
    return (
      update.docChanged ||
      update.selectionSet ||
      update.geometryChanged ||
      update.viewportChanged ||
      update.transactions.some((tr) =>
        tr.effects.some((effect) => effect.is(setScriptMode)),
      )
    );
  },
  class: "cm-reading-caret-layer",
});

const readingHandlers = EditorView.domEventHandlers({
  click(event, view) {
    if (
      view.state.field(scriptModeField, false) !== "reading" ||
      (event as PointerEvent).pointerType === "mouse"
    ) {
      return false;
    }
    return moveCaret(view, event);
  },
  dblclick(event, view) {
    if (view.state.field(scriptModeField, false) !== "reading") return false;
    moveCaret(view, event);
    view.state.facet(onReadingDoubleTap)();
    return true;
  },
});

export function scriptMode(initial: ScriptModeValue | null = null): Extension {
  return [
    scriptModeField.init(() => initial),
    scriptModeTheme,
    scriptModeAttributes,
    readingCaretLayer,
    readingHandlers,
    swatchPressChangesColor.compute(
      [scriptModeField],
      (state) => state.field(scriptModeField) == null,
    ),
  ];
}
