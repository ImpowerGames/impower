import {
  CssAtRuleAST,
  CssStylesheetAST,
  parse,
  stringify,
} from "@adobe/css-tools";

const scopeRules = (arr: Array<CssAtRuleAST>, scopeTo: string) => {
  arr.forEach((v) => {
    if (v.type === "rule") {
      if (v?.selectors) {
        v.selectors = v.selectors.map((s) => {
          let out = s;
          out = out
            .replace(
              /(:host)[(]\s*([^>{]+)\s*[)](\s*(?:[>]|[{]|$))/g,
              `${scopeTo}$2$3`
            )
            .replace(/(:host)/g, `${scopeTo}`);
          return out;
        });
      }
    } else if ("rules" in v && v.rules) {
      scopeRules(v.rules, scopeTo);
    }
  });
};

const scopeCss = (css = "", scopeTo = "", disabled = false) => {
  if (disabled || !scopeTo) {
    return css;
  }
  const ast: CssStylesheetAST = parse(css);
  scopeRules(ast.stylesheet?.rules, scopeTo);
  return stringify(ast);
};

export default scopeCss;
