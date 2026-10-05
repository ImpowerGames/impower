import type { LuauDiagnostic, LuauToStringOptions } from "./typecheckTestHarness";
import type { NativeCheck, NativeDiagnostic, NativeFixture } from "../analysis-backend/native-conformance/nativeFixture";

// Pinned Error.h enums. These names describe actual scalar discriminants; no
// diagnostic message or printed type is used to reconstruct native error data.
const contexts: Record<string, readonly string[]> = {
  TypeMismatch: ["CovariantContext", "InvariantContext"], UnknownSymbol: ["Binding", "Type"],
  CannotExtendTable: ["Property", "Indexer", "Metatable"], CountMismatch: ["Arg", "FunctionResult", "ExprListResult", "Return"],
  MissingProperties: ["Missing", "Extra"], PropertyAccessViolation: ["CannotRead", "CannotWrite"],
};
const typeFieldName = (kind: string, name: string): string => kind === "TypeMismatch"
  ? name === "wanted" ? "wantedType" : name === "given" ? "givenType" : name : name;
const packFieldName = (kind: string, name: string): string => kind === "TypePackMismatch"
  ? name === "wanted" ? "wantedTp" : name === "given" ? "givenTp" : name : name;

export interface NativeLuauDiagnostic extends LuauDiagnostic {
  /** The original CheckResult.errors position, before any annotation filtering. */
  readonly nativeIndex: number;
}

/** Bounded error fields remain observations of the actual selected native error. */
export function nativeDiagnostic(
  fixture: NativeFixture, result: NativeCheck, error: NativeDiagnostic,
): NativeLuauDiagnostic {
  if (!result.diagnostics.includes(error)) throw Error("Native diagnostic does not belong to this check result");
  // Lazy fields remain native queries, including scalar-only errors. Revalidate
  // the original result on every access; cached fields must not outlive its arena.
  const factsAt = (depth: number) => fixture.errorFacts(result, error.nativeIndex, depth);
  const fields = (depth: number, options: Record<string, LuauToStringOptions> = {}): Record<string, unknown> => {
    const facts = factsAt(depth), out: Record<string, unknown> = { ...facts.fields, ...facts.strings };
    const names = contexts[facts.kind];
    if (names && typeof facts.fields["context"] === "number") {
      const name = names[facts.fields["context"]];
      if (name === undefined) throw Error("Invalid native error context discriminant");
      out["context"] = name;
    }
    const enumField = (field: string, names: readonly string[]) => {
      const ordinal = facts.fields[field];
      if (typeof ordinal !== "number" || !Number.isSafeInteger(ordinal) || names[ordinal] === undefined)
        throw Error("Invalid native " + facts.kind + "." + field + " discriminant");
      out[field] = names[ordinal];
    };
    if (facts.kind === "CannotAssignToNever") enumField("reason", ["PropertyNarrowed"]);
    if (facts.kind === "SwappedGenericTypeParameter") enumField("kind", ["Type", "Pack"]);
    if (facts.kind === "CannotInferBinaryOperation") enumField("kind", ["Operation", "Comparison"]);
    if (facts.kind === "CannotInferBinaryOperation" || facts.kind === "CannotCompareUnrelatedTypes")
      enumField("op", ["Add", "Sub", "Mul", "Div", "FloorDiv", "Mod", "Pow", "Concat", "CompareNe", "CompareEq",
        "CompareLt", "CompareLe", "CompareGt", "CompareGe", "And", "Or"]);
    const supported = new Set<string>();
    for (const [name, type] of Object.entries(facts.types)) {
      const field = typeFieldName(facts.kind, name); supported.add(field);
      out[field] = fixture.printedOptions(type, options[field]);
    }
    for (const [name, pack] of Object.entries(facts.packs)) {
      const field = packFieldName(facts.kind, name); supported.add(field);
      out[field] = fixture.printedOptions(pack, options[field]);
    }
    // The native collection count and each retained TypeId are mandatory facts.
    // Preserve native order; never fill absent observations with an empty list.
    const collections = facts.kind === "CannotAssignToNever" ? ["cause"]
      : facts.kind === "MissingUnionProperty" ? ["missing"]
      : facts.kind === "GenericBoundsMismatch" ? ["lowerBounds", "upperBounds"] : [];
    for (const field of collections) {
      const count = facts.fields[field + "Count"];
      if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 || count > 256)
        throw Error("Absent or invalid native diagnostic collection count: " + field);
      supported.add(field);
      out[field] = Array.from({ length: count }, (_, index) => {
        const type = facts.types[field + ":" + index];
        if (!type) throw Error("Absent native diagnostic collection element: " + field + ":" + index);
        return fixture.printedOptions(type, options[field]);
      });
    }
    for (const name of Object.keys(options))
      if (!supported.has(name)) throw Error("Native diagnostic field is not a type or pack: " + name);
    for (const [name, location] of Object.entries(facts.locations)) {
      const field = name === "previous" ? "previousLocation" : name === "definition" ? "definitionLocation" : name;
      out[field] = location;
    }
    if (facts.kind === "ModuleHasCyclicDependency") out["cycle"] = facts.cycle;
    if (facts.fields["nestedErrorPresent"] === true) {
      if (depth >= 8) throw Error("Native diagnostic nesting exceeds the bounded query contract");
      out["error"] = fields(depth + 1);
    }
    return out;
  };
  return { nativeIndex: error.nativeIndex, module: error.module, code: error.kind, message: error.message,
    line: error.begin.line, column: error.begin.column, endLine: error.end.line, endColumn: error.end.column,
    get data() { return fields(0); }, fields: options => fields(0, options) };
}
