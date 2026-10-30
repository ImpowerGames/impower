import { indentOnInput, indentService } from "@codemirror/language";
import { Facet, combineConfig } from "@codemirror/state";

const INDENT_REGEX = /([ \t]*)/;

export interface VSCodeIndentationRulesConfig {
  indentationRules?: {
    increaseIndentPattern?: string;
    decreaseIndentPattern?: string;
  };
}

export const vscodeIndentationRulesConfig = Facet.define<
  VSCodeIndentationRulesConfig,
  Required<VSCodeIndentationRulesConfig>
>({
  combine(configs) {
    return combineConfig(configs, {});
  },
});

const vscodeIndentService = indentService.of((context, pos) => {
  const config = context.state.facet(vscodeIndentationRulesConfig);
  const indentationRules = config?.indentationRules;

  const currentLine = context.state.doc.lineAt(pos);
  const lineTextBeforeCursor = context.state.sliceDoc(currentLine.from, pos);
  const lineTextAfterCursor = context.state.sliceDoc(
    pos,
    currentLine.from + currentLine.text.length,
  );

  const currentLineText = currentLine?.text || "";
  const prevIndentSize = currentLineText.match(INDENT_REGEX)?.[0].length ?? 0;

  let newIndentSize = prevIndentSize;

  const increaseIndentPattern = indentationRules?.increaseIndentPattern;
  const isIncrease =
    increaseIndentPattern && lineTextBeforeCursor.match(increaseIndentPattern);
  if (isIncrease) {
    newIndentSize += context.unit;
  }

  const decreaseIndentPattern = indentationRules?.decreaseIndentPattern;
  const isDecrease =
    decreaseIndentPattern && lineTextAfterCursor.match(decreaseIndentPattern);
  if (isDecrease) {
    newIndentSize -= context.unit;
  }

  if (isIncrease || isDecrease) {
    return Math.max(0, newIndentSize);
  }

  return null;
});

export const vscodeIndentationRules = (
  config: VSCodeIndentationRulesConfig = {},
) => [
  vscodeIndentationRulesConfig.of(config),
  vscodeIndentService,
  indentOnInput(),
];
