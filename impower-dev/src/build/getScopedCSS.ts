import {
  CssAtRuleAST,
  CssStylesheetAST,
  parse,
  stringify,
} from "@adobe/css-tools";
import convertHostToTagSelectors from "./convertHostToTagSelectors.js";

const scopeRules = (arr: Array<CssAtRuleAST>, scopeTo: string) => {
  arr.forEach((v) => {
    if (v.type === "rule") {
      if (v?.selectors) {
        v.selectors = v.selectors.map((s) => {
          return convertHostToTagSelectors(s, scopeTo);
        });
      }
    } else if ("rules" in v && v.rules) {
      scopeRules(v.rules, scopeTo);
    }
  });
};

const getScopedCSS = (css = "", scopeTo = "", disabled = false) => {
  if (disabled || !scopeTo) {
    return css;
  }
  const ast: CssStylesheetAST = parse(css);
  scopeRules(ast.stylesheet?.rules, scopeTo);
  return stringify(ast);
};

export default getScopedCSS;
