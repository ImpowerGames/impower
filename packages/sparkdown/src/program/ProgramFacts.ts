export const FACT_KIND = "kind";

export const FACT_PARAMS = "params";

export const UNDEFINED_FACT = "undefined";

export const PARAM_REFERENCE = "ref";

export const PARAM_VARARGS = "...";

export const PARAM_VALUE = "value";

export const parameterKinds = (
  args:
    | readonly {
        isByReference?: boolean | null;
        isVararg?: boolean | null;
      }[]
    | null
    | undefined,
): string =>
  (args ?? [])
    .map((arg) =>
      arg.isVararg
        ? PARAM_VARARGS
        : arg.isByReference
          ? PARAM_REFERENCE
          : PARAM_VALUE,
    )
    .join(",");
