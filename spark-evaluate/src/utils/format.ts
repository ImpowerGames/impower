import { CUSTOM_FORMATTERS } from "../constants/CUSTOM_FORMATTERS";
import { CompilerDiagnostic } from "../types/CompilerDiagnostic";
import { CompilerReference } from "../types/CompilerReference";
import { CustomFormatter } from "../types/CustomFormatter";
import { choose } from "./formatters/choose";
import { pluralize } from "./formatters/pluralize";

export const format = (
  str: string,
  args: Record<string, unknown> = {},
  locale: string | undefined = undefined,
  formatters: Record<string, CustomFormatter> = CUSTOM_FORMATTERS
): [string, CompilerDiagnostic[], CompilerReference[]] => {
  const possibleValues: CompilerReference[] = [];
  const diagnostics: CompilerDiagnostic[] = [];
  if (!str) {
    return [str, diagnostics, possibleValues];
  }
  let from = 0;
  let to = 0;
  const replacer = (match: string, inner: string): string => {
    const needsTrim = inner.startsWith("{") && inner.endsWith("}");
    from = str.indexOf(match, to) + (needsTrim ? 2 : 1);
    const trimmedInner = needsTrim ? inner.slice(1, -1) : inner;
    const validLocale = locale || (args?.["locale"] as string);
    const chooseVal = args?.["#"];
    if (
      !trimmedInner.includes(":") &&
      trimmedInner.includes("|") &&
      chooseVal !== undefined
    ) {
      const params = trimmedInner.split("|");
      const matchSeed: string = Array.isArray(chooseVal)
        ? (chooseVal[1] || "") + String(from)
        : String(from);
      const validChooseVal: [number, string] = Array.isArray(chooseVal)
        ? [chooseVal[0], matchSeed]
        : [chooseVal, matchSeed];
      const [formatterResult, formatterDiagnostics, ignoreArgs] = choose(
        validChooseVal,
        validLocale,
        ...params
      );
      let paramsFrom = to;
      let paramsTo = paramsFrom;
      formatterDiagnostics.forEach((d) => {
        diagnostics.push({
          ...d,
          from: paramsFrom + 1 + d.from,
          to: paramsFrom + 1 + d.to,
        });
      });
      params.forEach((content, index) => {
        paramsFrom = paramsTo + 1;
        paramsTo = paramsFrom + content.length;
        if (!ignoreArgs?.includes(index)) {
          possibleValues.push({
            content,
            from: paramsFrom,
            to: paramsTo,
          });
        }
      });
      return formatterResult;
    }
    const [tagKey, formatterKey, param] = trimmedInner.split(":");
    if (!tagKey) {
      return match;
    }
    to = from + tagKey.length;
    const val = args?.[tagKey];
    if (val === undefined) {
      diagnostics.push({
        content: str,
        from,
        to,
        severity: "error",
        message: `Cannot find variable named '${tagKey}'`,
      });
    }
    if (!formatterKey) {
      return String(val);
    }
    const formatter = formatters[formatterKey];
    if (formatter && param) {
      const params = param.split("|");
      const [formatterResult, formatterDiagnostics, ignoreArgs] = formatter(
        val,
        validLocale,
        ...params
      );
      let paramsFrom = to;
      let paramsTo = paramsFrom;
      formatterDiagnostics.forEach((d) => {
        diagnostics.push({
          ...d,
          from: paramsFrom + 1 + d.from,
          to: paramsFrom + 1 + d.to,
        });
      });
      params.forEach((content, index) => {
        paramsFrom = paramsTo + 1;
        paramsTo = paramsFrom + content.length;
        if (!ignoreArgs?.includes(index)) {
          possibleValues.push({
            content,
            from: paramsFrom,
            to: paramsTo,
          });
        }
      });
      return formatterResult;
    }
    if (!formatter && !param && Array.isArray(val)) {
      const params = formatterKey.split("|");
      const chooseVal = val;
      const matchSeed: string = (chooseVal[1] || "") + String(from);
      const validChooseVal: [number, string] = [chooseVal[0], matchSeed];
      const [formatterResult, formatterDiagnostics, ignoreArgs] = choose(
        validChooseVal,
        validLocale,
        ...params
      );
      let paramsFrom = to;
      let paramsTo = paramsFrom;
      formatterDiagnostics.forEach((d) => {
        diagnostics.push({
          ...d,
          from: paramsFrom + 1 + d.from,
          to: paramsFrom + 1 + d.to,
        });
      });
      params.forEach((content, index) => {
        paramsFrom = paramsTo + 1;
        paramsTo = paramsFrom + content.length;
        if (!ignoreArgs?.includes(index)) {
          possibleValues.push({
            content,
            from: paramsFrom,
            to: paramsTo,
          });
        }
      });
      return formatterResult;
    }
    if (!formatter && !param && typeof val === "boolean") {
      const params = formatterKey.split("|");
      const [formatterResult, formatterDiagnostics, ignoreArgs] = choose(
        val ? 1 : 0,
        validLocale,
        ...params
      );
      if (params.length < 2) {
        diagnostics.push({
          content: formatterKey,
          from: 0,
          to: formatterKey.length,
          severity: "error",
          message: `Both options must be specified: false|true`,
        });
      }
      let paramsFrom = to;
      let paramsTo = paramsFrom;
      formatterDiagnostics.forEach((d) => {
        diagnostics.push({
          ...d,
          from: paramsFrom + 1 + d.from,
          to: paramsFrom + 1 + d.to,
        });
      });
      params.forEach((content, index) => {
        paramsFrom = paramsTo + 1;
        paramsTo = paramsFrom + content.length;
        if (!ignoreArgs?.includes(index)) {
          possibleValues.push({
            content,
            from: paramsFrom,
            to: paramsTo,
          });
        }
      });
      return formatterResult;
    }
    if (!formatter && !param && typeof val === "number") {
      const params = formatterKey.split("|");
      const [formatterResult, formatterDiagnostics, ignoreArgs] = pluralize(
        val,
        validLocale,
        ...params
      );
      let paramsFrom = to;
      let paramsTo = paramsFrom;
      formatterDiagnostics.forEach((d) => {
        diagnostics.push({
          ...d,
          from: paramsFrom + 1 + d.from,
          to: paramsFrom + 1 + d.to,
        });
      });
      params.forEach((content, index) => {
        paramsFrom = paramsTo + 1;
        paramsTo = paramsFrom + content.length;
        if (!ignoreArgs?.includes(index)) {
          possibleValues.push({
            content,
            from: paramsFrom,
            to: paramsTo,
          });
        }
      });
      return formatterResult;
    }
    return String(val);
  };
  const regex = /[{]([{][^\n\r{}]*[}]|[^\n\r{}]*)[}]/g;
  const result = str.replace(regex, replacer);
  return [result, diagnostics, possibleValues];
};
