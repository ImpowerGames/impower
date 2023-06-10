import { openSearchPanel, search } from "@codemirror/search";
import { Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { SearchPanel } from "../panels/SearchTextPanel";

export interface SearchTextConfig {
  onOpen?: (view: EditorView) => void;
  onClose?: (view: EditorView) => void;
}

export const searchTextPanel = (config?: SearchTextConfig): Extension => {
  const { onOpen, onClose, ...other } = config || {};
  const onShortcut = (view: EditorView): boolean => {
    onOpen?.(view);
    return openSearchPanel(view);
  };
  const searchLineKeymap = [
    {
      key: "Alt-f",
      run: onShortcut,
    },
    {
      key: "Ctrl-f",
      run: onShortcut,
    },
  ];
  const searchExtensions = [
    search({
      top: true,
      createPanel: (view: EditorView) => {
        return new SearchPanel(view, {
          onOpen,
          onClose,
        });
      },
      ...other,
    }),
    keymap.of(searchLineKeymap),
  ];
  return searchExtensions;
};
