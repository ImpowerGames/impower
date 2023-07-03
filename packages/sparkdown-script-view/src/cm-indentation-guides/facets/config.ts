import { combineConfig, Facet } from "@codemirror/state";

export interface IndentationMarkerConfiguration {
  /**
   * Determines whether active block marker is styled differently.
   */
  highlightActiveBlock?: boolean;

  /**
   * Determines whether markers in the first column are omitted.
   */
  hideFirstIndent?: boolean;
}

export const indentationMarkerConfig = Facet.define<
  IndentationMarkerConfiguration,
  Required<IndentationMarkerConfiguration>
>({
  combine(configs) {
    return combineConfig(configs, {
      highlightActiveBlock: true,
      hideFirstIndent: false,
    });
  },
});
