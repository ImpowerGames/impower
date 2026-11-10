import { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export type LSPClientIcons = {
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
    "& .cm-foldGutter .cm-fold-arrow": mask(icons.chevronDown),
  });
}
