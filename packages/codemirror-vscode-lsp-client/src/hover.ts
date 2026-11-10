import {
  highlightingFor,
  language as languageFacet,
} from "@codemirror/language";
import {
  type EditorState,
  Facet,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  closeHoverTooltips,
  EditorView,
  hasHoverTooltips,
  showTooltip,
  Tooltip,
  ViewPlugin,
  hoverTooltip,
} from "@codemirror/view";
import { highlightCode } from "@lezer/highlight";
import type * as lsp from "vscode-languageserver-protocol";
import { LSPClientExtension } from "./client";
import { LSPPlugin } from "./plugin";
import { coarsePointer } from "./pointer";
import { convertFromPosition } from "./pos";
import { escHTML } from "./text";

const hoverTheme = EditorView.baseTheme({
  ".cm-tooltip:has(> .cm-lsp-hover-card)": {
    border: "1px solid var(--edge)",
    borderRadius: "var(--radius)",
    backgroundColor: "var(--popup)",
    color: "var(--ink)",
    boxShadow: "var(--float-shadow)",
    overflow: "hidden",
  },
  ".cm-lsp-hover-card": {
    boxSizing: "border-box",
    maxWidth: "min(460px, calc(100vw - 24px))",
    padding: "10px 14px",
    font: "400 13px / 1.5 var(--font-ui, inherit)",
  },
  ".cm-lsp-hover-card.cm-lsp-hover-picture": {
    display: "grid",
    gap: "8px",
    width: "290px",
    padding: "12px",
  },
  ".cm-lsp-hover-thumb": {
    display: "flex",
    justifyContent: "center",
    borderRadius: "8px",
    overflow: "hidden",
  },
  ".cm-lsp-hover-thumb img": {
    display: "block",
    maxWidth: "100%",
    maxHeight: "200px",
    height: "auto",
    objectFit: "contain",
  },
  ".cm-lsp-hover-caption": {
    display: "grid",
    gap: "2px",
    minWidth: "0",
  },
  ".cm-lsp-hover-caption code": {
    font: "13px / 1.4 var(--font-script, monospace)",
    color: "var(--ink)",
    overflowWrap: "anywhere",
  },
  ".cm-lsp-hover-value": {
    display: "block",
    font: "13px / 1.4 var(--font-script, monospace)",
    color: "var(--ink)",
    overflowWrap: "anywhere",
  },
  ".cm-lsp-hover-value:not(:last-child)": {
    paddingBottom: "8px",
    marginBottom: "8px",
    borderBottom: "1px solid var(--edge)",
  },
  ".cm-lsp-hover-picture > .cm-lsp-hover-value:not(:last-child)": {
    paddingBottom: "0",
    marginBottom: "0",
    borderBottom: "none",
  },
  "@media (prefers-reduced-motion: no-preference)": {
    ".cm-tooltip:has(> .cm-lsp-hover-card)": {
      animation: "cm-lsp-hover-in 140ms ease",
    },
  },
  "@keyframes cm-lsp-hover-in": {
    from: { opacity: "0" },
    to: { opacity: "1" },
  },
});

export const hoverPreviews = Facet.define<boolean, boolean>({
  combine: (values) => values.at(-1) ?? true,
});

export type HoverValueSource = (expression: string) => Promise<string | null>;

export const hoverValues = Facet.define<
  HoverValueSource,
  HoverValueSource | null
>({
  combine: (values) => values.at(-1) ?? null,
});

const NAME_CHARACTER = /[\p{L}\p{N}_]/u;

export function hoverExpressionAt(
  state: EditorState,
  pos: number,
): { from: number; to: number; text: string } | null {
  const word = state.wordAt(pos);
  if (!word) return null;
  const text = state.sliceDoc(word.from, word.to);
  if (!/^[\p{L}_]/u.test(text)) return null;
  let from = word.from;
  while (from > 0 && state.sliceDoc(from - 1, from) === ".") {
    let start = from - 1;
    while (start > 0 && NAME_CHARACTER.test(state.sliceDoc(start - 1, start))) {
      start -= 1;
    }
    if (start === from - 1) break;
    from = start;
  }
  return { from, to: word.to, text: state.sliceDoc(from, word.to) };
}

const hoverValue = (
  state: EditorState,
  pos: number,
): Promise<{ from: number; to: number; line: string } | null> => {
  const source = state.facet(hoverValues);
  const expression = source ? hoverExpressionAt(state, pos) : null;
  if (!source || !expression) return Promise.resolve(null);
  return source(expression.text).then(
    (value) =>
      value == null
        ? null
        : {
            from: expression.from,
            to: expression.to,
            line: `${expression.text} = ${value}`,
          },
    () => null,
  );
};

const showTapValue = StateEffect.define<Tooltip | null>();

const tapValueTooltip = StateField.define<Tooltip | null>({
  create: () => null,
  update(tooltip, tr) {
    for (const effect of tr.effects) {
      if (effect.is(showTapValue)) return effect.value;
    }
    return tr.docChanged || tr.selection ? null : tooltip;
  },
  provide: (field) => showTooltip.from(field),
});

const tapValues = ViewPlugin.define((view) => {
  let asked = 0;
  return {
    update(update) {
      const tapped = update.transactions.some(
        (tr) => tr.isUserEvent("select.touch") || tr.isUserEvent("select.pointer"),
      );
      const selection = update.state.selection.main;
      if (
        !tapped ||
        !update.state.facet(coarsePointer) ||
        !selection.empty
      ) {
        return;
      }
      const ask = ++asked;
      const state = update.state;
      void hoverValue(state, selection.head).then((value) => {
        if (
          !value ||
          ask !== asked ||
          view.state.doc !== state.doc ||
          !view.state.selection.main.eq(selection)
        ) {
          return;
        }
        view.dispatch({
          effects: showTapValue.of({
            pos: value.from,
            end: value.to,
            above: true,
            create: () => ({ dom: renderHoverCard("", "", false, value.line) }),
          }),
        });
      });
    },
  };
});

const pictureTooltips = new WeakMap<Tooltip, boolean>();

export interface ServerHoversConfig {
  hoverTime?: number;
}

export const closeHoverCards = (view: EditorView) => {
  const hovering = hasHoverTooltips(view.state);
  const tapped = view.state.field(tapValueTooltip, false) != null;
  if (!hovering && !tapped) {
    return false;
  }
  view.dispatch({
    effects: [
      ...(hovering ? [closeHoverTooltips] : []),
      ...(tapped ? [showTapValue.of(null)] : []),
    ],
  });
  return true;
};

const hoverDismissal = [
  EditorView.domEventHandlers({
    keydown(event, view) {
      if (event.key !== "Escape") {
        return false;
      }
      return closeHoverCards(view);
    },
    blur(_event, view) {
      closeHoverCards(view);
      return false;
    },
  }),
  ViewPlugin.define((view) => {
    const onScroll = (event: Event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(".cm-tooltip-hover, .cm-lsp-hover-card")
      ) {
        return;
      }
      closeHoverCards(view);
    };
    window.addEventListener("scroll", onScroll, true);
    return {
      destroy() {
        window.removeEventListener("scroll", onScroll, true);
      },
    };
  }),
];

export function serverHovers(
  config: ServerHoversConfig = {},
): LSPClientExtension {
  return {
    clientCapabilities: {
      textDocument: {
        hover: {
          contentFormat: ["markdown", "plaintext"],
        },
      },
    },
    editorExtension: [
      hoverTheme,
      hoverDismissal,
      tapValueTooltip,
      tapValues,
      hoverTooltip(lspTooltipSource, {
        hideOn: (tr, tooltip) =>
          tr.docChanged ||
          (pictureTooltips.has(tooltip) &&
            pictureTooltips.get(tooltip) !== tr.state.facet(hoverPreviews)),
        hoverTime: config.hoverTime,
      }),
    ],
  };
}

function hoverRequest(plugin: LSPPlugin, pos: number) {
  if (plugin.client.hasCapability("hoverProvider") === false)
    return Promise.resolve(null);
  plugin.client.sync();
  return plugin.client.request<
    lsp.HoverParams,
    lsp.Hover | null,
    typeof lsp.HoverRequest.method
  >("textDocument/hover", {
    position: plugin.toPosition(pos),
    textDocument: { uri: plugin.uri },
  });
}

function lspTooltipSource(
  view: EditorView,
  pos: number,
): Promise<Tooltip | null> {
  if (view.state.facet(coarsePointer)) return Promise.resolve(null);
  const plugin = LSPPlugin.get(view);
  if (!plugin) return Promise.resolve(null);
  return Promise.all([
    hoverRequest(plugin, pos),
    hoverValue(view.state, pos),
  ]).then(([result, value]) => {
    if (!result && !value) return null;
    const from = result?.range
      ? convertFromPosition(view.state.doc, result.range.start)
      : (value?.from ?? pos);
    const to = result?.range
      ? convertFromPosition(view.state.doc, result.range.end)
      : (value?.to ?? pos);
    const html = result ? renderTooltipContent(plugin, result.contents) : "";
    const previews = view.state.facet(hoverPreviews);
    const reference = view.state.sliceDoc(from, to);
    const tooltip: Tooltip = {
      pos: from,
      end: to,
      create: () => ({
        dom: renderHoverCard(html, reference, previews, value?.line),
      }),
      above: true,
    };
    if (/<img[\s>]/i.test(html)) {
      pictureTooltips.set(tooltip, previews);
    }
    return tooltip;
  });
}

function renderHoverCard(
  html: string,
  reference: string,
  previews: boolean,
  valueLine?: string,
): HTMLElement {
  const card = document.createElement("div");
  if (valueLine) {
    const value = document.createElement("code");
    value.className = "cm-lsp-hover-value";
    value.textContent = valueLine;
    card.appendChild(value);
  }
  const content = document.createElement("template");
  content.innerHTML = html;
  const images = Array.from(content.content.querySelectorAll("img"));
  if (images.length === 0) {
    card.className = "cm-lsp-hover-card cm-lsp-hover-tooltip cm-lsp-documentation";
    card.appendChild(content.content);
    return card;
  }
  card.className = "cm-lsp-hover-card cm-lsp-hover-picture";
  if (previews) {
    const thumb = document.createElement("div");
    thumb.className = "cm-lsp-hover-thumb";
    images.forEach((image) => {
      image.removeAttribute("height");
      image.style.removeProperty("height");
      thumb.appendChild(image);
    });
    card.appendChild(thumb);
  }
  const caption = document.createElement("div");
  caption.className = "cm-lsp-hover-caption";
  const code = document.createElement("code");
  code.textContent = reference || images[0]?.getAttribute("alt") || "";
  caption.appendChild(code);
  card.appendChild(caption);
  return card;
}

function renderTooltipContent(
  plugin: LSPPlugin,
  value: string | lsp.MarkupContent | lsp.MarkedString | lsp.MarkedString[],
) {
  if (Array.isArray(value))
    return value.map((m) => renderCode(plugin, m)).join("<br>");
  if (
    typeof value == "string" ||
    (typeof value == "object" && "language" in value)
  )
    return renderCode(plugin, value);
  return plugin.docToHTML(value);
}

function renderCode(plugin: LSPPlugin, code: lsp.MarkedString) {
  if (typeof code == "string") return plugin.docToHTML(code, "markdown");
  let { language, value } = code;
  let lang =
    plugin.client.config.highlightLanguage &&
    plugin.client.config.highlightLanguage(language || "");
  if (!lang) {
    let viewLang = plugin.view.state.facet(languageFacet);
    if (viewLang && (!language || viewLang.name == language)) lang = viewLang;
  }
  if (!lang) return escHTML(value);
  let result = "";
  highlightCode(
    value,
    lang.parser.parse(value),
    { style: (tags) => highlightingFor(plugin.view.state, tags) },
    (text, cls) => {
      result += cls
        ? `<span class="${cls}">${escHTML(text)}</span>`
        : escHTML(text);
    },
    () => {
      result += "<br>";
    },
  );
  return result;
}
