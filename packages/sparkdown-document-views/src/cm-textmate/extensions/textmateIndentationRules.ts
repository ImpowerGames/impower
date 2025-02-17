import { Facet, combineConfig } from "@codemirror/state";
import { getIndentUnit, indentService } from "@codemirror/language";

const INDENT_REGEX = /([ \t]*)/;

export interface TextmateIndentationRulesConfig {
  indentationRules?: {
    increaseIndentPattern?: string;
    decreaseIndentPattern?: string;
  };
}

export const textmateIndentationRulesConfig = Facet.define<
  TextmateIndentationRulesConfig,
  Required<TextmateIndentationRulesConfig>
>({
  combine(configs) {
    return combineConfig(configs, {});
  },
});

const textmateIndentService = indentService.of((context, pos) => {
  const config = context.state.facet(textmateIndentationRulesConfig);
  const indentationRules = config?.indentationRules;

  const beforeLine = pos > 0 ? context.state.doc.lineAt(pos - 1) : undefined;
  const beforeLineText = beforeLine?.text || "";
  const beforeIndentSize = beforeLineText.match(INDENT_REGEX)?.[0].length ?? 0;
  const decreaseIndentPattern = indentationRules?.decreaseIndentPattern;
  const decreasedIndentSize = beforeIndentSize - getIndentUnit(context.state);
  const increasedIndentSize = beforeIndentSize + getIndentUnit(context.state);
  if (decreaseIndentPattern && beforeLineText.match(decreaseIndentPattern)) {
    return decreasedIndentSize;
  }
  const increaseIndentPattern = indentationRules?.increaseIndentPattern;
  if (increaseIndentPattern && beforeLineText.match(increaseIndentPattern)) {
    return increasedIndentSize;
  }
  return null;
});

export const textmateIndentationRules = (
  config: TextmateIndentationRulesConfig = {}
) => [textmateIndentationRulesConfig.of(config), textmateIndentService];
