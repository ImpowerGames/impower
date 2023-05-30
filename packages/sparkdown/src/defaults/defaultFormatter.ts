import { CompilerDiagnostic } from "../types/CompilerDiagnostic";

export const defaultFormatter = (
  str: string,
  context?: Record<string, unknown>
): [string, CompilerDiagnostic[], CompilerDiagnostic[]] => {
  const diagnostics: CompilerDiagnostic[] = [];
  const possibleValues: CompilerDiagnostic[] = [];
  if (!str) {
    return [str, diagnostics, possibleValues];
  }
  let from = 0;
  let to = 0;
  const replacer = (match: string, inner: string): string => {
    const needsTrim = inner.startsWith("{") && inner.endsWith("}");
    from = str.indexOf(match, to) + (needsTrim ? 2 : 1);
    const trimmedInner = needsTrim ? inner.slice(1, -1) : inner;
    const [tagKey, formatterKey] = trimmedInner.split(":");
    if (!tagKey) {
      return match;
    }
    to = from + tagKey.length;
    const val = context?.[tagKey];
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
    return match;
  };
  const regex = /[{]([{][^\n\r{}]*[}]|[^\n\r{}]*)[}]/g;
  const result = str.replace(regex, replacer);
  return [result, diagnostics, possibleValues];
};
