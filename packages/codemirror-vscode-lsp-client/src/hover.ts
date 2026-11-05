import {
  highlightingFor,
  language as languageFacet,
} from "@codemirror/language";
import { Facet } from "@codemirror/state";
import {
  closeHoverTooltips,
  EditorView,
  hasHoverTooltips,
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
  ".cm-tooltip.cm-tooltip-hover:has(> .cm-lsp-hover-card)": {
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
    font: "400 13px / 1.5 var(--ui-font, inherit)",
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
    font: "13px / 1.4 var(--script-font, monospace)",
    color: "var(--ink)",
    overflowWrap: "anywhere",
  },
  "@media (prefers-reduced-motion: no-preference)": {
    ".cm-tooltip.cm-tooltip-hover:has(> .cm-lsp-hover-card)": {
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

const pictureTooltips = new WeakMap<Tooltip, boolean>();

export interface ServerHoversConfig {
  hoverTime?: number;
}

const closeHover = (view: EditorView) => {
  if (!hasHoverTooltips(view.state)) {
    return false;
  }
  view.dispatch({ effects: closeHoverTooltips });
  return true;
};

const hoverDismissal = [
  EditorView.domEventHandlers({
    keydown(event, view) {
      if (event.key !== "Escape") {
        return false;
      }
      return closeHover(view);
    },
    blur(_event, view) {
      closeHover(view);
      return false;
    },
  }),
  ViewPlugin.define((view) => {
    const onScroll = (event: Event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(".cm-tooltip-hover")
      ) {
        return;
      }
      closeHover(view);
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
  return hoverRequest(plugin, pos).then((result) => {
    if (!result) return null;
    const from = result.range
      ? convertFromPosition(view.state.doc, result.range.start)
      : pos;
    const to = result.range
      ? convertFromPosition(view.state.doc, result.range.end)
      : pos;
    const html = renderTooltipContent(plugin, result.contents);
    const previews = view.state.facet(hoverPreviews);
    const reference = view.state.sliceDoc(from, to);
    const tooltip: Tooltip = {
      pos: from,
      end: to,
      create: () => ({ dom: renderHoverCard(html, reference, previews) }),
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
): HTMLElement {
  const card = document.createElement("div");
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
