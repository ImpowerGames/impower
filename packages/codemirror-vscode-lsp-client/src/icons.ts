import { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export type LSPClientIcons = {
  back: string;
  more: string;
  chevronDown: string;
};

const mask = (image: string) => ({
  maskImage: image,
  webkitMaskImage: image,
  maskSize: "contain",
  webkitMaskSize: "contain",
});

export function lspIconTheme(icons: LSPClientIcons): Extension {
  return EditorView.baseTheme({
    ".cm-context-menu .cm-menu-back-icon": mask(icons.back),
    ".cm-context-menu .cm-menu-more-icon": mask(icons.more),
    "& .cm-foldGutter .cm-fold-arrow": mask(icons.chevronDown),
    ".cm-lsp-collapse-icon": mask(icons.chevronDown),
  });
}
