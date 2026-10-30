import { Identifier } from "../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { VariableAssignment } from "../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";

export const isScopedDefine = (obj: ParsedObject): obj is VariableAssignment =>
  obj instanceof VariableAssignment &&
  obj.isDefineDeclaration &&
  !!obj.structDefinition;

export const isRootDefine = (obj: ParsedObject): obj is VariableAssignment =>
  obj instanceof VariableAssignment &&
  obj.isDefineDeclaration &&
  !obj.structDefinition &&
  !obj.identifier?.name?.startsWith("$");

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
    ? bareName
    : `$${parentName}_${bareName}`;
};

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

export function scopeDefineInstances(
  roots: readonly ParsedObject[],
  typeNames: ReadonlySet<string>,
  opts?: {
    skip?: ReadonlySet<ParsedObject>;
    collect?: Set<ParsedObject>;
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
