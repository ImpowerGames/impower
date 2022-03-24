import { CompilerDiagnostic } from "../types/compilerDiagnostic";
import { choose } from "./formatters/choose";
import { pluralize } from "./formatters/pluralize";

const regexes = {
  A: {
    "^[aeiouAEIOU]": "An",
    "": "A",
  },
  a: {
    "^[aeiouAEIOU]": "an",
    "": "a",
  },
};

export type Formatter = (
  value: unknown,
  locale: string,
  ...args: string[]
) => [string, CompilerDiagnostic[]];

export type Formatters = { [formatter: string]: Formatter };

const regex = (
  value: string,
  _locale: string,
  arg: string
): [string, CompilerDiagnostic[]] => {
  const configRegexes = regexes;
  const varRegexes: { [regex: string]: string } = configRegexes?.[arg] || {};
  const varRegexEntries = Object.entries(varRegexes);
  for (let i = 0; i < varRegexEntries.length; i += 1) {
    const [regex, replacement] = varRegexEntries[i];
    if (new RegExp(regex).test(value)) {
      return [replacement, []];
    }
  }
  const result = varRegexes[""];
  return [result, []];
};

const customFormatters: Formatters = {
  regex,
  r: regex,
  choose,
  c: choose,
  pluralize,
  p: pluralize,
};

export const format = (
  str: string,
  args: Record<string, unknown>,
  locale?: string,
  formatters: Formatters = customFormatters
): [string, CompilerDiagnostic[]] => {
  const diagnostics: CompilerDiagnostic[] = [];
  if (!str) {
    return [str, diagnostics];
  }
  let from = 0;
  let to = 0;
  const replacer = (match: string, inner: string): string => {
    const needsTrim = inner.startsWith("{") && inner.endsWith("}");
    from = str.indexOf(match, to) + (needsTrim ? 2 : 1);
    const trimmedInner = needsTrim ? inner.slice(1, -1) : inner;
    const validLocale = locale || (args?.locale as string);
    const chooseVal = args["#"];
    if (
      !trimmedInner.includes(":") &&
      trimmedInner.includes("|") &&
      chooseVal !== undefined
    ) {
      const params = trimmedInner.split("|");
      const matchSeed: string =
        typeof chooseVal === "number"
          ? String(from)
          : (chooseVal[1] || "") + String(from);
      const validChooseVal: [number, string] =
        typeof chooseVal === "number"
          ? [chooseVal, matchSeed]
          : [chooseVal[0], matchSeed];
      const [formatterResult] = choose(validChooseVal, validLocale, ...params);
      return formatterResult;
    }
    const [tagKey, formatterKey, param] = trimmedInner.split(":");
    if (!tagKey) {
      return match;
    }
    to = from + tagKey.length;
    const val = args[tagKey];
    if (val === undefined) {
      diagnostics.push({
        content: str,
        from,
        to,
        severity: "error",
        type: "variable-not-found",
        message: `Cannot find variable named '${tagKey}'`,
      });
    }
    if (!formatterKey) {
      return String(val);
    }
    const formatter = formatters[formatterKey];
    if (formatter && param) {
      const params = param.split("|");
      const [formatterResult, formatterDiagnostics] = formatter(
        val,
        validLocale,
        ...params
      );
      const paramsFrom = to + 1;
      formatterDiagnostics.forEach((d) => {
        diagnostics.push({
          ...d,
          from: paramsFrom + d.from,
          to: paramsFrom + d.to,
        });
      });
      return formatterResult;
    }
    if (!formatter && !param && Array.isArray(val)) {
      const params = formatterKey.split("|");
      const chooseVal = val;
      const matchSeed: string = (chooseVal[1] || "") + String(from);
      const validChooseVal: [number, string] = [chooseVal[0], matchSeed];
      const [formatterResult] = choose(validChooseVal, validLocale, ...params);
      return formatterResult;
    }
    if (!formatter && !param && typeof val === "boolean") {
      const params = formatterKey.split("|");
      const [formatterResult] = choose(val ? 1 : 0, validLocale, ...params);
      if (params.length < 2) {
        diagnostics.push({
          content: formatterKey,
          from: 0,
          to: formatterKey.length,
          severity: "error",
          type: "invalid-formatter-arguments",
          message: `Both options must be specified: false|true`,
        });
      }
      return formatterResult;
    }
    if (!formatter && !param && typeof val === "number") {
      const params = formatterKey.split("|");
      const [formatterResult, formatterDiagnostics] = pluralize(
        val,
        validLocale,
        ...params
      );
      const paramsFrom = to + 1;
      formatterDiagnostics.forEach((d) => {
        diagnostics.push({
          ...d,
          from: paramsFrom + d.from,
          to: paramsFrom + d.to,
        });
      });
      return formatterResult;
    }
    return String(val);
  };
  const result = str.replace(/[{]([{][^\n\r{}]*[}]|[^\n\r{}]*)[}]/g, replacer);
  return [result, diagnostics];
};
