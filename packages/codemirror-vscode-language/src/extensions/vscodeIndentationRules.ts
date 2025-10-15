import { getIndentUnit, indentService } from "@codemirror/language";
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

export const vscodeIndentationRules = (
  config: VSCodeIndentationRulesConfig = {}
) => [vscodeIndentationRulesConfig.of(config), vscodeIndentService];
