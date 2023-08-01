import { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";

export interface ScrollMarginsConfig {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

export const scrollMargins = (config: ScrollMarginsConfig = {}): Extension => {
  const marginPlugin: Extension = ViewPlugin.fromClass(
    class {
      margin?: { top?: number; bottom?: number; left?: number; right?: number };

      update(_update: ViewUpdate): void {
        this.margin = config;
      }
    },
    {
      provide: (plugin) =>
        EditorView.scrollMargins.of((view) => {
          const value = view.plugin(plugin);
          return {
            ...(value?.margin || {}),
          };
        }),
    }
  );
  return [marginPlugin];
};
