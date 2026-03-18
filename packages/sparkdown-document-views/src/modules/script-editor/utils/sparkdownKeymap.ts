import { formatDocument } from "@impower/codemirror-vscode-lsp-client/src";

export const sparkdownKeymap = [
  {
    key: "PageUp",
    run: () => {
      // PageUp is used by preview
      return true;
    },
  },
  {
    key: "PageDown",
    run: () => {
      // PageDown is used by preview
      return true;
    },
  },
  { key: "Mod-s", run: formatDocument, preventDefault: true },
] as const;
