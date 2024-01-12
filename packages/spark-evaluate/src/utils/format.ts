import { DEFAULT_REPLACERS } from "../constants/DEFAULT_REPLACERS";
import { Diagnostic } from "../types/Diagnostic";
import { Replacer } from "../types/Replacer";
import { choose } from "./formatters/choose";
import { pluralize } from "./formatters/pluralize";

const PIPE_SEPARATOR_REGEX = /((?<!\\)[|])/;
const SUBSTITUTION_ELEMENT_REGEX = /((?<![$])[{](?:\\.|[^}])*?[}])/g;
const SUBSTITUTION_ELEMENT_CAPTURES_REGEX =
  /([{])(?:([ \t]*)([_a-zA-Z][_a-zA-Z0-9]*)([ \t]*)((?=[}])|[:]))?(?:([ \t]*)([_a-zA-Z][_a-zA-Z0-9]*)([ \t]*)((?=[}])|[:]))?(.*?)((?<!\\)[}])/;

const captureOffset = (captures: string[], captureIndex: number) => {
  return captures.slice(1, captureIndex).join("").length;
};

const select = (
  args: string,
  val: unknown,
  locale: string,
  from: number,
  diagnostics: Diagnostic[],
  references: Diagnostic[],
  formatter: Replacer
) => {
  const separated = args.split(PIPE_SEPARATOR_REGEX);
  const params = separated.filter((s) => s !== "|");
  const [formatterResult, formatterDiagnostics, ignoreArgs] = formatter(
    val,
    locale,
    ...params
  );
  formatterDiagnostics.forEach((d) => {
    diagnostics.push({
      ...d,
      from: from + d.from,
      to: from + d.to,
    });
  });
  separated.forEach((content, index) => {
    if (content !== "|") {
      if (!ignoreArgs?.includes(index)) {
        references.push({
          content,
          from,
          to: from + content.length,
        });
      }
    }
    from += content.length;
  });
  return formatterResult;
};

const replace =
  (
    context: Record<string, unknown>,
    from: number,
    diagnostics: Diagnostic[],
    references: Diagnostic[]
  ) =>
  (element: string) => {
    const captures = element.match(SUBSTITUTION_ELEMENT_CAPTURES_REGEX);
    if (!captures) {
      return element;
    }
    const _3_key = captures[3] || "";
    const _7_replacer = captures[7] || "";
    const _10_args = captures[10] || "";

    const locale = context?.["$locale"];
    const visited = context?.["$visited"];
    const key = context?.["$key"];
    const seed = context?.["$seed"];
    const validLocale = typeof locale === "string" ? locale : "";
    const validVisited = typeof visited === "number" ? visited : 0;

    const replacers = { ...DEFAULT_REPLACERS };
    const customReplacers = context?.["$replacers"];
    if (customReplacers && typeof customReplacers === "object") {
      Object.entries(customReplacers).forEach(([k, v]) => {
        replacers[k] = v;
      });
    }

    if (_10_args && !_3_key && !_7_replacer) {
      const tokenKey = (key || "") + String(from);
      const validChooseVal = [validVisited, tokenKey, seed];
      if (context) {
        context["$formatted_with_visited"] = true;
      }
      return select(
        _10_args,
        validChooseVal,
        validLocale,
        from + captureOffset(captures, 10),
        diagnostics,
        references,
        choose
      );
    }
    if (!_3_key) {
      return element;
    }

    const val = context?.[_3_key];
    if (val === undefined) {
      diagnostics.push({
        content: _3_key,
        from: from + captureOffset(captures, 3),
        to: from + captureOffset(captures, 3) + _3_key.length,
        severity: "error",
        message: `Cannot find variable named '${_3_key}'`,
      });
    } else {
      references.push({
        content: _3_key,
        from: from + captureOffset(captures, 3),
        to: from + captureOffset(captures, 3) + _3_key.length,
      });
    }

    if (!_10_args) {
      if (val === undefined) {
        return "";
      }
      return String(val);
    }
    if (_7_replacer) {
      const replacer = replacers[_7_replacer];
      if (!replacer) {
        diagnostics.push({
          content: _7_replacer,
          from: from + captureOffset(captures, 7),
          to: from + captureOffset(captures, 7) + _7_replacer.length,
          severity: "error",
          message: `Cannot find formatter named '${_7_replacer}'`,
        });
      }
      return select(
        _10_args,
        val,
        validLocale,
        from + captureOffset(captures, 10),
        diagnostics,
        references,
        replacer || choose
      );
    }
    if (val === undefined) {
      const validChooseVal = 0;
      return select(
        _10_args,
        validChooseVal,
        validLocale,
        from + captureOffset(captures, 10),
        diagnostics,
        references,
        choose
      );
    }
    if (Array.isArray(val)) {
      const chooseVal = val;
      const matchSeed: string = (chooseVal[1] || "") + String(from);
      const validChooseVal: [number, string] = [chooseVal[0], matchSeed];
      return select(
        _10_args,
        validChooseVal,
        validLocale,
        from + captureOffset(captures, 10),
        diagnostics,
        references,
        choose
      );
    }
    if (typeof val === "boolean") {
      const validChooseVal = val ? 1 : 0;
      return select(
        _10_args,
        validChooseVal,
        validLocale,
        from + captureOffset(captures, 10),
        diagnostics,
        references,
        choose
      );
    }
    if (typeof val === "number") {
      return select(
        _10_args,
        val,
        validLocale,
        from + captureOffset(captures, 10),
        diagnostics,
        references,
        pluralize
      );
    }
    return String(val);
  };

export const format = (
  str: string,
  context: Record<string, unknown> = {}
): [string, Diagnostic[], Diagnostic[]] => {
  const diagnostics: Diagnostic[] = [];
  const references: Diagnostic[] = [];
  if (!str) {
    return [str, diagnostics, references];
  }
  let from = 0;
  const parts = str.split(SUBSTITUTION_ELEMENT_REGEX).map((element) => {
    const replaced = element.replace(
      SUBSTITUTION_ELEMENT_REGEX,
      replace(context, from, diagnostics, references)
    );
    from += element.length;
    return replaced;
  });

  const result = parts.join("");
  return [result, diagnostics, references];
};
