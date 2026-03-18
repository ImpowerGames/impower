import { EditorView } from "@codemirror/view";

export const lspTheme = EditorView.baseTheme({
  ".cm-lsp-documentation": {
    "& p": {
      margin: "4px 8px",
    },
    "& code": {
      backgroundColor: "#656c7633",
      padding: "2.72px 5.44px",
      borderRadius: "6px",
    },
    "& kbd": {
      backgroundColor: "#151b23",
      padding: "4",
      borderRadius: "6px",
      border: "solid 1px #3d444db3",
      boxShadow: "inset 0 -1px 0 #3d444db3",
    },
  },

  ".cm-lsp-message button[type=submit]": {
    display: "block",
  },
});
