import {
  EditorState,
  StateEffect,
  StateField,
  TransactionSpec,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  hoverTooltip,
  Tooltip,
  ViewPlugin,
} from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";
import { LSPClient, LSPClientExtension } from "./client";
import { LSPPlugin } from "./plugin";

const documentLinkTheme = EditorView.baseTheme({
  ".cm-lsp-link span": {
    textDecoration: "underline",
  },
  "@media (hover: hover) and (pointer: fine)": {
    ".cm-mod-pressed .cm-lsp-link:hover span": {
      cursor: "pointer",
      color: "#4daafc",
    },
  },
  ".cm-lsp-link-tooltip": {
    display: "flex",
    flexDirection: "row",
    gap: "4px",
    padding: "5px 9px",
  },
  ".cm-lsp-link-follow": { color: "#4e94ce", cursor: "pointer" },
  ".cm-lsp-link-shortcut": { color: "#808080" },
});

export interface DocumentLink {
  from: number;
  to: number;
  range?: lsp.Range;
  target?: string;
  tooltip?: string;
  data?: any;
}

const updateDocumentLinksEffect = StateEffect.define<DocumentLink[]>({
  map: (value, change) =>
    value.map((v) => ({
      ...v,
      from: change.mapPos(v.from),
      to: change.mapPos(v.to),
    })),
});

const documentLinksState = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(updateDocumentLinksEffect)) {
        const marks = effect.value.map((link) => {
          return Decoration.mark({
            class: "cm-lsp-link",
            range: link.range,
            target: link.target,
            tooltip: link.tooltip,
            data: link.data,
          }).range(link.from, link.to);
        });
        decorations = Decoration.set(marks.sort((a, b) => a.from - b.from));
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function followLink(view: EditorView, link: string) {
  if (link.startsWith("http://") || link.startsWith("https://")) {
    window.open(link, "_blank");
  } else {
    const plugin = LSPPlugin.get(view);
    plugin.client.workspace.displayFile({ uri: link }, "show.file");
  }
}

async function documentLinkTooltipSource(
  view: EditorView,
  pos: number,
): Promise<Tooltip | null> {
  // Iterate through decorations at the hovered position
  const activeDecorations = view.state.field(documentLinksState);
  let foundRange: { from: number; to: number } | null = null;

  let link: lsp.DocumentLink | null = null;
  activeDecorations.between(pos, pos, (f, t, value) => {
    if (value.spec.class === "cm-lsp-link") {
      foundRange = { from: f, to: t };
      link = {
        range: value.spec.range,
        target: value.spec.target,
        tooltip: value.spec.tooltip,
        data: value.spec.data,
      };
      return false;
    }
    return undefined;
  });

  if (!foundRange) {
    return null;
  }

  return {
    pos: foundRange.from,
    end: foundRange.to,
    above: true,
    create(view) {
      const dom = document.createElement("div");
      dom.className = "cm-lsp-link-tooltip";

      const modifier = /Mac/.test(navigator.platform) ? "cmd" : "ctrl";

      const followEl = dom.appendChild(document.createElement("span"));
      followEl.className = "cm-lsp-link-follow";
      followEl.textContent = link.tooltip ?? "Follow Link";
      followEl.onclick = (e) => {
        e.preventDefault();
        if (link.target) {
          followLink(view, link.target);
        } else {
          // Resolve if the target wasn't provided initially
          followEl.style.opacity = "0.5";
          const plugin = LSPPlugin.get(view);
          plugin.client
            .request<
              lsp.DocumentLink,
              lsp.DocumentLink,
              typeof lsp.DocumentLinkResolveRequest.method
            >("documentLink/resolve", link)
            .then((res) => {
              followEl.style.opacity = "1";
              if (res.target) {
                followLink(view, res.target);
              }
            });
        }
      };

      const shortcutEl = dom.appendChild(document.createElement("span"));
      shortcutEl.className = "cm-lsp-link-shortcut";
      shortcutEl.textContent = `(${modifier} + click)`;

      return { dom };
    },
  };
}

const documentLinkHoverTooltip = hoverTooltip(documentLinkTooltipSource, {
  hideOn: (tr) => tr.docChanged,
});

const documentLinkModStylingPlugin = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {
      this.toggleModifier = this.toggleModifier.bind(this);
      window.addEventListener("keydown", this.toggleModifier);
      window.addEventListener("keyup", this.toggleModifier);
    }
    toggleModifier(e: KeyboardEvent) {
      const isModifier = e.ctrlKey || e.metaKey;
      this.view.scrollDOM.classList.toggle("cm-mod-pressed", isModifier);
    }
    destroy() {
      window.removeEventListener("keydown", this.toggleModifier);
      window.removeEventListener("keyup", this.toggleModifier);
    }
  },
);

export function setDocumentLinks(
  _state: EditorState,
  links: DocumentLink[],
): TransactionSpec {
  const effects: StateEffect<unknown>[] = [];
  effects.push(updateDocumentLinksEffect.of(links));
  return { effects };
}

export function convertFromServerDocumentLinks(
  plugin: LSPPlugin,
  links: lsp.DocumentLink[],
) {
  return links.map((l) => ({
    from: plugin.fromPosition(l.range.start, plugin.syncedDoc),
    to: plugin.fromPosition(l.range.end, plugin.syncedDoc),
    target: l.target,
    tooltip: l.tooltip,
    data: l.data,
  }));
}

const documentLinkClickHandler = EditorView.domEventHandlers({
  click(event, view) {
    const plugin = LSPPlugin.get(view);
    if (!plugin) {
      return false;
    }

    if (!event.ctrlKey && !event.metaKey) {
      return false;
    }

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) {
      return false;
    }

    let linkFound = false;
    view.state.field(documentLinksState).between(pos, pos, (_f, _t, value) => {
      const { target, tooltip, data, range } = value.spec;
      if (target) {
        followLink(view, target);
      } else {
        plugin.client
          .request<
            lsp.DocumentLink,
            lsp.DocumentLink,
            typeof lsp.DocumentLinkResolveRequest.method
          >("documentLink/resolve", { target, tooltip, data, range })
          .then((res) => {
            if (res.target) {
              followLink(view, res.target);
            }
          });
        linkFound = true;
      }
    });

    return linkFound;
  },
});

export async function updateDocumentLinks(client: LSPClient, uri: string) {
  let file = client.workspace.getFile(uri);
  if (!file) return;
  const view = file.getView();
  if (!view) return;
  const plugin = LSPPlugin.get(view);
  if (!plugin) return;
  const result = await plugin.client.request<
    lsp.DocumentLinkParams,
    lsp.DocumentLink[] | null,
    typeof lsp.DocumentLinkRequest.method
  >("textDocument/documentLink", {
    textDocument: { uri: plugin.uri },
  });
  view.dispatch(
    setDocumentLinks(
      view.state,
      convertFromServerDocumentLinks(plugin, result),
    ),
  );
}

export function serverDocumentLinks(): LSPClientExtension {
  return {
    clientCapabilities: {
      textDocument: {
        documentLink: {
          tooltipSupport: true,
        },
      },
    },
    notificationListeners: {
      "textDocument/didOpen": (
        client,
        params: lsp.DidOpenTextDocumentParams,
      ) => {
        updateDocumentLinks(client, params.textDocument.uri);
      },
      "textDocument/didChange": (
        client,
        params: lsp.DidChangeTextDocumentParams,
      ) => {
        updateDocumentLinks(client, params.textDocument.uri);
      },
      "textDocument/publishDiagnostics": (
        client,
        params: lsp.PublishDiagnosticsParams,
      ) => {
        updateDocumentLinks(client, params.uri);
      },
    },
    editorExtension: [
      documentLinkHoverTooltip,
      documentLinkModStylingPlugin,
      documentLinksState,
      documentLinkClickHandler,
      documentLinkTheme,
    ],
  };
}
