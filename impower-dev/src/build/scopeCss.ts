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
            .replace(/(::slotted)[(]\s*(.+)\s*[)]/, "$2")
            .replace(/(:host-context)[(]\s*(.+)\s*[)]/, "$2 __TAGNAME__")
            .replace(/(:host)[(]\s*([^>]+)\s*[)]/, "__TAGNAME__$2")
            .replace(
              /([[a-zA-Z0-9_-]*)(::part)[(]\s*(.+)\s*[)]/,
              '$1 [part*="$3"][part*="$1"]'
            )
            .replace(":host", "__TAGNAME__");
          out = /__TAGNAME__/.test(out)
            ? out.replace(/(.*)__TAGNAME__(.*)/, `$1${scopeTo}$2`)
            : `${scopeTo} ${out}`;

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
