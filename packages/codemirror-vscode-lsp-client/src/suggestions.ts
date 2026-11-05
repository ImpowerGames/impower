import {
  acceptCompletion,
  closeCompletion,
  Completion,
  completionStatus,
  currentCompletions,
  selectedCompletionIndex,
  setSelectedCompletion,
} from "@codemirror/autocomplete";
import {
  EditorState,
  Extension,
  Prec,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  EditorView,
  keymap,
  Panel,
  showPanel,
  showTooltip,
  Tooltip,
  ViewPlugin,
} from "@codemirror/view";
import { coarsePointer } from "./pointer";

const ROW_HEIGHT = 36;
const VISIBLE_ROWS = 8;
const THUMBNAIL_LOOKAHEAD = 8;

const suggestionsTheme = EditorView.baseTheme({
  ".cm-tooltip.cm-tooltip-autocomplete": {
    backgroundColor: "var(--popup)",
    color: "var(--ink)",
    font: "400 13px / 1.4 var(--font-ui, inherit)",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    boxSizing: "border-box",
    width: "330px",
    maxWidth: "calc(100vw - 24px)",
    maxHeight: `${VISIBLE_ROWS * ROW_HEIGHT + 8}px`,
    padding: "4px",
    fontFamily: "inherit",
    overscrollBehavior: "contain",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    position: "relative",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    boxSizing: "border-box",
    minHeight: `${ROW_HEIGHT}px`,
    padding: "0 10px 0 8px",
    borderRadius: "var(--control-radius)",
    cursor: "default",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]::before": {
    content: "''",
    position: "absolute",
    left: "2px",
    top: "8px",
    bottom: "8px",
    width: "2px",
    borderRadius: "1px",
    backgroundColor: "var(--accent)",
    pointerEvents: "none",
  },
  ".cm-tooltip-autocomplete .cm-completionLabel": {
    flex: "1",
    minWidth: "0",
    font: "14px / 1.3 var(--font-script, monospace)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  ".cm-tooltip-autocomplete .cm-completionDetail": {
    flexShrink: "0",
    maxWidth: "42%",
    marginLeft: "0",
    fontSize: "12px",
    fontStyle: "normal",
    color: "var(--muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  ".cm-tooltip.cm-tooltip-autocomplete::after": {
    content: '"Enter or Tab adds it · Esc closes"',
    display: "block",
    padding: "6px 12px 7px",
    borderTop: "1px solid var(--edge)",
    fontSize: "11px",
    color: "var(--muted)",
  },
  ".cm-tooltip.cm-completionInfo": {
    boxSizing: "border-box",
    width: "280px",
    padding: "12px",
    backgroundColor: "color-mix(in srgb, var(--paper) 60%, var(--panel))",
    color: "var(--ink)",
    font: "400 13px / 1.5 var(--font-ui, inherit)",
  },
  ".cm-tooltip.cm-completionInfo:has(> .cm-lsp-completion-documentation:empty)": {
    display: "none",
  },
  ".cm-tooltip.cm-completionInfo img": {
    display: "block",
    maxWidth: "100%",
    maxHeight: "220px",
    height: "auto",
    margin: "0 auto",
    borderRadius: "8px",
    objectFit: "contain",
  },
  "@media (max-height: 710px)": {
    ".cm-tooltip.cm-completionInfo": {
      display: "none",
    },
  },
  "&.cm-suggestion-chips .cm-tooltip.cm-tooltip-autocomplete": {
    display: "none",
  },
  ".cm-completion-chips": {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    boxSizing: "border-box",
    height: "52px",
    padding: "0 8px",
    borderTop: "1px solid var(--edge)",
    backgroundColor: "var(--popup)",
    overflowX: "auto",
    overscrollBehavior: "contain",
    scrollbarWidth: "none",
    touchAction: "pan-x",
  },
  ".cm-completion-chips::-webkit-scrollbar": {
    display: "none",
  },
  ".cm-completion-chip": {
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    flexShrink: "0",
    boxSizing: "border-box",
    height: "44px",
    maxWidth: "70%",
    padding: "0 14px 0 6px",
    border: "1px solid var(--edge)",
    borderRadius: "22px",
    backgroundColor: "var(--paper)",
    color: "var(--ink)",
    font: "15px / 1 var(--font-script, monospace)",
  },
  ".cm-completion-chip[aria-selected=true]": {
    borderColor: "var(--accent)",
  },
  ".cm-completion-chip .cm-completionIcon": {
    width: "32px",
    minWidth: "32px",
    paddingRight: "0",
  },
  ".cm-completion-chip .cm-completion-thumb": {
    flexShrink: "0",
    width: "32px",
    height: "32px",
    borderRadius: "16px",
    objectFit: "cover",
    objectPosition: "top",
  },
  ".cm-completion-chip .cm-completionLabel": {
    minWidth: "0",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  ".cm-tooltip.cm-suggestions-empty": {
    padding: "10px 14px",
    backgroundColor: "var(--popup)",
    color: "var(--muted)",
    font: "400 13px / 1.4 var(--font-ui, inherit)",
  },
  "@media (prefers-reduced-motion: no-preference)": {
    ".cm-tooltip.cm-tooltip-autocomplete, .cm-tooltip.cm-suggestions-empty": {
      animation: "cm-suggestions-in 140ms ease",
    },
  },
  "@keyframes cm-suggestions-in": {
    from: { opacity: "0" },
    to: { opacity: "1" },
  },
});

const showEmptySuggestions = StateEffect.define<number>();
const hideEmptySuggestions = StateEffect.define<void>();

const emptySuggestions = StateField.define<Tooltip | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(showEmptySuggestions)) {
        const phrase = tr.state.phrase("No suggestions here.");
        return {
          pos: effect.value,
          above: false,
          create: () => {
            const dom = document.createElement("div");
            dom.className = "cm-suggestions-empty";
            dom.setAttribute("role", "status");
            dom.textContent = phrase;
            return { dom };
          },
        };
      }
      if (effect.is(hideEmptySuggestions)) {
        return null;
      }
    }
    if (value && (tr.docChanged || tr.selection)) {
      return null;
    }
    return value;
  },
  provide: (field) => showTooltip.from(field),
});

export function noteEmptySuggestions(view: EditorView, pos: number) {
  view.dispatch({ effects: showEmptySuggestions.of(pos) });
}

const dismissEmptySuggestions = (view: EditorView) => {
  if (!view.state.field(emptySuggestions, false)) {
    return false;
  }
  view.dispatch({ effects: hideEmptySuggestions.of() });
  return true;
};

const emptySuggestionsDismissal = EditorView.domEventHandlers({
  keydown(event, view) {
    return event.key === "Escape" && dismissEmptySuggestions(view);
  },
  blur(_event, view) {
    dismissEmptySuggestions(view);
    return false;
  },
});

const showsChips = (state: EditorState) =>
  state.facet(coarsePointer) &&
  completionStatus(state) === "active" &&
  currentCompletions(state).length > 0;

const completionDocs = new WeakMap<Completion, () => Promise<string | null>>();

export function registerCompletionDocs(
  completion: Completion,
  docs: () => Promise<string | null>,
) {
  completionDocs.set(completion, docs);
}

function thumbnailOf(completion: Completion): Promise<string | null> {
  const docs = completionDocs.get(completion);
  if (!docs) {
    return Promise.resolve(null);
  }
  return docs()
    .then((html) => {
      if (!html) {
        return null;
      }
      const content = document.createElement("template");
      content.innerHTML = html;
      return content.content.querySelector("img")?.getAttribute("src") ?? null;
    })
    .catch(() => null);
}

function createChipsPanel(view: EditorView): Panel {
  const dom = document.createElement("div");
  dom.className = "cm-completion-chips";
  dom.setAttribute("role", "listbox");
  dom.setAttribute("aria-label", view.state.phrase("Suggestions"));
  dom.setAttribute("aria-orientation", "horizontal");
  dom.addEventListener("mousedown", (event) => event.preventDefault());
  dom.addEventListener("click", (event) => {
    const chip =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-index]")
        : null;
    if (!chip) {
      return;
    }
    view.dispatch({ effects: setSelectedCompletion(Number(chip.dataset["index"])) });
    acceptCompletion(view);
  });

  let shown: readonly Completion[] = [];

  const drawChip = (completion: Completion, index: number) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "cm-completion-chip";
    chip.setAttribute("role", "option");
    chip.dataset["index"] = String(index);
    const icon = document.createElement("span");
    icon.className = `cm-completionIcon cm-completionIcon-${completion.type ?? ""}`;
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "cm-completionLabel";
    label.textContent = completion.displayLabel ?? completion.label;
    chip.append(icon, label);
    if (index < THUMBNAIL_LOOKAHEAD) {
      thumbnailOf(completion).then((src) => {
        if (!src || !icon.isConnected) {
          return;
        }
        const thumb = document.createElement("img");
        thumb.className = "cm-completion-thumb";
        thumb.alt = "";
        thumb.src = src;
        icon.replaceWith(thumb);
      });
    }
    return chip;
  };

  const draw = (state: EditorState) => {
    const options = currentCompletions(state);
    if (options !== shown) {
      shown = options;
      dom.replaceChildren(...options.map(drawChip));
      dom.scrollLeft = 0;
    }
    const selected = selectedCompletionIndex(state) ?? 0;
    dom.querySelectorAll<HTMLElement>("[data-index]").forEach((chip) => {
      chip.setAttribute(
        "aria-selected",
        String(Number(chip.dataset["index"]) === selected),
      );
    });
  };

  draw(view.state);
  return {
    dom,
    top: false,
    update: (update) => draw(update.state),
  };
}

const chipsShown = StateField.define<boolean>({
  create: showsChips,
  update: (_value, tr) => showsChips(tr.state),
  provide: (field) =>
    showPanel.from(field, (on) => (on ? createChipsPanel : null)),
});

const chipsClass = EditorView.editorAttributes.of((view) =>
  view.state.facet(coarsePointer) ? { class: "cm-suggestion-chips" } : null,
);

const closeListOnScroll = ViewPlugin.define((view) => {
  const onScroll = (event: Event) => {
    if (
      view.state.facet(coarsePointer) ||
      completionStatus(view.state) !== "active"
    ) {
      return;
    }
    const target = event.target;
    if (target instanceof Element && target.closest(".cm-tooltip")) {
      return;
    }
    closeCompletion(view);
  };
  window.addEventListener("wheel", onScroll, { capture: true, passive: true });
  return {
    destroy() {
      window.removeEventListener("wheel", onScroll, { capture: true });
    },
  };
});

export function suggestions(): Extension {
  return [
    suggestionsTheme,
    emptySuggestions,
    emptySuggestionsDismissal,
    chipsShown,
    chipsClass,
    closeListOnScroll,
    Prec.highest(keymap.of([{ key: "Tab", run: acceptCompletion }])),
  ];
}
