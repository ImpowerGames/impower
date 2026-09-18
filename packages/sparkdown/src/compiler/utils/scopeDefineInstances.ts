import { Identifier } from "../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { VariableAssignment } from "../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";

// Compile-time post-pass that scopes LEAF-INSTANCE defines to a synthetic
// `$<type>_<name>` global key, leaving TYPE defines (roots, `as`-parents,
// `new X()` targets) on their bare global. The bare name then stays free for
// user `store`/vars (the `store show` vs builtin `animation show` clash class);
// `$` is illegal in a script identifier so the synthetic key never collides.
//
// Classification lives HERE, in a whole-program pass, rather than in per-document
// lowering — because "is this name ever used as a type?" is a whole-PROGRAM
// property. `define X` in one file and `new X()` / `as X` in an included file
// must agree, and per-document lowering can't see across files. `typeNames` is
// the union of `as`-parents + `new`-targets across every involved file.
//
// IDEMPOTENT and re-derivable: it always recomputes the desired key from the
// STABLE bare source (`structDefinition.name`/`.type`, which it never rewrites)
// and sets `identifier` to match. So it's safe to run every compile on the
// SAME cached VariableAssignment objects (a leaf stays scoped; a name that
// GAINED a cross-file type use since the last compile is un-scoped back to
// bare). Only the VA identifier — the runtime global key read by ExportRuntime —
// changes; the struct registration and `__def` args stay keyed by the bare name,
// so `context.T.D` and dialogue-cue resolution are untouched.
export function scopeDefineInstances(
  roots: readonly ParsedObject[],
  typeNames: ReadonlySet<string>,
  opts?: {
    // Define VAs to leave untouched — used to exclude the source-injected
    // builtins prelude from the USER pass, since it's classified separately by
    // its OWN type set (the `character` = type-namespace vs `define character as
    // synth` duality only survives if the user's `as character` doesn't leak
    // into the prelude's classification).
    skip?: ReadonlySet<ParsedObject>;
    // Populated with every define VA this call processes — the prelude pass
    // hands its set to the user pass as `skip`.
    collect?: Set<ParsedObject>;
  },
): void {
  const skip = opts?.skip;
  const collect = opts?.collect;
  const stack: ParsedObject[] = [...roots];
  while (stack.length > 0) {
    const obj = stack.pop()!;
    if (
      obj instanceof VariableAssignment &&
      obj.isDefineDeclaration &&
      obj.structDefinition &&
      !(skip && skip.has(obj))
    ) {
      collect?.add(obj);
      // Typed define. `structDefinition.type` is the parent type; `.name` is
      // the define's own bare name — both stable (never rewritten here). A
      // ROOT define has no structDefinition and is skipped (stays bare).
      const parentName = obj.structDefinition.type?.name ?? "";
      const bareName = obj.structDefinition.name?.name ?? "";
      if (parentName && bareName) {
        const desired = typeNames.has(bareName)
          ? bareName // used as a type somewhere → keep the bare global
          : `$${parentName}_${bareName}`; // leaf instance → scope it
        if (obj.identifier?.name !== desired) {
          obj.identifier = new Identifier(desired);
        }
      }
    }
    const content = obj.content;
    if (content) {
      for (const c of content) stack.push(c);
    }
  }
}
