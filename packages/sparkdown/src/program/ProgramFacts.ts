// The facts a chunk's code reads about a symbol from the symbol table of the
// program being built (docs/engine/binary-program.md, section 1, Identity).
// A chunk's reference table keeps, for each symbol its code refers to, a
// hash of the facts its emission read with the values it read
// (`ProgramEmitter.fact`); the store reads each recorded fact again in the
// next program and keeps the chunk only while every one reads the same. The
// names are what the emit paths and the symbol table share; neither keeps a
// list of what a chunk depends on.

/** What the program defines the symbol as (a `SymbolKind`), or that it does
 *  not define it. */
export const FACT_KIND = "kind";

/** The kind of each of a function's parameters, joined by commas: a value, a
 *  reference, or the `...`. They decide how a call passes its arguments. */
export const FACT_PARAMS = "params";

/** What every fact reads as for a symbol the program does not define. */
export const UNDEFINED_FACT = "undefined";

/** A parameter a call passes a pointer to its argument for. */
export const PARAM_REFERENCE = "ref";

/** A parameter that takes the call's arguments past the fixed ones. */
export const PARAM_VARARGS = "...";

/** A parameter that takes its argument's value. */
export const PARAM_VALUE = "value";

/** The `FACT_PARAMS` of a function whose parameters are `args`: a parameter
 *  declared `ref` takes a pointer, the `...` the rest, and any other its
 *  argument's value, as `Divert.EmitProgram` passes them. */
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
