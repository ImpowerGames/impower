// Shared, mutable registry of the builtin namespace/type ROOT names — the
// top-level keys of the compiled builtins prelude context (color, character,
// animation, image, audio, synth, style, screen, …). These are semi-reserved
// namespaces: a user `store` / `const` that reuses one shadows the builtin
// type table (`color.red`, `animation.shake` read `color` / `animation` as
// bare Luau globals), so `validateDefineTypeShadow` warns on them in addition
// to the in-document define types (`ctx.defineTypeNames`).
//
// Populated by `SparkdownCompiler` the once it compiles the builtins prelude
// (`getCompiledPrelude`), which happens in `mergePreludeContext` — i.e. before
// each compile parses/lowers the user document. Empty until then, which is
// safe: the prelude's own compile has no user globals to check, and any compile
// that reaches user lowering has already run `mergePreludeContext`.
//
// Kept in a DEPENDENCY-FREE module so the lowerer can read it without importing
// `SparkdownCompiler` (which imports the annotator that imports the lowerer —
// an import cycle). See project_define_namespace_scoping.
let _builtinTypeNames: ReadonlySet<string> = new Set();

export const getBuiltinTypeNames = (): ReadonlySet<string> => _builtinTypeNames;

export const setBuiltinTypeNames = (names: Iterable<string>): void => {
  _builtinTypeNames = new Set(names);
};
