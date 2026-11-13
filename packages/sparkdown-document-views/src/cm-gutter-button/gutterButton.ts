import { EditorView, ViewPlugin } from "@codemirror/view";
import { coarsePointer } from "@impower/codemirror-vscode-lsp-client/src";

export const GUTTER_GLYPH_SIZE = 16;
export const GUTTER_TOUCH_SIZE = 44;
const FINE_TARGET_OUTSET = 4;

export interface GutterButtonMark {
  icon: string;
  color: string;
  label: string;
  className?: string;
}

export const createGutterButton = (mark: GutterButtonMark): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = "button";
  const glyph = document.createElement("span");
  glyph.className = "cm-gutter-button-glyph";
  glyph.setAttribute("aria-hidden", "true");
  button.append(glyph);
  updateGutterButton(button, mark);
  return button;
};

export const updateGutterButton = (
  button: HTMLElement,
  mark: GutterButtonMark,
) => {
  button.className = mark.className
    ? `cm-gutter-button ${mark.className}`
    : "cm-gutter-button";
  button.setAttribute("aria-label", mark.label);
  button.style.setProperty("--gutter-button-icon", mark.icon);
  button.style.setProperty("--gutter-button-color", mark.color);
};

const gutterPointerAttributes = EditorView.editorAttributes.compute(
  [coarsePointer],
  (state): Record<string, string> =>
    state.facet(coarsePointer) ? { class: "cm-gutter-coarse" } : {},
);

const gutterButtonTheme = EditorView.baseTheme({
  ".cm-gutter-button": {
    position: "relative",
    display: "inline-grid",
    placeItems: "center",
    flex: "none",
    boxSizing: "border-box",
    width: `${GUTTER_GLYPH_SIZE}px`,
    height: `${GUTTER_GLYPH_SIZE}px`,
    minWidth: "0",
    minHeight: "0",
    margin: "0",
    padding: "0",
    border: "none",
    borderRadius: "0",
    outline: "none",
    backgroundColor: "transparent",
    color: "var(--gutter-button-color)",
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
  },
  ".cm-gutterElement:has(> .cm-gutter-button)": {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  "&:not(.cm-gutter-coarse) .cm-gutter-button::after": {
    content: '""',
    position: "absolute",
    inset: `-${FINE_TARGET_OUTSET}px`,
  },
  "&.cm-gutter-coarse .cm-gutter-button": {
    width: `${GUTTER_TOUCH_SIZE}px`,
    height: `${GUTTER_TOUCH_SIZE}px`,
  },
  ".cm-gutter-button-glyph": {
    display: "block",
    boxSizing: "border-box",
    width: `${GUTTER_GLYPH_SIZE}px`,
    height: `${GUTTER_GLYPH_SIZE}px`,
    borderRadius: "var(--radius-sm, 4px)",
    backgroundColor: "transparent",
    pointerEvents: "none",
  },
  ".cm-gutter-button-glyph::before": {
    content: '""',
    display: "block",
    width: "100%",
    height: "100%",
    backgroundColor: "currentColor",
    maskImage: "var(--gutter-button-icon)",
    WebkitMaskImage: "var(--gutter-button-icon)",
    maskSize: "contain",
    WebkitMaskSize: "contain",
    maskPosition: "center",
    WebkitMaskPosition: "center",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
  },
  "@media (hover: hover)": {
    ".cm-gutter-button:hover .cm-gutter-button-glyph": {
      backgroundColor: "color-mix(in srgb, var(--ink) 12%, transparent)",
    },
  },
  ".cm-gutter-button:active .cm-gutter-button-glyph": {
    backgroundColor: "color-mix(in srgb, var(--ink) 22%, transparent)",
  },
  ".cm-gutter-button:focus-visible .cm-gutter-button-glyph": {
    outline: "2px solid var(--accent)",
    outlineOffset: "1px",
  },
});

const exposeGutterButtons = (view: EditorView) => {
  const gutters = view.dom.querySelector(".cm-gutters");
  if (!gutters) {
    return;
  }
  gutters.removeAttribute("aria-hidden");
  for (const column of gutters.querySelectorAll(".cm-gutter")) {
    if (column.querySelector(".cm-gutter-button")) {
      column.removeAttribute("aria-hidden");
    } else {
      column.setAttribute("aria-hidden", "true");
    }
  }
};

const exposeAfterDraw = { key: "gutterButtonAccess", read: () => {}, write: (_: void, view: EditorView) => exposeGutterButtons(view) };

const gutterButtonAccess = ViewPlugin.define((view) => {
  view.requestMeasure(exposeAfterDraw);
  return { update: (update) => update.view.requestMeasure(exposeAfterDraw) };
});

export const gutterButtons = () => [
  gutterPointerAttributes,
  gutterButtonTheme,
  gutterButtonAccess,
];
