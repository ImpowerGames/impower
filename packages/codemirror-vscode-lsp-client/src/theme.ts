import { EditorView } from "@codemirror/view";

export const lspTheme = EditorView.baseTheme({
  ".cm-lsp-documentation": {
    whiteSpace: "normal",
    "& blockquote, & details, & dl, & ol, & p, & pre, & table, & ul": {
      margin: "4px 0",
    },
    "& code": {
      backgroundColor: "#656c7633",
      padding: "2px 6px",
      borderRadius: "6px",
    },
    "& kbd": {
      backgroundColor: "#151b23",
      padding: "4",
      borderRadius: "6px",
      border: "solid 1px #3d444db3",
      boxShadow: "inset 0 -1px 0 #3d444db3",
    },
    "& blockquote": {
      margin: "0",
      padding: "0 1em",
      color: "#9198a1",
      borderLeft: "0.25em solid #3d444d",
    },
  },

  ".cm-lsp-message button[type=submit]": {
    display: "block",
  },
});
