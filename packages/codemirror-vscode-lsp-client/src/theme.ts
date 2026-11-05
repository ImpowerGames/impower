import { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export const lspTheme: Extension = EditorView.baseTheme({
  ".cm-lsp-documentation": {
    whiteSpace: "normal",
    "& blockquote, & details, & dl, & ol, & p, & pre, & table, & ul": {
      margin: "4px 0",
    },
    "& code": {
      backgroundColor: "var(--editor-doc-code)",
      padding: "2px 6px",
      borderRadius: "6px",
    },
    "& kbd": {
      backgroundColor: "var(--editor-doc-keycap)",
      padding: "4",
      borderRadius: "6px",
      border: "solid 1px var(--editor-doc-keycap-edge)",
      boxShadow: "inset 0 -1px 0 var(--editor-doc-keycap-edge)",
    },
    "& blockquote": {
      margin: "0",
      padding: "0 1em",
      color: "var(--editor-doc-quote-ink)",
      borderLeft: "0.25em solid var(--editor-doc-quote-edge)",
    },
  },

  ".cm-lsp-message button[type=submit]": {
    display: "block",
  },

  ".codicon": {
    textAlign: "center",
    padding: 0,
    margin: 0,
    "&::after": {
      display: "block",
      content: "''",
      width: "16px",
      height: "16px",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
      maskRepeat: "no-repeat",
      webkitMaskRepeat: "no-repeat",
      maskPosition: "center",
      webkitMaskPosition: "center",
    },
  },
});
