import { Identifier } from "../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { VariableAssignment } from "../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";

/** Whether `obj` is a typed define declaration, the kind
 *  {@link scopeDefineInstances} classifies. A ROOT define has no
 *  `structDefinition` and stays bare. */
export const isScopedDefine = (obj: ParsedObject): obj is VariableAssignment =>
  obj instanceof VariableAssignment &&
  obj.isDefineDeclaration &&
  !!obj.structDefinition;

/** Whether `obj` is a root define declaration (`define game with … end`):
 *  a define with no `as` parent, which declares the type named after it and
 *  keeps its bare global, so no pass classifies it. A structural block
 *  (`animation show`) carries no `structDefinition` either, but is bound to
 *  its synthetic `$<type>_<name>` key from the start, which no script
 *  identifier can spell. */
export const isRootDefine = (obj: ParsedObject): obj is VariableAssignment =>
  obj instanceof VariableAssignment &&
  obj.isDefineDeclaration &&
  !obj.structDefinition &&
  !obj.identifier?.name?.startsWith("$");

/** The global key a define declaration takes under `typeNames`, or undefined
 *  when it lacks a parent or a name (it is then left as it is). Read from the
 *  STABLE bare source (`structDefinition.name`/`.type`), which no pass
 *  rewrites. */
export const scopedDefineKey = (
  obj: VariableAssignment,
  typeNames: ReadonlySet<string>,
): string | undefined => {
  const parentName = obj.structDefinition?.type?.name ?? "";
  const bareName = obj.structDefinition?.name?.name ?? "";
  if (!parentName || !bareName) {
    return undefined;
  }
  return typeNames.has(bareName)
    ? bareName // used as a type somewhere → keep the bare global
    : `$${parentName}_${bareName}`; // leaf instance → scope it
};

/** Gives `obj` the key {@link scopedDefineKey} names, and reports whether
 *  that changed its identifier. `onRename` is given the key it held. */
export const classifyDefine = (
  obj: VariableAssignment,
  typeNames: ReadonlySet<string>,
  onRename?: (previous: Identifier | null) => void,
): boolean => {
  const desired = scopedDefineKey(obj, typeNames);
  if (desired === undefined || obj.identifier?.name === desired) {
    return false;
  }
  onRename?.(obj.identifier);
  obj.identifier = new Identifier(desired);
  return true;
};

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
// bare). Only the VA identifier — the runtime global key resolution reads —
// changes; the struct registration and `__def` args stay keyed by the bare name,
// so `context.T.D` and dialogue-cue resolution are untouched.
//
// The compiler walks the whole tree this way only for the builtins prelude,
// once; the user's defines are found per chunk (`DefineScopeRecord`).
export function scopeDefineInstances(
  roots: readonly ParsedObject[],
  typeNames: ReadonlySet<string>,
  opts?: {
    // Define VAs to leave untouched.
    skip?: ReadonlySet<ParsedObject>;
    // Populated with every define VA this call processes, and every root
    // define it meets (`isRootDefine`), which it leaves as it is.
    collect?: Set<ParsedObject>;
    // Given each define VA whose key this call changed, whose statement the
    // program path's resolver resolves again (`ProgramResolver`).
    renamed?: ParsedObject[];
  },
): void {
  const skip = opts?.skip;
  const collect = opts?.collect;
  const renamed = opts?.renamed;
  const stack: ParsedObject[] = [...roots];
  while (stack.length > 0) {
    const obj = stack.pop()!;
    if (isScopedDefine(obj) && !(skip && skip.has(obj))) {
      collect?.add(obj);
      if (classifyDefine(obj, typeNames)) {
        renamed?.push(obj);
      }
    } else if (isRootDefine(obj) && !(skip && skip.has(obj))) {
      collect?.add(obj);
    }
    const content = obj.content;
    if (content) {
      for (const c of content) stack.push(c);
    }
  }
}
