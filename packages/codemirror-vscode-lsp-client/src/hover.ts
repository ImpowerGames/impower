import {
  highlightingFor,
  language as languageFacet,
} from "@codemirror/language";
import { EditorView, Tooltip, hoverTooltip } from "@codemirror/view";
import { highlightCode } from "@lezer/highlight";
import type * as lsp from "vscode-languageserver-protocol";
import { LSPClientExtension } from "./client";
import { LSPPlugin } from "./plugin";
import { convertFromPosition } from "./pos";
import { escHTML } from "./text";

const hoverTheme = EditorView.baseTheme({});

export interface ServerHoversConfig {
  hoverTime?: number;
}

/// Create an extension that queries the language server for hover
/// tooltips when the user hovers over the code with their pointer,
/// and displays a tooltip when the server provides one.
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
      hoverTooltip(lspTooltipSource, {
        hideOn: (tr) => tr.docChanged,
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
  const plugin = LSPPlugin.get(view);
  if (!plugin) return Promise.resolve(null);
  return hoverRequest(plugin, pos).then((result) => {
    if (!result) return null;
    return {
      pos: result.range
        ? convertFromPosition(view.state.doc, result.range.start)
        : pos,
      end: result.range
        ? convertFromPosition(view.state.doc, result.range.end)
        : pos,
      create() {
        let elt = document.createElement("div");
        elt.className = "cm-lsp-hover-tooltip cm-lsp-documentation";
        elt.innerHTML = renderTooltipContent(plugin, result.contents);
        return { dom: elt };
      },
      above: true,
    };
  });
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
